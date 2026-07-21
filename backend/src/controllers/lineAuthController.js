const Participant = require('../models/participant');
const { createLineAuthorizationRequest, resolveLineIdentity } = require('../utils/lineSecurity');
const { revealParticipantObject } = require('../utils/fieldEncryption');
const {
  assertParticipantStepUpToken,
  issueParticipantSessionToken,
  participantSessionPayload,
  revokeParticipantSessions,
} = require('../utils/participantTokens');
const auditLog = require('../helpers/auditLog');

exports.startLineLogin = async (req, res) => {
  try {
    const state = await createLineAuthorizationRequest({
      redirectUri: req.body?.redirectUri,
      action: req.body?.action || 'login',
      eventId: req.body?.eventId || null,
      eventYear: req.body?.eventYear || '',
    });
    auditLog({ req, action: 'PARTICIPANT_LINE_OAUTH_START', detail: `action=${req.body?.action || 'login'}` });
    return res.json({ success: true, data: state });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

exports.startLineLink = async (req, res) => {
  try {
    if (!req.participant) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    assertParticipantStepUpToken(req.body?.stepUpToken, req.participant, 'line_link');
    const state = await createLineAuthorizationRequest({
      redirectUri: req.body?.redirectUri,
      action: 'link',
      participantId: req.participant._id,
      eventId: req.participant.eventId || null,
      eventYear: req.participant.eventYear || '',
    });
    auditLog({ req, action: 'PARTICIPANT_LINE_LINK_OAUTH_START', detail: `participantId=${req.participant._id}` });
    return res.json({ success: true, data: state });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

async function applyLineIdentityToParticipant(participant, lineIdentity) {
  const lineUserId = lineIdentity.lineUserId;
  const existingUser = await Participant.findOne({ lineUserId, isDeleted: false, isRevoked: { $ne: true } });
  if (existingUser && String(existingUser._id) !== String(participant._id)) {
    const err = new Error('This LINE account is already linked to another user');
    err.statusCode = 400;
    throw err;
  }

  participant.lineUserId = lineUserId;
  participant.lineDisplayName = lineIdentity.displayName || '';
  participant.linePictureUrl = lineIdentity.pictureUrl || '';
  participant.lineLinkedAt = new Date();
  participant.lineUnlinkedAt = null;
  participant.isLineLinked = true;
  participant.authProvider = participant.authProvider || 'email';
  participant.authProviders = [...new Set([...(participant.authProviders || ['email']), 'line'])];
  participant.participantTokenVersion = Number(participant.participantTokenVersion || 0) + 1;
  await participant.save();
}

exports.linkLineAccount = async (req, res) => {
  try {
    if (!req.participant) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    assertParticipantStepUpToken(req.body?.stepUpToken, req.participant, 'line_link');
    const lineIdentity = await resolveLineIdentity(req.body);
    await applyLineIdentityToParticipant(req.participant, lineIdentity);

    const { token, session } = await issueParticipantSessionToken(req.participant, req, { provider: req.participantAuthPayload?.provider || 'email' });
    await revokeParticipantSessions(req.participant._id, { exceptSessionId: session._id, reason: 'line_link_reauth' });
    auditLog({ req, action: 'PARTICIPANT_LINE_LINK', detail: `participantId=${req.participant._id}` });
    res.json({ success: true, message: 'LINE account linked successfully', token, session: participantSessionPayload(session) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

exports.unlinkLineAccount = async (req, res) => {
  try {
    if (!req.participant) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    assertParticipantStepUpToken(req.body?.stepUpToken, req.participant, 'line_unlink');

    req.participant.lineUserId = undefined;
    req.participant.lineDisplayName = '';
    req.participant.linePictureUrl = '';
    req.participant.lineUnlinkedAt = new Date();
    req.participant.isLineLinked = false;
    req.participant.authProviders = (req.participant.authProviders || ['email']).filter((provider) => provider !== 'line');
    if (!req.participant.authProviders.includes('email')) req.participant.authProviders.push('email');
    req.participant.participantTokenVersion = Number(req.participant.participantTokenVersion || 0) + 1;
    await req.participant.save();

    const { token, session } = await issueParticipantSessionToken(req.participant, req, { provider: 'email' });
    await revokeParticipantSessions(req.participant._id, { exceptSessionId: session._id, reason: 'line_unlink_reauth' });
    auditLog({ req, action: 'PARTICIPANT_LINE_UNLINK', detail: `participantId=${req.participant._id}` });
    res.json({ success: true, message: 'LINE account unlinked successfully', token, session: participantSessionPayload(session) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

exports.lineLogin = async (req, res) => {
  try {
    const lineIdentity = await resolveLineIdentity(req.body);

    if (lineIdentity.oauthState?.action === 'link' && lineIdentity.oauthState?.participantId) {
      const participant = await Participant.findOne({
        _id: lineIdentity.oauthState.participantId,
        isDeleted: false,
        isRevoked: { $ne: true },
      }).select('+secureIndex +secureSearch');
      if (!participant) {
        return res.status(404).json({ success: false, message: 'Participant not found' });
      }
      await applyLineIdentityToParticipant(participant, lineIdentity);
      const { token, session } = await issueParticipantSessionToken(participant, req, { provider: 'line' });
      await revokeParticipantSessions(participant._id, { exceptSessionId: session._id, reason: 'line_link_oauth' });
      const safeParticipant = revealParticipantObject(participant);
      auditLog({ req, action: 'PARTICIPANT_LINE_LINK_OAUTH_COMPLETE', detail: `participantId=${participant._id}` });
      return res.json({
        success: true,
        data: {
          token,
          session: participantSessionPayload(session),
          participant: {
            id: participant._id,
            fields: safeParticipant.fields || {},
            eventId: participant.eventId,
            eventYear: participant.eventYear,
            status: participant.status,
            authProviders: participant.authProviders || [],
            isLineLinked: participant.isLineLinked,
            lineProfile: {
              displayName: participant.lineDisplayName || '',
              pictureUrl: participant.linePictureUrl || '',
            },
          },
        },
      });
    }

    const filter = { lineUserId: lineIdentity.lineUserId, isLineLinked: true, isDeleted: false, isRevoked: { $ne: true } };
    const requestedEventId = req.body?.eventId || lineIdentity.oauthState?.eventId || null;
    const requestedEventYear = req.body?.eventYear || lineIdentity.oauthState?.eventYear || '';
    if (requestedEventId) filter.eventId = requestedEventId;
    else if (requestedEventYear) filter.eventYear = requestedEventYear;
    const participant = await Participant.findOne(filter);
    if (!participant) {
      return res.status(404).json({ success: false, message: 'User not found or LINE not linked' });
    }

    participant.lineDisplayName = lineIdentity.displayName || participant.lineDisplayName || '';
    participant.linePictureUrl = lineIdentity.pictureUrl || participant.linePictureUrl || '';
    participant.lastLoginAt = new Date();
    participant.authProviders = [...new Set([...(participant.authProviders || ['email']), 'line'])];
    await participant.save();

    const { token, session } = await issueParticipantSessionToken(participant, req, { provider: 'line' });
    const safeParticipant = revealParticipantObject(participant);
    auditLog({ req, action: 'PARTICIPANT_LINE_LOGIN', detail: `participantId=${participant._id}` });
    res.json({
      success: true,
      data: {
        token,
        session: participantSessionPayload(session),
        participant: {
          id: participant._id,
          fields: safeParticipant.fields || {},
          eventId: participant.eventId,
          eventYear: participant.eventYear,
          status: participant.status,
          authProviders: participant.authProviders || [],
          isLineLinked: participant.isLineLinked,
          lineProfile: {
            displayName: participant.lineDisplayName || '',
            pictureUrl: participant.linePictureUrl || '',
          },
        },
      },
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

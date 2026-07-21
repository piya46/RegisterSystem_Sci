const Participant = require('../models/participant');
const { revealParticipantObject } = require('../utils/fieldEncryption');
const { resolveLineIdentity, verifyLineWebhookSignature } = require('../utils/lineSecurity');
const { issueParticipantSessionToken, participantSessionPayload } = require('../utils/participantTokens');
const auditLog = require('../helpers/auditLog');

// Placeholder for LINE Messaging API SDK
// const line = require('@line/bot-sdk');

exports.lineLogin = async (req, res) => {
  try {
    const lineIdentity = await resolveLineIdentity(req.body);

    // Find participant linked to this LINE ID in the given event
    const filter = { lineUserId: lineIdentity.lineUserId, isLineLinked: true, isDeleted: false, isRevoked: { $ne: true } };
    const eventId = req.body?.eventId || lineIdentity.oauthState?.eventId || null;
    const eventYear = req.body?.eventYear || lineIdentity.oauthState?.eventYear || '';
    if (eventId) filter.eventId = eventId;
    else if (eventYear) filter.eventYear = eventYear;
    const participant = await Participant.findOne(filter);

    if (!participant) {
      // Return a status indicating they need to register or link account
      return res.json({
        success: true,
        isRegistered: false,
        message: 'ยังไม่ได้ลงทะเบียนในระบบ กรุณาลงทะเบียนหรือเชื่อมโยงบัญชี'
      });
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
      isRegistered: true,
      token,
      session: participantSessionPayload(session),
      participant: {
        id: participant._id,
        fields: safeParticipant.fields || {},
        eventId: participant.eventId,
        eventYear: participant.eventYear,
        status: participant.status,
        lineProfile: {
          displayName: lineIdentity.displayName || '',
          pictureUrl: lineIdentity.pictureUrl || '',
        }
      }
    });
  } catch (err) {
    console.error('LINE Login Error:', err);
    res.status(err.statusCode || 500).json({ success: false, message: err.statusCode ? err.message : 'Internal Server Error' });
  }
};

exports.lineWebhook = async (req, res) => {
  try {
    if (!verifyLineWebhookSignature(req)) {
      return res.status(401).send('Invalid signature');
    }
    const events = req.body.events;
    if (!events || events.length === 0) {
      return res.status(200).send('OK');
    }

    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text;
        const replyToken = event.replyToken;
        const userId = event.source.userId;

        // Placeholder for replying to messages
        console.log(`Received message from ${userId}: ${text}`);
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('LINE Webhook Error:', err);
    res.status(500).send('Error');
  }
};

const crypto = require('crypto');
const mongoose = require('mongoose');
const Participant = require('../models/participant');
const ParticipantAuthChallenge = require('../models/participantAuthChallenge');
const ParticipantSession = require('../models/participantSession');
const auditLog = require('../helpers/auditLog');
const { getEventContextFromRequest, normalizeEventYear } = require('../utils/eventYear');
const { participantFieldMatch, revealParticipantObject } = require('../utils/fieldEncryption');
const { generateOTP, generateRef, hashOTP, verifyOTP } = require('../utils/otp');
const sendMail = require('../utils/sendMail');
const { lineLoginEnabled } = require('../utils/lineSecurity');
const { boolEnv } = require('../utils/cloudCostGuardrail');
const { emailDeliveryConfigured, emailFeatureEnabled } = require('../utils/emailProviderConfig');
const {
  assertParticipantStepUpToken,
  issueParticipantSessionToken,
  issueParticipantStepUpToken,
  participantSessionPayload,
  refreshParticipantSessionToken,
  revokeParticipantSession,
  revokeParticipantSessions,
} = require('../utils/participantTokens');

const PARTICIPANT_AUTH_TTL_MS = Number(process.env.PARTICIPANT_AUTH_OTP_TTL_MS || 10 * 60 * 1000);
const PARTICIPANT_AUTH_GENERIC_RESPONSE = {
  success: true,
  message: 'หากพบข้อมูลผู้เข้าร่วม ระบบจะส่งรหัสยืนยันไปยังอีเมลที่ระบุ',
};

exports.providers = (req, res) => {
  const production = process.env.NODE_ENV === 'production';
  const emailEnabled = boolEnv('PARTICIPANT_EMAIL_LOGIN_ENABLED', emailFeatureEnabled(process.env));
  const emailConfigured = emailEnabled
    && emailDeliveryConfigured(process.env)
    && !(production && boolEnv('MOCK_EMAIL', false));
  res.set('Cache-Control', 'public, max-age=60');
  return res.json({
    success: true,
    data: {
      email: emailConfigured,
      line: lineLoginEnabled(),
    },
  });
};

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function emailHash(email) {
  const secret = process.env.SESSION_TOKEN_HASH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw httpError('Server authentication secret is not configured', 500);
  return crypto.createHmac('sha256', secret).update(normalizeEmail(email)).digest('hex');
}

function requestedEventIdentity(req) {
  return {
    eventId: req.body?.eventId || req.query?.eventId || null,
    eventSlug: req.body?.eventSlug || req.query?.eventSlug || null,
    eventYear: req.body?.eventYear || req.query?.eventYear || null,
  };
}

async function participantScopeFromRequest(req) {
  const requested = requestedEventIdentity(req);
  if (requested.eventId || requested.eventSlug) {
    const context = await getEventContextFromRequest(req, {
      requireAccess: false,
      requireEventIdentity: true,
      requirePublic: false,
    });
    return context.eventId ? { eventId: context.eventId } : { eventYear: context.eventYear };
  }
  if (requested.eventYear) return { eventYear: normalizeEventYear(requested.eventYear) };
  return {};
}

function eventSummary(participant) {
  if (!participant) return null;
  const safe = revealParticipantObject(participant);
  const fields = safe.fields || {};
  return {
    participantId: participant._id,
    eventId: participant.eventId || null,
    eventYear: participant.eventYear || '',
    status: participant.status,
    name: fields.name || fields.fullName || fields.fullname || fields.email || '',
    isLineLinked: Boolean(participant.isLineLinked),
  };
}

function participantPayload(participant, relatedParticipants = []) {
  const safeParticipant = revealParticipantObject(participant);
  const authProviders = Array.isArray(participant.authProviders) && participant.authProviders.length > 0
    ? participant.authProviders
    : [participant.authProvider || 'email'];
  const events = relatedParticipants.length > 0
    ? relatedParticipants.map(eventSummary).filter(Boolean)
    : [eventSummary(participant)].filter(Boolean);
  return {
    id: participant._id,
    fields: safeParticipant.fields || {},
    eventId: participant.eventId || null,
    eventYear: participant.eventYear || '',
    status: participant.status,
    authProviders,
    primaryAuthProvider: participant.primaryAuthProvider || participant.authProvider || 'email',
    isLineLinked: Boolean(participant.isLineLinked),
    lineProfile: participant.isLineLinked ? {
      displayName: participant.lineDisplayName || '',
      pictureUrl: participant.linePictureUrl || '',
      linkedAt: participant.lineLinkedAt || null,
    } : null,
    notificationPreferences: participant.notificationPreferences || {},
    lastLoginAt: participant.lastLoginAt || null,
    lastLogoutAt: participant.lastLogoutAt || null,
    events,
  };
}

async function findParticipantsForEmail(email, scope) {
  return Participant.find({
    $and: [
      { isDeleted: false, isRevoked: { $ne: true }, ...scope },
      participantFieldMatch('email', email),
    ],
  }).sort({ registeredAt: -1 }).limit(50).select('+secureIndex +secureSearch');
}

async function findParticipantForEmail(email, scope) {
  const participants = await findParticipantsForEmail(email, scope);
  return participants[0] || null;
}

async function relatedParticipantsForParticipant(participant) {
  const safe = revealParticipantObject(participant);
  const email = normalizeEmail(safe.fields?.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return [participant];
  const related = await findParticipantsForEmail(email, {});
  return related.length > 0 ? related : [participant];
}

exports.requestEmailOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุอีเมลให้ถูกต้อง' });
    }

    const scope = await participantScopeFromRequest(req);
    const participants = await findParticipantsForEmail(email, scope);
    const participant = participants[0] || null;
    if (!participant) {
      auditLog({ req, action: 'PARTICIPANT_AUTH_OTP_REQUEST_NOT_FOUND', detail: `eventScope=${JSON.stringify(scope)}`, status: 200 });
      return res.json({
        ...PARTICIPANT_AUTH_GENERIC_RESPONSE,
        challengeId: new mongoose.Types.ObjectId(),
        ref: generateRef(),
      });
    }

    const otp = generateOTP();
    const ref = generateRef();
    const challenge = await ParticipantAuthChallenge.create({
      participantId: participant._id,
      participantIds: participants.map((item) => item._id),
      emailHash: emailHash(email),
      otpHash: hashOTP(otp),
      ref,
      expiresAt: new Date(Date.now() + PARTICIPANT_AUTH_TTL_MS),
    });

    try {
      await sendMail(
        email,
        `รหัสเข้าสู่ระบบผู้เข้าร่วม (Ref: ${ref})`,
        `รหัส OTP ของคุณคือ ${otp} (Ref: ${ref}) ใช้ได้ 10 นาที`,
        `<p>รหัส OTP ของคุณคือ <strong>${otp}</strong></p><p>Ref: ${ref}</p><p>ใช้ได้ 10 นาทีสำหรับเข้าสู่ระบบผู้เข้าร่วม</p>`
      );
      auditLog({ req, action: 'PARTICIPANT_AUTH_OTP_REQUEST', detail: `participantId=${participant._id}; challengeId=${challenge._id}` });
    } catch (mailError) {
      auditLog({
        req,
        action: 'PARTICIPANT_AUTH_OTP_MAIL_FAIL',
        detail: `participantId=${participant._id}; challengeId=${challenge._id}`,
        status: 500,
        error: mailError.message,
      });
    }

    return res.json({ ...PARTICIPANT_AUTH_GENERIC_RESPONSE, challengeId: challenge._id, ref });
  } catch (err) {
    console.error('Participant auth OTP request error:', err);
    return res.status(err.statusCode || 500).json({ success: false, message: err.statusCode ? err.message : 'Internal Server Error' });
  }
};

exports.verifyEmailOtp = async (req, res) => {
  try {
    const { challengeId, otp, participantId: requestedParticipantId } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(String(challengeId || ''))) {
      return res.status(400).json({ success: false, message: 'รหัสยืนยันหมดอายุหรือไม่ถูกต้อง' });
    }

    const challenge = await ParticipantAuthChallenge.findById(challengeId);
    if (!challenge || challenge.usedAt || challenge.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'รหัสยืนยันหมดอายุหรือไม่ถูกต้อง' });
    }
    if (challenge.attempts >= 5) {
      return res.status(429).json({ success: false, message: 'กรอกรหัสผิดเกินจำนวนครั้งที่กำหนด กรุณาขอรหัสใหม่' });
    }
    if (!verifyOTP(otp, challenge.otpHash)) {
      challenge.attempts += 1;
      await challenge.save();
      return res.status(400).json({ success: false, message: 'รหัส OTP ไม่ถูกต้อง' });
    }

    const allowedParticipantIds = (challenge.participantIds || []).map((id) => String(id));
    const selectedParticipantId = requestedParticipantId && allowedParticipantIds.includes(String(requestedParticipantId))
      ? requestedParticipantId
      : challenge.participantId;
    const participant = await Participant.findById(selectedParticipantId).select('+secureIndex +secureSearch');
    if (!participant || participant.isDeleted || participant.isRevoked) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้เข้าร่วมที่สามารถเข้าสู่ระบบได้' });
    }

    participant.authProvider = participant.authProvider || 'email';
    participant.primaryAuthProvider = participant.primaryAuthProvider || participant.authProvider || 'email';
    participant.authProviders = [...new Set([...(participant.authProviders || []), 'email'])];
    participant.lastLoginAt = new Date();
    challenge.usedAt = new Date();
    await Promise.all([participant.save(), challenge.save()]);

    const relatedParticipants = allowedParticipantIds.length > 0
      ? await Participant.find({ _id: { $in: allowedParticipantIds }, isDeleted: false, isRevoked: { $ne: true } }).select('+secureIndex +secureSearch')
      : [participant];
    const { token, session } = await issueParticipantSessionToken(participant, req, { provider: 'email' });
    auditLog({ req, action: 'PARTICIPANT_AUTH_OTP_VERIFY', detail: `participantId=${participant._id}; challengeId=${challenge._id}` });

    return res.json({
      success: true,
      data: {
        token,
        participant: participantPayload(participant, relatedParticipants),
        session: participantSessionPayload(session),
      },
    });
  } catch (err) {
    console.error('Participant auth OTP verify error:', err);
    return res.status(err.statusCode || 500).json({ success: false, message: err.statusCode ? err.message : 'Internal Server Error' });
  }
};

exports.me = async (req, res) => {
  try {
    const relatedParticipants = await relatedParticipantsForParticipant(req.participant);
    return res.json({
      success: true,
      data: {
        participant: participantPayload(req.participant, relatedParticipants),
        session: participantSessionPayload(req.participantSession),
      }
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.statusCode ? err.message : 'Internal Server Error' });
  }
};

exports.refresh = async (req, res) => {
  try {
    if (!req.participantSession?._id) {
      return res.status(401).json({ success: false, message: 'Participant session is required' });
    }
    const { token, session } = await refreshParticipantSessionToken(req.participant, req.participantSession, req, {
      provider: req.participantAuthPayload?.provider || req.participantSession.provider || 'email',
    });
    const relatedParticipants = await relatedParticipantsForParticipant(req.participant);
    auditLog({ req, action: 'PARTICIPANT_AUTH_REFRESH', detail: `participantId=${req.participant._id}; sessionId=${session._id}` });
    return res.json({
      success: true,
      data: {
        token,
        participant: participantPayload(req.participant, relatedParticipants),
        session: participantSessionPayload(session),
      },
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.statusCode ? err.message : 'Internal Server Error' });
  }
};

exports.switchEvent = async (req, res) => {
  try {
    const participantId = req.body?.participantId;
    if (!mongoose.Types.ObjectId.isValid(String(participantId || ''))) {
      return res.status(400).json({ success: false, message: 'Participant ไม่ถูกต้อง' });
    }

    const relatedParticipants = await relatedParticipantsForParticipant(req.participant);
    const allowedIds = new Set(relatedParticipants.map((item) => String(item._id)));
    if (!allowedIds.has(String(participantId))) {
      return res.status(403).json({ success: false, message: 'ไม่สามารถสลับไปยัง event นี้ได้' });
    }

    const selected = relatedParticipants.find((item) => String(item._id) === String(participantId));
    if (!selected || selected.isDeleted || selected.isRevoked) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้เข้าร่วมที่เลือก' });
    }

    const { token, session } = await issueParticipantSessionToken(selected, req, {
      provider: req.participantAuthPayload?.provider || req.participantSession?.provider || 'email',
    });
    if (req.participantSession?._id && String(req.participantSession._id) !== String(session._id)) {
      await revokeParticipantSession(req.participantSession._id, req.participant._id, 'switch_event');
    }
    auditLog({ req, action: 'PARTICIPANT_AUTH_SWITCH_EVENT', detail: `from=${req.participant._id}; to=${selected._id}; sessionId=${session._id}` });
    return res.json({
      success: true,
      data: {
        token,
        participant: participantPayload(selected, relatedParticipants),
        session: participantSessionPayload(session),
      },
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.statusCode ? err.message : 'Internal Server Error' });
  }
};

exports.logout = async (req, res) => {
  if (req.participantSession?._id) {
    await revokeParticipantSession(req.participantSession._id, req.participant._id, 'logout');
  }
  auditLog({ req, action: 'PARTICIPANT_AUTH_LOGOUT', detail: `participantId=${req.participant?._id}` });
  return res.json({ success: true, message: 'ออกจากระบบสำเร็จ', clientShouldDeleteToken: true });
};

exports.logoutAll = async (req, res) => {
  try {
    assertParticipantStepUpToken(req.body?.stepUpToken, req.participant, 'logout_all');
    const now = new Date();
    await Participant.updateOne(
      { _id: req.participant._id },
      {
        $inc: { participantTokenVersion: 1 },
        $set: { lastLogoutAt: now },
      }
    );
    await revokeParticipantSessions(req.participant._id, { reason: 'logout_all' });
    auditLog({ req, action: 'PARTICIPANT_AUTH_LOGOUT_ALL', detail: `participantId=${req.participant._id}` });
    return res.json({ success: true, message: 'ออกจากระบบทุกอุปกรณ์สำเร็จ', lastLogoutAt: now });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.statusCode ? err.message : 'Internal Server Error' });
  }
};

exports.listSessions = async (req, res) => {
  try {
    const sessions = await ParticipantSession.find({
      participantId: req.participant._id,
      revoked: false,
      expiresAt: { $gt: new Date() },
    }).sort({ lastActivityAt: -1 });
    return res.json({
      success: true,
      data: {
        currentSessionId: req.participantSession?._id || null,
        sessions: sessions.map(participantSessionPayload),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

exports.revokeSession = async (req, res) => {
  try {
    const session = await revokeParticipantSession(req.params.id, req.participant._id, 'participant_revoke_device');
    if (!session) return res.status(404).json({ success: false, message: 'ไม่พบ session ที่ต้องการยกเลิก' });
    auditLog({ req, action: 'PARTICIPANT_AUTH_REVOKE_SESSION', detail: `participantId=${req.participant._id}; sessionId=${req.params.id}` });
    return res.json({
      success: true,
      message: 'ยกเลิก session สำเร็จ',
      data: { session: participantSessionPayload(session) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

exports.requestStepUpOtp = async (req, res) => {
  try {
    const action = String(req.body?.action || '').trim();
    if (!['line_link', 'line_unlink', 'logout_all', 'identity_change'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action ไม่ถูกต้อง' });
    }
    const safe = revealParticipantObject(req.participant);
    const email = normalizeEmail(safe.fields?.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'บัญชีนี้ยังไม่มีอีเมลสำหรับยืนยันตัวตน' });
    }

    const otp = generateOTP();
    const ref = generateRef();
    const challenge = await ParticipantAuthChallenge.create({
      participantId: req.participant._id,
      emailHash: emailHash(email),
      otpHash: hashOTP(otp),
      ref,
      purpose: 'step_up',
      action,
      expiresAt: new Date(Date.now() + PARTICIPANT_AUTH_TTL_MS),
    });

    await sendMail(
      email,
      `รหัสยืนยันความปลอดภัย (Ref: ${ref})`,
      `รหัส OTP ของคุณคือ ${otp} (Ref: ${ref}) ใช้ได้ 10 นาที`,
      `<p>รหัส OTP ของคุณคือ <strong>${otp}</strong></p><p>Ref: ${ref}</p><p>ใช้ได้ 10 นาทีสำหรับยืนยันการทำรายการสำคัญ</p>`
    );
    auditLog({ req, action: 'PARTICIPANT_STEP_UP_OTP_REQUEST', detail: `participantId=${req.participant._id}; action=${action}; challengeId=${challenge._id}` });
    return res.json({
      success: true,
      message: 'ระบบส่งรหัสยืนยันไปยังอีเมลของคุณแล้ว',
      challengeId: challenge._id,
      ref,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.statusCode ? err.message : 'Internal Server Error' });
  }
};

exports.verifyStepUpOtp = async (req, res) => {
  try {
    const { challengeId, otp } = req.body || {};
    const action = String(req.body?.action || '').trim();
    if (!mongoose.Types.ObjectId.isValid(String(challengeId || ''))) {
      return res.status(400).json({ success: false, message: 'รหัสยืนยันหมดอายุหรือไม่ถูกต้อง' });
    }
    const challenge = await ParticipantAuthChallenge.findById(challengeId);
    if (
      !challenge ||
      String(challenge.participantId) !== String(req.participant._id) ||
      challenge.purpose !== 'step_up' ||
      challenge.action !== action ||
      challenge.usedAt ||
      challenge.expiresAt < new Date()
    ) {
      return res.status(400).json({ success: false, message: 'รหัสยืนยันหมดอายุหรือไม่ถูกต้อง' });
    }
    if (challenge.attempts >= 5) {
      return res.status(429).json({ success: false, message: 'กรอกรหัสผิดเกินจำนวนครั้งที่กำหนด กรุณาขอรหัสใหม่' });
    }
    if (!verifyOTP(otp, challenge.otpHash)) {
      challenge.attempts += 1;
      await challenge.save();
      return res.status(400).json({ success: false, message: 'รหัส OTP ไม่ถูกต้อง' });
    }
    challenge.usedAt = new Date();
    await challenge.save();

    const stepUpToken = issueParticipantStepUpToken(req.participant, action);
    auditLog({ req, action: 'PARTICIPANT_STEP_UP_OTP_VERIFY', detail: `participantId=${req.participant._id}; action=${action}; challengeId=${challenge._id}` });
    return res.json({
      success: true,
      message: 'ยืนยันตัวตนสำเร็จ',
      data: {
        stepUpToken,
        action,
        expiresInSeconds: 10 * 60,
      },
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.statusCode ? err.message : 'Internal Server Error' });
  }
};

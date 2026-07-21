const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');
const ms = require('ms');
const ParticipantSession = require('../models/participantSession');
const { hashSessionToken } = require('./sessionToken');

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function durationMs(name, fallback) {
  const raw = process.env[name] || fallback;
  const parsed = ms(raw);
  if (!parsed || parsed <= 0) throw new Error(`Invalid ${name} value: ${raw}`);
  return parsed;
}

function participantJwtExpiresIn() {
  return process.env.PARTICIPANT_JWT_EXPIRES_IN || '7d';
}

function participantSessionTtlMs() {
  return durationMs('PARTICIPANT_SESSION_TTL', participantJwtExpiresIn());
}

function participantSessionAbsoluteMs() {
  return durationMs('PARTICIPANT_SESSION_ABSOLUTE_TIMEOUT', process.env.PARTICIPANT_SESSION_TTL || participantJwtExpiresIn());
}

function participantPreviousTokenGraceMs() {
  return durationMs('PARTICIPANT_SESSION_PREVIOUS_TOKEN_GRACE', process.env.SESSION_PREVIOUS_TOKEN_GRACE || '30s');
}

function participantMaxActiveSessions() {
  const value = Number(process.env.PARTICIPANT_MAX_ACTIVE_SESSIONS || 5);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 5;
}

function issueParticipantToken(participant, { provider = 'email', sessionId = null } = {}) {
  if (!process.env.JWT_SECRET) {
    throw httpError('Server authentication secret is not configured', 500);
  }

  const participantSessionId = sessionId ? String(sessionId) : undefined;
  return jwt.sign(
    {
      id: participant._id,
      participantId: participant._id,
      eventId: participant.eventId || null,
      eventYear: participant.eventYear || '',
      role: 'participant',
      provider,
      tokenVersion: participant.participantTokenVersion || 0,
      ...(participantSessionId ? { participantSessionId } : {}),
    },
    process.env.JWT_SECRET,
    { expiresIn: participantJwtExpiresIn() }
  );
}

function safeDeviceLabel(req) {
  const userAgent = String(req?.headers?.['user-agent'] || '').slice(0, 160);
  if (!userAgent) return '';
  if (/Line/i.test(userAgent)) return 'LINE';
  if (/Mobile|Android|iPhone|iPad/i.test(userAgent)) return 'Mobile browser';
  return 'Web browser';
}

async function trimParticipantSessions(participantId, keepSessionId) {
  const maxSessions = participantMaxActiveSessions();
  const active = await ParticipantSession.find({
    participantId,
    revoked: false,
    expiresAt: { $gt: new Date() },
  }).sort({ lastActivityAt: -1 }).select('_id');

  const extra = active
    .filter((session) => String(session._id) !== String(keepSessionId))
    .slice(Math.max(0, maxSessions - 1));

  if (extra.length > 0) {
    await ParticipantSession.updateMany(
      { _id: { $in: extra.map((session) => session._id) } },
      { revoked: true, revokedAt: new Date(), revokedReason: 'max_active_sessions_exceeded' }
    );
  }
}

function compactPreviousTokenHashes(session, tokenHashes, expiresAt, now) {
  const seen = new Set();
  const entries = [
    ...(session.previousTokenHashes || []),
    ...tokenHashes.filter(Boolean).map(tokenHash => ({ tokenHash, expiresAt })),
  ]
    .filter(entry => entry?.tokenHash && entry.expiresAt && entry.expiresAt > now)
    .reverse()
    .filter((entry) => {
      if (seen.has(entry.tokenHash)) return false;
      seen.add(entry.tokenHash);
      return true;
    })
    .reverse();

  return entries.slice(-5);
}

async function issueParticipantSessionToken(participant, req = null, { provider = 'email' } = {}) {
  const now = new Date();
  const sessionId = new mongoose.Types.ObjectId();
  const token = issueParticipantToken(participant, { provider, sessionId });
  const ttlMs = participantSessionTtlMs();
  const absoluteMs = participantSessionAbsoluteMs();

  const session = await ParticipantSession.create({
    _id: sessionId,
    participantId: participant._id,
    tokenHash: hashSessionToken(token),
    provider,
    eventId: participant.eventId || null,
    eventYear: participant.eventYear || '',
    userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 512),
    ip: req?.ip || '',
    deviceLabel: safeDeviceLabel(req),
    lastActivityAt: now,
    expiresAt: new Date(now.getTime() + ttlMs),
    absoluteExpiresAt: new Date(now.getTime() + absoluteMs),
    revoked: false,
  });
  await trimParticipantSessions(participant._id, session._id);
  return { token, session };
}

async function refreshParticipantSessionToken(participant, session, req = null, { provider = null } = {}) {
  if (!session?._id) throw httpError('Participant session is required', 401);
  const now = new Date();
  if (session.revoked) throw httpError('Unauthorized: Participant session has been revoked', 401);
  if (session.absoluteExpiresAt && session.absoluteExpiresAt <= now) {
    session.revoked = true;
    session.revokedAt = now;
    session.revokedReason = 'absolute_expired';
    await session.save();
    throw httpError('Unauthorized: Participant session has expired', 401);
  }

  const token = issueParticipantToken(participant, {
    provider: provider || session.provider || 'email',
    sessionId: session._id,
  });
  const ttlMs = participantSessionTtlMs();
  const idleExpiresAt = new Date(now.getTime() + ttlMs);
  const expiresAt = session.absoluteExpiresAt && session.absoluteExpiresAt < idleExpiresAt
    ? session.absoluteExpiresAt
    : idleExpiresAt;
  const previousTokenExpiresAt = new Date(now.getTime() + participantPreviousTokenGraceMs());
  const oldTokenHash = req?.participantToken ? hashSessionToken(req.participantToken) : session.tokenHash;
  const previousHashes = compactPreviousTokenHashes(
    session,
    [oldTokenHash, session.tokenHash, session.previousTokenHash],
    previousTokenExpiresAt,
    now
  );

  session.previousTokenHash = oldTokenHash || session.tokenHash;
  session.previousTokenExpiresAt = previousTokenExpiresAt;
  session.previousTokenHashes = previousHashes;
  session.tokenHash = hashSessionToken(token);
  session.expiresAt = expiresAt;
  session.lastActivityAt = now;
  if (req?.headers?.['user-agent']) session.userAgent = String(req.headers['user-agent']).slice(0, 512);
  if (req?.ip) session.ip = req.ip;
  await session.save();
  return { token, session };
}

function assertParticipantTokenFresh(participant, payload = {}) {
  if (!participant) {
    const err = new Error('Unauthorized: User not found');
    err.statusCode = 401;
    throw err;
  }

  if (Number(payload.tokenVersion || 0) !== Number(participant.participantTokenVersion || 0)) {
    const err = new Error('Unauthorized: Token has been revoked');
    err.statusCode = 401;
    throw err;
  }

  if (participant.lastLogoutAt && payload.iat && payload.iat * 1000 <= participant.lastLogoutAt.getTime()) {
    const err = new Error('Unauthorized: Token has been revoked');
    err.statusCode = 401;
    throw err;
  }
}

function timingSafeTokenHashEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'hex');
  const rightBuffer = Buffer.from(String(right || ''), 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function matchesPreviousParticipantTokenHash(session, actualHash, now) {
  if (
    session.previousTokenHash &&
    session.previousTokenExpiresAt &&
    session.previousTokenExpiresAt > now &&
    timingSafeTokenHashEqual(actualHash, session.previousTokenHash)
  ) {
    return true;
  }

  return (session.previousTokenHashes || []).some((entry) => (
    entry?.tokenHash &&
    entry.expiresAt &&
    entry.expiresAt > now &&
    timingSafeTokenHashEqual(actualHash, entry.tokenHash)
  ));
}

async function assertParticipantSessionActive(participant, payload = {}, token = '', req = null) {
  const sessionId = payload.participantSessionId || payload.sessionId || null;
  if (!sessionId) {
    if (process.env.PARTICIPANT_REQUIRE_SESSION_STORE === 'true') {
      throw httpError('Unauthorized: Participant session is required', 401);
    }
    return null;
  }
  if (!mongoose.Types.ObjectId.isValid(String(sessionId))) {
    throw httpError('Unauthorized: Participant session is invalid', 401);
  }

  const session = await ParticipantSession.findOne({
    _id: sessionId,
    participantId: participant._id,
  }).select('+tokenHash +previousTokenHash +previousTokenHashes.tokenHash');
  if (!session) throw httpError('Unauthorized: Participant session not found', 401);

  const now = new Date();
  if (session.revoked) throw httpError('Unauthorized: Participant session has been revoked', 401);
  if (session.expiresAt && session.expiresAt <= now) throw httpError('Unauthorized: Participant session has expired', 401);
  if (session.absoluteExpiresAt && session.absoluteExpiresAt <= now) throw httpError('Unauthorized: Participant session has expired', 401);

  const actualHash = hashSessionToken(token);
  const matchesCurrent = timingSafeTokenHashEqual(actualHash, session.tokenHash);
  const matchesPrevious = !matchesCurrent && matchesPreviousParticipantTokenHash(session, actualHash, now);
  if (!matchesCurrent && !matchesPrevious) {
    throw httpError('Unauthorized: Participant session token mismatch', 401);
  }

  session.lastActivityAt = now;
  if (req?.headers?.['user-agent']) session.userAgent = String(req.headers['user-agent']).slice(0, 512);
  if (req?.ip) session.ip = req.ip;
  await session.save();
  return session;
}

async function revokeParticipantSession(sessionId, participantId, reason = 'revoked') {
  if (!mongoose.Types.ObjectId.isValid(String(sessionId || ''))) return null;
  return ParticipantSession.findOneAndUpdate(
    { _id: sessionId, participantId },
    { revoked: true, revokedAt: new Date(), revokedReason: reason },
    { new: true }
  );
}

async function revokeParticipantSessions(participantId, { exceptSessionId = null, reason = 'revoked_all' } = {}) {
  const query = { participantId, revoked: false };
  if (exceptSessionId) query._id = { $ne: exceptSessionId };
  return ParticipantSession.updateMany(query, {
    revoked: true,
    revokedAt: new Date(),
    revokedReason: reason,
  });
}

function participantSessionPayload(session) {
  if (!session) return null;
  const obj = typeof session.toObject === 'function' ? session.toObject() : { ...session };
  return {
    id: obj._id,
    provider: obj.provider,
    eventId: obj.eventId || null,
    eventYear: obj.eventYear || '',
    deviceLabel: obj.deviceLabel || '',
    userAgent: obj.userAgent || '',
    ip: obj.ip || '',
    lastActivityAt: obj.lastActivityAt || null,
    createdAt: obj.createdAt || null,
    expiresAt: obj.expiresAt || null,
    absoluteExpiresAt: obj.absoluteExpiresAt || null,
    revoked: Boolean(obj.revoked),
    revokedAt: obj.revokedAt || null,
  };
}

function issueParticipantStepUpToken(participant, action) {
  if (!process.env.JWT_SECRET) throw httpError('Server authentication secret is not configured', 500);
  if (!action) throw httpError('Step-up action is required', 400);
  return jwt.sign(
    {
      id: participant._id,
      participantId: participant._id,
      role: 'participant_step_up',
      action,
      tokenVersion: participant.participantTokenVersion || 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.PARTICIPANT_STEP_UP_EXPIRES_IN || '10m' }
  );
}

function assertParticipantStepUpToken(token, participant, action) {
  if (!token) throw httpError('Step-up verification is required', 403);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw httpError('Step-up verification expired or invalid', 403);
  }
  if (payload.role !== 'participant_step_up') throw httpError('Step-up verification is invalid', 403);
  if (String(payload.participantId || payload.id) !== String(participant._id)) throw httpError('Step-up verification is invalid', 403);
  if (payload.action !== action) throw httpError('Step-up verification is for a different action', 403);
  if (Number(payload.tokenVersion || 0) !== Number(participant.participantTokenVersion || 0)) {
    throw httpError('Step-up verification is stale', 403);
  }
  return payload;
}

module.exports = {
  assertParticipantSessionActive,
  assertParticipantStepUpToken,
  assertParticipantTokenFresh,
  issueParticipantSessionToken,
  issueParticipantStepUpToken,
  issueParticipantToken,
  participantSessionPayload,
  participantPreviousTokenGraceMs,
  refreshParticipantSessionToken,
  revokeParticipantSession,
  revokeParticipantSessions,
};

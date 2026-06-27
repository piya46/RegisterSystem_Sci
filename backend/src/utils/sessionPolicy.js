const ms = require('ms');

function durationMs(name, fallback) {
  const raw = process.env[name] || fallback;
  const parsed = ms(raw);
  if (!parsed || parsed <= 0) throw new Error(`Invalid ${name} value: ${raw}`);
  return parsed;
}

function sessionIdleTimeoutMs() {
  return durationMs('SESSION_IDLE_TIMEOUT', '30m');
}

function sessionAbsoluteTimeoutMs() {
  return durationMs('SESSION_ABSOLUTE_TIMEOUT', '12h');
}

function sessionRefreshThresholdMs() {
  return durationMs('SESSION_REFRESH_THRESHOLD', '5m');
}

function sessionPreviousTokenGraceMs() {
  return durationMs('SESSION_PREVIOUS_TOKEN_GRACE', '30s');
}

function createSessionTiming(now = new Date(), absoluteExpiresAt = null) {
  const idleMs = sessionIdleTimeoutMs();
  const absoluteAt = absoluteExpiresAt || new Date(now.getTime() + sessionAbsoluteTimeoutMs());
  const idleExpiresAt = new Date(now.getTime() + idleMs);
  const expiresAt = idleExpiresAt < absoluteAt ? idleExpiresAt : absoluteAt;
  const cookieMaxAgeMs = Math.max(0, expiresAt.getTime() - now.getTime());
  return {
    absoluteExpiresAt: absoluteAt,
    cookieMaxAgeMs,
    expiresAt,
    jwtExpiresInSeconds: Math.max(1, Math.floor(cookieMaxAgeMs / 1000)),
    refreshThresholdMs: sessionRefreshThresholdMs(),
  };
}

module.exports = {
  createSessionTiming,
  sessionAbsoluteTimeoutMs,
  sessionIdleTimeoutMs,
  sessionPreviousTokenGraceMs,
  sessionRefreshThresholdMs,
};

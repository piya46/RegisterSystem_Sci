const mongoose = require('mongoose');
const { boolEnv } = require('./cloudCostGuardrail');

function integerEnv(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number(process.env[name]);
  const normalized = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(Math.max(normalized, min), max);
}

function sqlMirrorOutboxEnabled() {
  return boolEnv('SQL_OUTBOX_ENABLED', false);
}

function sqlMirrorOutboxStrict() {
  return boolEnv('SQL_OUTBOX_STRICT', false);
}

function assertSqlMirrorOutboxConfiguration() {
  const mirrorEnabled = boolEnv('SQL_MIRROR_ENABLED', false);
  const outboxEnabled = sqlMirrorOutboxEnabled();
  if (mirrorEnabled && !boolEnv('SQL_ENABLED', false)) {
    throw new Error('SQL_MIRROR_ENABLED=true requires SQL_ENABLED=true');
  }
  if (outboxEnabled && !mirrorEnabled) {
    throw new Error('SQL_OUTBOX_ENABLED=true requires SQL_MIRROR_ENABLED=true');
  }
  if (outboxEnabled) {
    const queryTimeoutMs = integerEnv('SQL_QUERY_TIMEOUT_MS', 10000, { min: 1000, max: 60000 });
    const lockTimeoutMs = integerEnv('SQL_OUTBOX_LOCK_TIMEOUT_MS', 120000, { min: 10000, max: 3600000 });
    if (lockTimeoutMs < queryTimeoutMs + 5000) {
      throw new Error('SQL_OUTBOX_LOCK_TIMEOUT_MS must exceed SQL_QUERY_TIMEOUT_MS by at least 5000ms');
    }
    const baseRetryMs = integerEnv('SQL_OUTBOX_BASE_RETRY_MS', 1000, { min: 100, max: 3600000 });
    const maxRetryMs = integerEnv('SQL_OUTBOX_MAX_RETRY_MS', 300000, { min: 1000, max: 86400000 });
    if (maxRetryMs < baseRetryMs) {
      throw new Error('SQL_OUTBOX_MAX_RETRY_MS must be greater than or equal to SQL_OUTBOX_BASE_RETRY_MS');
    }
    const pollIntervalMs = integerEnv('SQL_OUTBOX_POLL_INTERVAL_MS', 5000, { min: 250, max: 60000 });
    const maximumLagMs = integerEnv('SQL_MAX_SYNC_LAG_SECONDS', 60, { min: 1, max: 86400 }) * 1000;
    if (pollIntervalMs > maximumLagMs) {
      throw new Error('SQL_OUTBOX_POLL_INTERVAL_MS cannot exceed SQL_MAX_SYNC_LAG_SECONDS');
    }
  }
}

function sourceObjectId(value) {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (!mongoose.isObjectIdOrHexString(value)) {
    const error = new Error('SQL mirror outbox source id is invalid');
    error.code = 'SQL_OUTBOX_INVALID_SOURCE_ID';
    throw error;
  }
  return new mongoose.Types.ObjectId(value);
}

function dedupeKey(domain, sourceId, operation = 'upsert') {
  return `${domain}:${String(sourceId)}:${operation}`;
}

async function enqueueSqlMirror({ domain, sourceId, eventId = null, session = null }) {
  if (!sqlMirrorOutboxEnabled()) return null;
  if (!domain || !/^[a-z][a-z0-9_]*$/.test(domain)) {
    const error = new Error('SQL mirror outbox domain is invalid');
    error.code = 'SQL_OUTBOX_INVALID_DOMAIN';
    throw error;
  }

  const normalizedSourceId = sourceObjectId(sourceId);
  const normalizedEventId = eventId ? sourceObjectId(eventId) : null;
  const now = new Date();
  const key = dedupeKey(domain, normalizedSourceId);
  const SqlMirrorOutbox = require('../models/sqlMirrorOutbox');
  const update = {
    $set: {
      eventId: normalizedEventId,
      requestedAt: now,
      availableAt: now,
      attemptCount: 0,
      maxAttempts: integerEnv('SQL_OUTBOX_MAX_ATTEMPTS', 8, { min: 1, max: 50 }),
      lastErrorCode: null,
      lastErrorAt: null,
    },
    $setOnInsert: {
      domain,
      sourceId: normalizedSourceId,
      operation: 'upsert',
      dedupeKey: key,
      status: 'pending',
      firstRequestedAt: now,
    },
  };
  const options = {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
    ...(session ? { session } : {}),
  };

  try {
    return await SqlMirrorOutbox.findOneAndUpdate({ dedupeKey: key, status: 'pending' }, update, options);
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return SqlMirrorOutbox.findOneAndUpdate(
      { dedupeKey: key, status: 'pending' },
      update,
      { new: true, ...(session ? { session } : {}) }
    );
  }
}

function reportOutboxHookError(error, domain) {
  if (sqlMirrorOutboxStrict()) throw error;
  const code = String(error?.code || 'SQL_OUTBOX_ENQUEUE_FAILED').replace(/[^A-Z0-9_]/gi, '_').slice(0, 80);
  console.error('[SqlMirrorOutbox] Enqueue failed:', { domain, code });
  return null;
}

module.exports = {
  assertSqlMirrorOutboxConfiguration,
  dedupeKey,
  enqueueSqlMirror,
  integerEnv,
  reportOutboxHookError,
  sqlMirrorOutboxEnabled,
  sqlMirrorOutboxStrict,
};

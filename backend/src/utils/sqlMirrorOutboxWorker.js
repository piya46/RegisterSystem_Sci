const crypto = require('crypto');
const os = require('os');
const { withSqlTransaction } = require('../config/sql');
const { createReportingMirrorRepository } = require('../sql/reportingMirrorRepository');
const { domainDefinition } = require('../sql/reportingMirrorDomains');
const {
  assertSqlMirrorOutboxConfiguration,
  integerEnv,
  sqlMirrorOutboxEnabled,
} = require('./sqlMirrorOutbox');

let pollTimer = null;
let activeCycle = null;
let stopping = false;
let lastRecoveryAtMs = 0;

const state = {
  enabled: false,
  started: false,
  running: false,
  workerId: null,
  startedAt: null,
  lastCycleAt: null,
  lastSuccessAt: null,
  lastProcessedAt: null,
  lastRecoveryAt: null,
  lastErrorCode: null,
  processedCount: 0,
  retryCount: 0,
  deadLetterCount: 0,
};

const PERMANENT_ERROR_CODES = new Set([
  'SQL_MIRROR_INVALID_DOMAIN',
  'SQL_MIRROR_SOURCE_NOT_FOUND',
  'SQL_MIRROR_UNPROTECTED_INDEX',
  'SQL_MIRROR_UNIQUE_CONFLICT',
  'SQL_OUTBOX_INVALID_SOURCE_ID',
  'ER_DUP_ENTRY',
]);

function safeErrorCode(error, fallback = 'SQL_OUTBOX_PROCESS_FAILED') {
  return String(error?.code || fallback).replace(/[^A-Z0-9_]/gi, '_').slice(0, 80) || fallback;
}

function retryDelayMs(attemptCount, {
  baseMs = integerEnv('SQL_OUTBOX_BASE_RETRY_MS', 1000, { min: 100, max: 3600000 }),
  maxMs = integerEnv('SQL_OUTBOX_MAX_RETRY_MS', 300000, { min: 1000, max: 86400000 }),
  random = Math.random,
} = {}) {
  const exponent = Math.max(0, Math.min(Number(attemptCount) - 1, 30));
  const ceiling = Math.min(maxMs, baseMs * (2 ** exponent));
  const jitter = 0.75 + (Math.max(0, Math.min(1, Number(random()))) * 0.5);
  return Math.min(maxMs, Math.max(100, Math.floor(ceiling * jitter)));
}

function outboxModel() {
  return require('../models/sqlMirrorOutbox');
}

function retentionDate(now = new Date()) {
  const days = integerEnv('SQL_OUTBOX_COMPLETED_RETENTION_DAYS', 7, { min: 1, max: 90 });
  return new Date(now.getTime() + (days * 86400000));
}

async function recoverStaleLocks(now = new Date()) {
  const timeoutMs = integerEnv('SQL_OUTBOX_LOCK_TIMEOUT_MS', 120000, { min: 10000, max: 3600000 });
  const staleRecords = await outboxModel().find({
    status: 'processing',
    lockedAt: { $lte: new Date(now.getTime() - timeoutMs) },
  }).limit(1000).select('_id dedupeKey lockToken').lean();
  let recovered = 0;
  let superseded = 0;
  for (const record of staleRecords) {
    const pending = await outboxModel().exists({
      dedupeKey: record.dedupeKey,
      status: 'pending',
      _id: { $ne: record._id },
    });
    if (pending) {
      superseded += await markSuperseded(record, now);
      continue;
    }
    try {
      const result = await outboxModel().updateOne(
        { _id: record._id, status: 'processing', lockToken: record.lockToken },
        {
          $set: {
            status: 'pending',
            availableAt: now,
            lastErrorCode: 'SQL_OUTBOX_STALE_LOCK',
            lastErrorAt: now,
          },
          $unset: { lockToken: 1, lockOwner: 1, lockedAt: 1 },
        }
      );
      recovered += result.modifiedCount;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      superseded += await markSuperseded(record, now);
    }
  }
  return { recovered, superseded };
}

async function claimNext(now = new Date()) {
  const lockToken = crypto.randomUUID();
  const record = await outboxModel().findOneAndUpdate(
    { status: 'pending', availableAt: { $lte: now } },
    {
      $set: {
        status: 'processing',
        lockToken,
        lockOwner: state.workerId,
        lockedAt: now,
      },
      $inc: { attemptCount: 1 },
    },
    { new: true, sort: { availableAt: 1, requestedAt: 1 } }
  ).lean();
  return record ? { ...record, lockToken } : null;
}

async function sourceDocument(definition, sourceId) {
  let query = definition.model.findById(sourceId);
  if (definition.select) query = query.select(definition.select);
  return query.lean();
}

function workerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function markSuperseded(record, now = new Date()) {
  const result = await outboxModel().updateOne(
    { _id: record._id, status: 'processing', lockToken: record.lockToken },
    {
      $set: {
        status: 'completed',
        completedAt: now,
        purgeAt: retentionDate(now),
        lastErrorCode: 'SQL_OUTBOX_SUPERSEDED',
        lastErrorAt: now,
      },
      $unset: { lockToken: 1, lockOwner: 1, lockedAt: 1 },
    }
  );
  return result.modifiedCount;
}

async function mirrorRecord(record) {
  const definition = domainDefinition(record.domain);
  if (!definition) throw workerError('SQL_MIRROR_INVALID_DOMAIN', 'Unknown SQL mirror domain');
  const source = await sourceDocument(definition, record.sourceId);
  if (!source) throw workerError('SQL_MIRROR_SOURCE_NOT_FOUND', 'SQL mirror source no longer exists');
  const mapped = definition.mapper(source);
  await withSqlTransaction(async (transaction) => {
    const repository = createReportingMirrorRepository({ transaction });
    await repository[definition.upsert](mapped);
  });
  return mapped.row.source_hash;
}

async function completeRecord(record, sourceHash, now = new Date()) {
  const result = await outboxModel().updateOne(
    { _id: record._id, status: 'processing', lockToken: record.lockToken },
    {
      $set: {
        status: 'completed',
        completedAt: now,
        purgeAt: retentionDate(now),
        resultSourceHash: sourceHash,
        lastErrorCode: null,
        lastErrorAt: null,
      },
      $unset: { lockToken: 1, lockOwner: 1, lockedAt: 1 },
    }
  );
  if (result.modifiedCount !== 1) {
    throw workerError('SQL_OUTBOX_LOCK_LOST', 'SQL mirror outbox lock ownership was lost');
  }
}

async function failRecord(record, error, now = new Date()) {
  const errorCode = safeErrorCode(error);
  const permanent = PERMANENT_ERROR_CODES.has(errorCode);
  const dead = permanent || record.attemptCount >= record.maxAttempts;
  const update = dead
    ? {
      $set: {
        status: 'dead',
        deadLetteredAt: now,
        lastErrorCode: errorCode,
        lastErrorAt: now,
      },
      $unset: { lockToken: 1, lockOwner: 1, lockedAt: 1, purgeAt: 1 },
    }
    : {
      $set: {
        status: 'pending',
        availableAt: new Date(now.getTime() + retryDelayMs(record.attemptCount)),
        lastErrorCode: errorCode,
        lastErrorAt: now,
      },
      $unset: { lockToken: 1, lockOwner: 1, lockedAt: 1 },
    };
  let result;
  try {
    result = await outboxModel().updateOne(
      { _id: record._id, status: 'processing', lockToken: record.lockToken },
      update
    );
  } catch (updateError) {
    if (!dead && updateError?.code === 11000) {
      const modifiedCount = await markSuperseded(record, now);
      return { dead: false, errorCode: 'SQL_OUTBOX_SUPERSEDED', superseded: modifiedCount === 1 };
    }
    throw updateError;
  }
  if (result.modifiedCount === 1) {
    if (dead) {
      state.deadLetterCount += 1;
      const auditLog = require('../helpers/auditLog');
      await auditLog({
        action: 'SQL_MIRROR_DEAD_LETTER',
        status: 500,
        detail: JSON.stringify({
          outboxId: String(record._id),
          domain: record.domain,
          operation: record.operation,
          attemptCount: record.attemptCount,
          errorCode,
        }),
        strict: false,
      });
    } else state.retryCount += 1;
  }
  return { dead, errorCode };
}

async function processClaim(record) {
  try {
    const sourceHash = await mirrorRecord(record);
    await completeRecord(record, sourceHash);
    state.processedCount += 1;
    state.lastProcessedAt = new Date().toISOString();
    return { completed: true };
  } catch (error) {
    return failRecord(record, error);
  }
}

async function runCycle() {
  if (!state.enabled || stopping || state.running) return { processed: 0 };
  state.running = true;
  const cycleAt = new Date();
  let processed = 0;
  try {
    const lockTimeoutMs = integerEnv('SQL_OUTBOX_LOCK_TIMEOUT_MS', 120000, { min: 10000, max: 3600000 });
    const recoveryIntervalMs = Math.min(Math.max(Math.floor(lockTimeoutMs / 2), 30000), 300000);
    if (cycleAt.getTime() - lastRecoveryAtMs >= recoveryIntervalMs) {
      await recoverStaleLocks(cycleAt);
      lastRecoveryAtMs = cycleAt.getTime();
      state.lastRecoveryAt = cycleAt.toISOString();
    }
    const batchSize = integerEnv('SQL_OUTBOX_BATCH_SIZE', 25, { min: 1, max: 500 });
    while (!stopping && processed < batchSize) {
      const record = await claimNext();
      if (!record) break;
      await processClaim(record);
      processed += 1;
    }
    state.lastCycleAt = new Date().toISOString();
    state.lastSuccessAt = state.lastCycleAt;
    state.lastErrorCode = null;
    return { processed };
  } catch (error) {
    state.lastCycleAt = new Date().toISOString();
    state.lastErrorCode = safeErrorCode(error, 'SQL_OUTBOX_CYCLE_FAILED');
    console.error('[SqlMirrorOutbox] Worker cycle failed:', { code: state.lastErrorCode });
    return { processed, errorCode: state.lastErrorCode };
  } finally {
    state.running = false;
  }
}

function scheduleCycle() {
  if (activeCycle || stopping) return;
  activeCycle = runCycle().finally(() => {
    activeCycle = null;
  });
}

async function startSqlMirrorOutboxWorker() {
  assertSqlMirrorOutboxConfiguration();
  state.enabled = sqlMirrorOutboxEnabled();
  if (!state.enabled) return sqlMirrorOutboxWorkerStatus();
  if (state.started) return sqlMirrorOutboxWorkerStatus();

  stopping = false;
  lastRecoveryAtMs = 0;
  state.workerId = `${os.hostname().slice(0, 40)}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`;
  state.started = true;
  state.startedAt = new Date().toISOString();
  const intervalMs = integerEnv('SQL_OUTBOX_POLL_INTERVAL_MS', 5000, { min: 250, max: 60000 });
  pollTimer = setInterval(scheduleCycle, intervalMs);
  if (typeof pollTimer.unref === 'function') pollTimer.unref();
  scheduleCycle();
  return sqlMirrorOutboxWorkerStatus();
}

async function stopSqlMirrorOutboxWorker() {
  stopping = true;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  if (activeCycle) await activeCycle;
  state.running = false;
  state.started = false;
  state.workerId = null;
}

function sqlMirrorOutboxWorkerStatus() {
  return {
    enabled: state.enabled,
    started: state.started,
    running: state.running,
    healthy: !state.enabled || (state.started && !stopping && !state.lastErrorCode),
    startedAt: state.startedAt,
    lastCycleAt: state.lastCycleAt,
    lastSuccessAt: state.lastSuccessAt,
    lastProcessedAt: state.lastProcessedAt,
    lastRecoveryAt: state.lastRecoveryAt,
    lastErrorCode: state.lastErrorCode,
    processedCount: state.processedCount,
    retryCount: state.retryCount,
    deadLetterCount: state.deadLetterCount,
  };
}

module.exports = {
  PERMANENT_ERROR_CODES,
  retryDelayMs,
  runSqlMirrorOutboxCycle: runCycle,
  safeErrorCode,
  sqlMirrorOutboxWorkerStatus,
  startSqlMirrorOutboxWorker,
  stopSqlMirrorOutboxWorker,
};

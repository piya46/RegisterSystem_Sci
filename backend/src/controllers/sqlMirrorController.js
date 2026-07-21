const { sqlStatus } = require('../config/sql');
const SqlMirrorOutbox = require('../models/sqlMirrorOutbox');
const { guardrailStatus } = require('../utils/cloudCostGuardrail');
const { integerEnv, sqlMirrorOutboxEnabled } = require('../utils/sqlMirrorOutbox');
const { sqlMirrorOutboxWorkerStatus } = require('../utils/sqlMirrorOutboxWorker');
const { serverError } = require('../utils/httpResponses');

function queueLagSeconds(oldestRequestedAt, now = new Date()) {
  if (!oldestRequestedAt) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(oldestRequestedAt).getTime()) / 1000));
}

exports.getStatus = async (req, res) => {
  try {
    const [counts, oldestPending] = await Promise.all([
      SqlMirrorOutbox.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      SqlMirrorOutbox.findOne({ status: 'pending' }).sort({ requestedAt: 1 }).select('requestedAt').lean(),
    ]);
    const queue = { pending: 0, processing: 0, completed: 0, dead: 0 };
    for (const entry of counts) {
      if (Object.hasOwn(queue, entry._id)) queue[entry._id] = Number(entry.count || 0);
    }
    const lagSeconds = queueLagSeconds(oldestPending?.requestedAt);
    const maximumLagSeconds = integerEnv('SQL_MAX_SYNC_LAG_SECONDS', 60, { min: 1, max: 86400 });

    return res.json({
      success: true,
      data: {
        enabled: sqlMirrorOutboxEnabled(),
        status: queue.dead > 0 || lagSeconds > maximumLagSeconds ? 'attention_required' : 'healthy',
        sql: sqlStatus(),
        worker: sqlMirrorOutboxWorkerStatus(),
        queue,
        syncLagSeconds: lagSeconds,
        maximumSyncLagSeconds: maximumLagSeconds,
        withinSyncLagTarget: lagSeconds <= maximumLagSeconds,
        costGuardrail: guardrailStatus(),
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return serverError(res);
  }
};

exports.listDeadLetters = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const records = await SqlMirrorOutbox.find({ status: 'dead' })
      .sort({ deadLetteredAt: -1 })
      .limit(limit)
      .select('_id domain operation attemptCount maxAttempts lastErrorCode firstRequestedAt requestedAt deadLetteredAt')
      .lean();
    return res.json({
      success: true,
      data: records.map((record) => ({
        id: String(record._id),
        domain: record.domain,
        operation: record.operation,
        attemptCount: record.attemptCount,
        maxAttempts: record.maxAttempts,
        lastErrorCode: record.lastErrorCode,
        firstRequestedAt: record.firstRequestedAt,
        requestedAt: record.requestedAt,
        deadLetteredAt: record.deadLetteredAt,
      })),
      limit,
    });
  } catch (error) {
    return serverError(res);
  }
};

module.exports.queueLagSeconds = queueLagSeconds;

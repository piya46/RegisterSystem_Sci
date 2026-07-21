const StoredObject = require('../models/storedObject');
const { deleteStoredObjectByReference, objectReference } = require('./objectStorage');

function cleanupFilter(now) {
  return {
    $or: [
      { status: 'pending', linkExpiresAt: { $lte: now } },
      { status: 'active', linkedAt: null, linkExpiresAt: { $lte: now } },
      { status: 'active', retentionUntil: { $ne: null, $lte: now } },
      { status: 'quarantined', updatedAt: { $lte: new Date(now.getTime() - 86400000) } },
    ],
  };
}

async function recoverStaleCleanupLocks(now = new Date()) {
  const staleBefore = new Date(now.getTime() - (30 * 60 * 1000));
  const records = await StoredObject.find({
    status: 'deleting',
    cleanupLockedAt: { $lte: staleBefore },
  }).limit(100).select('_id cleanupPreviousStatus linkedAt').lean();
  let recovered = 0;
  for (const record of records) {
    const status = ['pending', 'active', 'quarantined'].includes(record.cleanupPreviousStatus)
      ? record.cleanupPreviousStatus
      : (record.linkedAt ? 'active' : 'pending');
    const result = await StoredObject.updateOne(
      { _id: record._id, status: 'deleting', cleanupLockedAt: { $lte: staleBefore } },
      { $set: { status }, $unset: { cleanupLockedAt: 1, cleanupPreviousStatus: 1 } }
    );
    recovered += result.modifiedCount;
  }
  return recovered;
}

async function claimCleanupCandidate(now = new Date()) {
  const record = await StoredObject.findOne(cleanupFilter(now))
    .sort({ createdAt: 1 })
    .select('_id publicId status');
  if (!record) return null;
  const previousStatus = record.status;
  return StoredObject.findOneAndUpdate(
    { _id: record._id, status: previousStatus },
    {
      $set: {
        status: 'deleting',
        cleanupLockedAt: now,
        cleanupPreviousStatus: previousStatus,
      },
    },
    { new: true }
  ).select('publicId cleanupPreviousStatus');
}

async function cleanupExpiredStoredObjects({ limit = 100, dryRun = false } = {}) {
  const normalizedLimit = Math.min(Math.max(Math.floor(Number(limit) || 100), 1), 1000);
  const now = new Date();
  const filter = cleanupFilter(now);
  if (dryRun) {
    const candidates = await StoredObject.find(filter)
      .sort({ createdAt: 1 })
      .limit(normalizedLimit)
      .select('purpose status sizeBytes')
      .lean();
    return {
      dryRun: true,
      matched: candidates.length,
      bytes: candidates.reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0),
      byPurpose: Object.fromEntries(
        [...new Set(candidates.map((item) => item.purpose))]
          .map((purpose) => [purpose, candidates.filter((item) => item.purpose === purpose).length])
      ),
    };
  }

  const recoveredLocks = await recoverStaleCleanupLocks(now);
  let deleted = 0;
  let failed = 0;
  while (deleted + failed < normalizedLimit) {
    const record = await claimCleanupCandidate();
    if (!record) break;
    try {
      const removed = await deleteStoredObjectByReference(objectReference(record.publicId));
      if (!removed) {
        const error = new Error('Claimed stored object could not be deleted');
        error.code = 'STORED_OBJECT_DELETE_NOT_FOUND';
        throw error;
      }
      deleted += 1;
    } catch (error) {
      failed += 1;
      await StoredObject.updateOne(
        { _id: record._id, status: 'deleting' },
        {
          $set: { status: record.cleanupPreviousStatus || 'quarantined' },
          $unset: { cleanupLockedAt: 1, cleanupPreviousStatus: 1 },
        }
      ).catch(() => {});
    }
  }
  return { dryRun: false, deleted, failed, recoveredLocks };
}

module.exports = {
  cleanupExpiredStoredObjects,
  recoverStaleCleanupLocks,
};

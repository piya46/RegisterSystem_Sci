const cron = require('node-cron');
const { boolEnv } = require('../utils/cloudCostGuardrail');
const { objectStorageEnabled } = require('../utils/objectStorage');
const { cleanupExpiredStoredObjects } = require('../utils/storedObjectCleanup');

function initStorageCleanupScheduler() {
  if (!boolEnv('OBJECT_STORAGE_CLEANUP_SCHEDULER_ENABLED', objectStorageEnabled())) return null;
  return cron.schedule('15 3 * * *', async () => {
    try {
      const result = await cleanupExpiredStoredObjects({ limit: 500, dryRun: false });
      console.log('[ObjectStorage] Cleanup completed:', result);
    } catch (error) {
      console.error('[ObjectStorage] Cleanup failed:', {
        code: String(error.code || 'OBJECT_STORAGE_CLEANUP_FAILED').slice(0, 80),
      });
    }
  }, { scheduled: true, timezone: process.env.CLOUD_COST_TIMEZONE || 'Asia/Bangkok' });
}

module.exports = initStorageCleanupScheduler;

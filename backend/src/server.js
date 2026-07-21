require('dotenv').config();

const connectDB = require('./config/db');
const { disconnectDB } = require('./config/db');
const { closeSQL, connectSQL } = require('./config/sql');
const initScheduler = require('./cron/reportScheduler');
const initStorageCleanupScheduler = require('./cron/storageCleanupScheduler');
const {
  initializeKmsDataKeys,
  shutdownKmsDataKeys,
} = require('./utils/kmsDataKeys');
const {
  clearSecretCache,
  hydrateRuntimeSecrets,
} = require('./utils/secretProvider');
const { boolEnv } = require('./utils/cloudCostGuardrail');
const {
  startSqlMirrorOutboxWorker,
  stopSqlMirrorOutboxWorker,
} = require('./utils/sqlMirrorOutboxWorker');
const {
  initializeObjectStorage,
  shutdownObjectStorage,
} = require('./utils/objectStorage');

let httpServer = null;
let schedulerTask = null;
let storageCleanupTask = null;
let shuttingDown = false;

function safeError(error) {
  const production = process.env.NODE_ENV === 'production';
  const rawMessage = String(error?.message || 'Unknown startup error');
  return {
    code: error?.code || 'STARTUP_FAILED',
    message: (production && !/^Required runtime secret|^Pinned Secret Manager|^Field encryption/.test(rawMessage)
      ? 'A required startup dependency is unavailable'
      : rawMessage)
      .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[REDACTED_MONGODB_URI]')
      .replace(/_mongodb\._tcp\.[^\s]+/gi, '[REDACTED_MONGODB_SRV]')
      .replace(/Access denied for user '[^']+'/gi, "Access denied for user '[REDACTED]'")
      .replace(/(password|secret|token)=([^\s&]+)/gi, '$1=[REDACTED]'),
  };
}

async function writeSecretBootAudit(secretSummary) {
  try {
    const auditLog = require('./helpers/auditLog');
    await auditLog({
      action: 'SECRET_PROVIDER_BOOT',
      detail: JSON.stringify({
        provider: secretSummary.provider,
        loadedNames: secretSummary.loaded.map((item) => item.name),
        failedNames: secretSummary.failed.map((item) => item.name),
        loadedAt: secretSummary.loadedAt,
      }),
      strict: false,
    });
  } catch (error) {
    console.error('[SecretProvider] Unable to persist startup audit:', safeError(error));
  }
}

async function startServer() {
  const secretSummary = await hydrateRuntimeSecrets();
  const { assertTurnstileConfiguration } = require('./utils/verifyTurnstile');
  assertTurnstileConfiguration();

  // App modules that read process.env at require-time must load after secret hydration.
  const app = require('./app');
  await connectDB();
  await initializeObjectStorage();
  await writeSecretBootAudit(secretSummary);
  await initializeKmsDataKeys();
  if (boolEnv('FIELD_ENCRYPTION_ENABLED', false)) {
    const { encryptionEnabled } = require('./utils/fieldEncryption');
    if (!encryptionEnabled()) throw new Error('Field encryption is enabled but no valid active encryption key is available');
  }
  await connectSQL();
  await startSqlMirrorOutboxWorker();

  schedulerTask = initScheduler();
  storageCleanupTask = initStorageCleanupScheduler();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
  await new Promise((resolve, reject) => {
    httpServer = app.listen(port, host, resolve);
    const onError = (error) => reject(error);
    httpServer.once('error', onError);
    httpServer.once('listening', () => httpServer.removeListener('error', onError));
  });
  console.log(`Start Server Running on port ${port}`);
  return httpServer;
}

async function shutdown(signal = 'shutdown', { exitCode = 0 } = {}) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Server] ${signal}: shutting down`);

  if (schedulerTask) schedulerTask.stop();
  schedulerTask = null;
  if (storageCleanupTask) storageCleanupTask.stop();
  storageCleanupTask = null;
  if (httpServer) {
    const activeServer = httpServer;
    const timeoutMs = Math.min(Math.max(Number(process.env.SERVER_SHUTDOWN_TIMEOUT_MS || 10000), 1000), 30000);
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (typeof activeServer.closeAllConnections === 'function') activeServer.closeAllConnections();
        resolve();
      }, timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
      if (typeof activeServer.closeIdleConnections === 'function') activeServer.closeIdleConnections();
      activeServer.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    httpServer = null;
  }
  await stopSqlMirrorOutboxWorker().catch((error) => {
    console.error('[Server] SQL mirror worker shutdown failed:', safeError(error));
  });
  await closeSQL().catch((error) => console.error('[Server] SQL shutdown failed:', safeError(error)));
  await disconnectDB().catch((error) => console.error('[Server] MongoDB shutdown failed:', safeError(error)));
  shutdownObjectStorage();
  shutdownKmsDataKeys();
  clearSecretCache();
  process.exitCode = exitCode;
}

if (require.main === module) {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      shutdown(signal).catch((error) => {
        console.error('[Server] Shutdown failed:', safeError(error));
        process.exitCode = 1;
      });
    });
  }

  startServer().catch(async (error) => {
    console.error('Server startup failed:', safeError(error));
    await shutdown('startup_failure', { exitCode: 1 });
  });
}

module.exports = {
  shutdown,
  startServer,
};

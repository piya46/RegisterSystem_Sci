const { mongoStatus } = require('../config/db');
const { sqlStatus } = require('../config/sql');
const { kmsDataKeyStatus } = require('./kmsDataKeys');
const { secretProviderStatus } = require('./secretProvider');
const { sqlMirrorOutboxWorkerStatus } = require('./sqlMirrorOutboxWorker');
const { objectStorageStatus } = require('./objectStorage');
const { mongoSecurityPostureStatus } = require('./mongoSecurityPosture');

function publicReadiness() {
  const mongo = mongoStatus();
  const sql = sqlStatus();
  const kms = kmsDataKeyStatus();
  const secrets = secretProviderStatus();
  const outbox = sqlMirrorOutboxWorkerStatus();
  const objectStorage = objectStorageStatus();
  const mongoSecurity = mongoSecurityPostureStatus();

  const checks = {
    secrets: secrets.healthy ? 'up' : 'down',
    mongodb: mongo.connected ? 'up' : 'down',
    sql: sql.enabled ? (sql.connected ? 'up' : 'down') : 'disabled',
    kms: kms.enabled ? (kms.cachedKeyCount > 0 ? 'up' : 'down') : 'disabled',
    sqlMirrorOutbox: outbox.enabled ? (outbox.healthy ? 'up' : 'down') : 'disabled',
    objectStorage: objectStorage.initialized && objectStorage.healthy ? 'up' : 'down',
    mongoSecurityPosture: mongoSecurity.required
      ? (mongoSecurity.checked && mongoSecurity.healthy ? 'up' : 'down')
      : 'disabled',
  };
  const ready = checks.secrets === 'up'
    && checks.mongodb === 'up'
    && checks.sql !== 'down'
    && checks.kms !== 'down'
    && checks.sqlMirrorOutbox !== 'down'
    && checks.objectStorage !== 'down'
    && checks.mongoSecurityPosture !== 'down';

  return {
    ready,
    status: ready ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  publicReadiness,
};

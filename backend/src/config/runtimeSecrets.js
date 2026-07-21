const { boolEnv } = require('../utils/cloudCostGuardrail');

const CORE_SECRET_NAMES = [
  'MONGODB_URI',
  'JWT_SECRET',
];

const PRODUCTION_SECRET_NAMES = [
  'SESSION_TOKEN_HASH_SECRET',
  'CSRF_SECRET',
  'VENDOR_QR_SECRET',
  'SLIP_PROOF_SECRET',
  'TURNSTILE_SECRET_KEY',
];

function csvEnv(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function addEmailSecrets(names) {
  const enabled = boolEnv('PARTICIPANT_EMAIL_LOGIN_ENABLED', Boolean(process.env.SMTP_HOST));
  if (!enabled) return;
  if (process.env.NODE_ENV === 'production' && boolEnv('MOCK_EMAIL', false)) {
    throw new Error('MOCK_EMAIL cannot be enabled when participant email login is enabled in production');
  }
  if (!process.env.SMTP_HOST) throw new Error('SMTP_HOST is required when participant email login is enabled');
  names.add('SMTP_USER');
  names.add('SMTP_PASS');
}

function addLineSecrets(names) {
  if (boolEnv('LINE_LOGIN_ENABLED', false)) {
    if (!process.env.LINE_LOGIN_CHANNEL_ID && !process.env.LINE_CLIENT_ID && !process.env.LINE_CHANNEL_ID) {
      throw new Error('LINE_LOGIN_CHANNEL_ID is required when LINE login is enabled');
    }
    names.add('LINE_LOGIN_CHANNEL_SECRET');
  }
  if (boolEnv('LINE_WEBHOOK_ENABLED', false)) names.add('LINE_WEBHOOK_CHANNEL_SECRET');
  if (boolEnv('LINE_MESSAGING_ENABLED', false) || process.env.LINE_GROUP_ID) {
    names.add('LINE_CHANNEL_ACCESS_TOKEN');
  }
}

function addFieldEncryptionSecrets(names) {
  if (!boolEnv('FIELD_ENCRYPTION_ENABLED', false)) return;

  names.add('DATA_BLIND_INDEX_SECRET');
  if (boolEnv('KMS_DATA_KEY_ENABLED', boolEnv('GOOGLE_KMS_ENABLED', false))) {
    names.add('KMS_WRAPPED_DATA_KEYS');
  } else {
    const configuredName = String(process.env.FIELD_ENCRYPTION_SECRET_NAME || '').trim();
    const keySecretName = configuredName
      || ['DATA_ENCRYPTION_KEYS', 'DATA_ENCRYPTION_KEY', 'FIELD_ENCRYPTION_KEY']
        .find((name) => process.env[name])
      || 'DATA_ENCRYPTION_KEYS';
    if (!['DATA_ENCRYPTION_KEYS', 'DATA_ENCRYPTION_KEY', 'FIELD_ENCRYPTION_KEY'].includes(keySecretName)) {
      throw new Error('FIELD_ENCRYPTION_SECRET_NAME must reference a supported encryption secret');
    }
    names.add(keySecretName);
  }
}

function addIntegrationSecrets(names) {
  if (boolEnv('GOOGLE_DRIVE_ENABLED', false)) {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_DRIVE_FOLDER_ID) {
      throw new Error('GOOGLE_CLIENT_ID and GOOGLE_DRIVE_FOLDER_ID are required when Google Drive is enabled');
    }
    names.add('GOOGLE_CLIENT_SECRET');
    names.add('GOOGLE_REFRESH_TOKEN');
  }
  if (boolEnv('SQL_ENABLED', false)) {
    names.add('SQL_PASSWORD');
    if (process.env.SQL_SSL_CA_SECRET_NAME) names.add('SQL_SSL_CA');
  }
  if (boolEnv('SQL_MIRROR_ENABLED', false)) names.add('SQL_MIRROR_IDENTITY_HASH_SECRET');
  if (isProduction()
      && String(process.env.OBJECT_STORAGE_PROVIDER || 'local').toLowerCase() === 'local') {
    names.add('OBJECT_STORAGE_LOCAL_SIGNING_SECRET');
  }
}

function requiredRuntimeSecretNames() {
  const names = new Set(CORE_SECRET_NAMES);
  if (isProduction()) PRODUCTION_SECRET_NAMES.forEach((name) => names.add(name));
  addEmailSecrets(names);
  addLineSecrets(names);
  addFieldEncryptionSecrets(names);
  addIntegrationSecrets(names);
  return [...names];
}

function managedRuntimeSecretNames() {
  return [...new Set([
    ...requiredRuntimeSecretNames(),
    ...csvEnv('SECRET_MANAGER_LOAD_NAMES'),
  ])];
}

module.exports = {
  managedRuntimeSecretNames,
  requiredRuntimeSecretNames,
};

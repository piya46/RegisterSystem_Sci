const test = require('node:test');
const assert = require('node:assert/strict');
const {
  clearSecretCache,
  hydrateRuntimeSecrets,
  secretVersionResource,
  secretProviderStatus,
} = require('../src/utils/secretProvider');

const ORIGINAL_ENV = { ...process.env };

function resetEnvironment() {
  for (const name of Object.keys(process.env)) {
    if (!(name in ORIGINAL_ENV)) delete process.env[name];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  clearSecretCache();
}

function disableOptionalSecretFeatures() {
  process.env.FIELD_ENCRYPTION_ENABLED = 'false';
  process.env.FIRESTORE_MIRROR_ENABLED = 'false';
  process.env.GOOGLE_DRIVE_ENABLED = 'false';
  process.env.KMS_DATA_KEY_ENABLED = 'false';
  process.env.LINE_MESSAGING_ENABLED = 'false';
  process.env.LINE_LOGIN_ENABLED = 'false';
  process.env.LINE_WEBHOOK_ENABLED = 'false';
  process.env.MOCK_EMAIL = 'true';
  process.env.PARTICIPANT_EMAIL_LOGIN_ENABLED = 'false';
  process.env.SQL_ENABLED = 'false';
  process.env.SQL_MIRROR_ENABLED = 'false';
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_DRIVE_FOLDER_ID;
  delete process.env.LINE_CLIENT_ID;
  delete process.env.LINE_CHANNEL_ID;
  delete process.env.LINE_GROUP_ID;
  delete process.env.LINE_LOGIN_CHANNEL_ID;
  delete process.env.SECRET_MANAGER_LOAD_NAMES;
  delete process.env.SMTP_HOST;
}

test.afterEach(resetEnvironment);

test('env provider hydrates required core secrets without exposing values in status', async () => {
  process.env.NODE_ENV = 'test';
  process.env.SECRET_PROVIDER = 'env';
  process.env.MONGODB_URI = 'mongodb://localhost:27017/psevent_test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  disableOptionalSecretFeatures();

  const result = await hydrateRuntimeSecrets();

  assert.deepEqual(result.loaded.map((item) => item.name), ['MONGODB_URI', 'JWT_SECRET']);
  assert.equal(secretProviderStatus().healthy, true);
  assert.equal('value' in secretProviderStatus(), false);
});

test('strict validation rejects reused signing secrets', async () => {
  const shared = 'a'.repeat(40);
  process.env.NODE_ENV = 'production';
  process.env.SECRET_PROVIDER = 'env';
  process.env.MONGODB_URI = 'mongodb://localhost:27017/psevent';
  process.env.JWT_SECRET = shared;
  process.env.SESSION_TOKEN_HASH_SECRET = shared;
  process.env.CSRF_SECRET = 'b'.repeat(40);
  process.env.VENDOR_QR_SECRET = 'c'.repeat(40);
  process.env.SLIP_PROOF_SECRET = 'd'.repeat(40);
  process.env.TURNSTILE_SECRET_KEY = 'turnstile-production-key';
  process.env.OBJECT_STORAGE_PROVIDER = 'local';
  process.env.OBJECT_STORAGE_LOCAL_SIGNING_SECRET = 'e'.repeat(40);
  disableOptionalSecretFeatures();

  await assert.rejects(hydrateRuntimeSecrets(), /must use different values/);
});

test('production local object storage requires a dedicated signing secret', async () => {
  process.env.NODE_ENV = 'production';
  process.env.SECRET_PROVIDER = 'env';
  process.env.MONGODB_URI = 'mongodb://localhost:27017/psevent';
  process.env.JWT_SECRET = 'a'.repeat(40);
  process.env.SESSION_TOKEN_HASH_SECRET = 'b'.repeat(40);
  process.env.CSRF_SECRET = 'c'.repeat(40);
  process.env.VENDOR_QR_SECRET = 'd'.repeat(40);
  process.env.SLIP_PROOF_SECRET = 'e'.repeat(40);
  process.env.TURNSTILE_SECRET_KEY = 'turnstile-production-key';
  process.env.OBJECT_STORAGE_PROVIDER = 'local';
  disableOptionalSecretFeatures();
  delete process.env.OBJECT_STORAGE_LOCAL_SIGNING_SECRET;

  await assert.rejects(hydrateRuntimeSecrets(), /OBJECT_STORAGE_LOCAL_SIGNING_SECRET is missing/);
});

test('SQL mirror protection key must be separate and SQL CA must be PEM', async () => {
  const shared = 'm'.repeat(40);
  process.env.NODE_ENV = 'production';
  process.env.SECRET_PROVIDER = 'env';
  process.env.JWT_SECRET = shared;
  process.env.SQL_MIRROR_IDENTITY_HASH_SECRET = shared;

  await assert.rejects(hydrateRuntimeSecrets({
    requiredNames: ['JWT_SECRET', 'SQL_MIRROR_IDENTITY_HASH_SECRET'],
    managedNames: ['JWT_SECRET', 'SQL_MIRROR_IDENTITY_HASH_SECRET'],
  }), /must use different values/);

  process.env.SQL_SSL_CA = 'not-a-certificate';
  await assert.rejects(hydrateRuntimeSecrets({
    requiredNames: ['SQL_SSL_CA'],
    managedNames: ['SQL_SSL_CA'],
  }), /PEM certificate chain/);

  process.env.SQL_SSL_CA = [
    '-----BEGIN CERTIFICATE-----',
    'test-certificate',
    '-----END CERTIFICATE-----',
    ['-----BEGIN ', 'PRIVATE', ' KEY-----'].join(''),
    'must-not-be-loaded-as-a-ca',
    ['-----END ', 'PRIVATE', ' KEY-----'].join(''),
  ].join('\n');
  await assert.rejects(hydrateRuntimeSecrets({
    requiredNames: ['SQL_SSL_CA'],
    managedNames: ['SQL_SSL_CA'],
  }), /must not contain a private key/);
});

test('pinned Secret Manager resources are bound to project, secret id, and numeric version', () => {
  process.env.NODE_ENV = 'production';
  process.env.SECRET_MANAGER_REQUIRE_PINNED_VERSIONS = 'true';
  process.env.SECRET_MANAGER_PROJECT_ID = 'cusa-reunion';
  process.env.SECRET_MANAGER_PREFIX = 'psevent-staging';

  process.env.SECRET_MANAGER_PINNED_VERSIONS_JSON = JSON.stringify({
    JWT_SECRET: 'projects/cusa-reunion/secrets/psevent-staging-JWT_SECRET/versions/7',
  });
  assert.equal(
    secretVersionResource('JWT_SECRET'),
    'projects/cusa-reunion/secrets/psevent-staging-JWT_SECRET/versions/7'
  );

  process.env.SECRET_MANAGER_PINNED_VERSIONS_JSON = JSON.stringify({
    JWT_SECRET: 'projects/other-project/secrets/psevent-staging-JWT_SECRET/versions/7',
  });
  assert.throws(() => secretVersionResource('JWT_SECRET'), /project does not match/);

  process.env.SECRET_MANAGER_PINNED_VERSIONS_JSON = JSON.stringify({
    JWT_SECRET: 'projects/cusa-reunion/secrets/psevent-production-JWT_SECRET/versions/7',
  });
  assert.throws(() => secretVersionResource('JWT_SECRET'), /id does not match/);

  process.env.SECRET_MANAGER_PINNED_VERSIONS_JSON = JSON.stringify({
    JWT_SECRET: 'projects/cusa-reunion/secrets/psevent-staging-JWT_SECRET/versions/latest',
  });
  assert.throws(() => secretVersionResource('JWT_SECRET'), /version must be numeric/);
});

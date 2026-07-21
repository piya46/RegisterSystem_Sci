const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  assertObjectStorageConfiguration,
  conflictingLifecycleDeleteRules,
  lifecycleHasSlipDeletion,
  objectReference,
  parseObjectReference,
  parsePublicObjectId,
  publicObjectUrl,
  verifyLocalSignature,
} = require('../src/utils/objectStorage');

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  for (const name of Object.keys(process.env)) {
    if (!(name in ORIGINAL_ENV)) delete process.env[name];
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

test('managed object references and public URLs use opaque UUIDs', () => {
  const publicId = crypto.randomUUID();
  process.env.OBJECT_STORAGE_PUBLIC_API_ORIGIN = 'https://events.example.test';
  const reference = objectReference(publicId);
  const url = publicObjectUrl(publicId);

  assert.equal(parseObjectReference(reference), publicId);
  assert.equal(parsePublicObjectId(url), publicId);
  assert.equal(parseObjectReference('object://../../secret'), null);
  assert.equal(parsePublicObjectId('/uploads/private/file.png'), null);
});

test('local signed URL verification rejects expiry and signature tampering', () => {
  const publicId = crypto.randomUUID();
  const expires = Math.floor(Date.now() / 1000) + 300;
  process.env.OBJECT_STORAGE_LOCAL_SIGNING_SECRET = 'local-object-signing-secret-that-is-long-enough';
  const signature = crypto
    .createHmac('sha256', process.env.OBJECT_STORAGE_LOCAL_SIGNING_SECRET)
    .update(`${publicId}.${expires}`)
    .digest('hex');

  assert.equal(verifyLocalSignature(publicId, expires, signature), true);
  const tampered = `${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`;
  assert.equal(verifyLocalSignature(publicId, expires, tampered), false);
  assert.equal(verifyLocalSignature(publicId, expires - 600, signature), false);
});

test('production public API origin must use HTTPS and contain no path', () => {
  process.env.NODE_ENV = 'production';
  process.env.OBJECT_STORAGE_PROVIDER = 'local';
  process.env.OBJECT_STORAGE_PUBLIC_API_ORIGIN = 'http://example.test/api';

  assert.throws(assertObjectStorageConfiguration, /only scheme, host/);
});

test('production also validates PUBLIC_URL when no object-specific origin is set', () => {
  process.env.NODE_ENV = 'production';
  process.env.OBJECT_STORAGE_PROVIDER = 'local';
  delete process.env.OBJECT_STORAGE_PUBLIC_API_ORIGIN;
  process.env.PUBLIC_URL = 'http://example.test';

  assert.throws(assertObjectStorageConfiguration, /must use HTTPS/);
});

test('production GCS rejects a multi-region location under the cost policy', () => {
  process.env.NODE_ENV = 'production';
  process.env.OBJECT_STORAGE_PROVIDER = 'gcs';
  process.env.OBJECT_STORAGE_PUBLIC_API_ORIGIN = 'https://events.example.test';
  process.env.GCS_BUCKET = 'private-production-bucket';
  process.env.GCS_LOCATION = 'ASIA';
  process.env.GCS_REQUIRE_SINGLE_REGION = 'true';
  process.env.LEGACY_UPLOADS_PUBLIC_ENABLED = 'false';

  assert.throws(assertObjectStorageConfiguration, /must be a single region/);

  process.env.GCS_LOCATION = 'asia-southeast1';
  assert.doesNotThrow(assertObjectStorageConfiguration);
});

test('payment slip lifecycle includes the configured deletion grace period', () => {
  process.env.GCS_OBJECT_PREFIX = 'psevent/production';
  process.env.GCS_SLIP_RETENTION_DAYS = '365';
  process.env.GCS_UNLINKED_UPLOAD_TTL_HOURS = '24';
  process.env.GCS_LIFECYCLE_DELETE_GRACE_DAYS = '2';
  const metadata = (age) => ({
    lifecycle: {
      rule: [{
        action: { type: 'Delete' },
        condition: { age, matchesPrefix: ['psevent/production/payment_slip/'] },
      }],
    },
  });

  assert.equal(lifecycleHasSlipDeletion(metadata(367)), false);
  assert.equal(conflictingLifecycleDeleteRules(metadata(367)).length, 1);
  assert.equal(lifecycleHasSlipDeletion(metadata(368)), true);
  assert.equal(conflictingLifecycleDeleteRules(metadata(368)).length, 0);
});

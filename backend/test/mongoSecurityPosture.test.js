const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateMongoSecurityPosture,
  hasCorrectTtlIndex,
  hasLegacyTokenIndex,
  hasPlaintextFieldIndex,
  mongoSecurityPostureRequired,
  plaintextValueFilter,
} = require('../src/utils/mongoSecurityPosture');

test('production requires the MongoDB security posture and staging may defer it', () => {
  assert.equal(mongoSecurityPostureRequired({
    NODE_ENV: 'production',
    DEPLOY_ENVIRONMENT: 'production',
  }), true);
  assert.equal(mongoSecurityPostureRequired({
    NODE_ENV: 'production',
    DEPLOY_ENVIRONMENT: 'production',
    MONGO_SECURITY_POSTURE_REQUIRED: 'false',
  }), true);
  assert.equal(mongoSecurityPostureRequired({
    NODE_ENV: 'production',
    DEPLOY_ENVIRONMENT: 'staging',
    MONGO_SECURITY_POSTURE_REQUIRED: 'false',
  }), false);
  assert.equal(mongoSecurityPostureRequired({
    NODE_ENV: 'production',
    MONGO_SECURITY_POSTURE_REQUIRED: 'false',
  }), true);
  assert.equal(mongoSecurityPostureRequired({ NODE_ENV: 'development' }), false);
});

test('MongoDB security posture fails closed for any migration finding', () => {
  assert.equal(evaluateMongoSecurityPosture().healthy, true);
  const result = evaluateMongoSecurityPosture({
    participantPlaintextDocuments: 1,
    missingTtlIndexes: 2,
  });
  assert.equal(result.healthy, false);
  assert.equal(result.findings.participantPlaintextDocuments, 1);
  assert.equal(result.findings.missingTtlIndexes, 2);
});

test('MongoDB security posture classifies critical indexes without values', () => {
  const sensitive = new Set(['email']);
  assert.equal(hasPlaintextFieldIndex({ key: { 'fields.email': 1 } }, sensitive), true);
  assert.equal(hasPlaintextFieldIndex({ key: { 'secureIndex.email': 1 } }, sensitive), false);
  assert.equal(hasLegacyTokenIndex({ key: { token: 1 } }), true);
  assert.equal(hasLegacyTokenIndex({ key: { tokenHash: 1 } }), false);
  assert.equal(hasCorrectTtlIndex([
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  ]), true);
  assert.equal(hasCorrectTtlIndex([{ key: { expiresAt: 1 } }]), false);
});

test('plaintext query requires a meaningful value without the encryption marker', () => {
  assert.deepEqual(plaintextValueFilter('fields.email'), {
    'fields.email': { $exists: true, $nin: [null, ''] },
    'fields.email.__enc': { $ne: 'aes-256-gcm' },
  });
});

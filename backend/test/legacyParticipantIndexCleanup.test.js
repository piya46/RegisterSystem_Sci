const test = require('node:test');
const assert = require('node:assert/strict');
const {
  plaintextFieldCounts,
  plaintextFieldIndex,
} = require('../src/scripts/cleanupLegacyParticipantIndexes');

const encrypted = {
  __enc: 'aes-256-gcm',
  kid: 'v1',
  iv: 'aXY=',
  tag: 'dGFn',
  data: 'ZGF0YQ==',
};

test('legacy index cleanup recognizes only ascending single-field participant indexes', () => {
  assert.equal(plaintextFieldIndex({ key: { 'fields.email': 1 } }), 'email');
  assert.equal(plaintextFieldIndex({ key: { 'fields.email': -1 } }), null);
  assert.equal(plaintextFieldIndex({ key: { 'fields.email': 1, eventId: 1 } }), null);
  assert.equal(plaintextFieldIndex({ key: { 'secureIndex.email': 1 } }), null);
});

test('legacy index cleanup counts metadata without returning plaintext values', () => {
  const counts = plaintextFieldCounts([
    { fields: { email: 'legacy@example.test', dept: encrypted } },
    { fields: { email: encrypted, dept: 'Science' } },
    { fields: { email: '', dept: null } },
  ], ['email', 'dept']);
  assert.deepEqual(counts, { email: 1, dept: 1 });
});

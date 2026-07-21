const test = require('node:test');
const assert = require('node:assert/strict');
const {
  participantOperationalResponse,
  participantRegistrationResponse,
} = require('../src/utils/participantResponse');

test('public registration response uses a strict allowlist', () => {
  const registeredAt = new Date('2026-07-17T12:00:00.000Z');
  const response = participantRegistrationResponse({
    _id: 'internal-participant-id',
    qrCode: 'opaque-ticket-code',
    status: 'registered',
    eventYear: '2027',
    registeredAt,
    fields: { name: 'Private Person', email: 'private@example.com' },
    secureIndex: { email: 'blind-index' },
    secureSearch: ['search-token'],
    lineUserId: 'private-line-id',
    participantTokenVersion: 4,
    certificateVerificationId: 'private-certificate-id',
    registrationIdempotencyKeyHash: 'private-idempotency-hash',
  });

  assert.deepEqual(response, {
    code: 'opaque-ticket-code',
    status: 'registered',
    eventYear: '2027',
    registeredAt,
  });
});

test('operational participant response strips cryptographic and authentication internals', () => {
  const response = participantOperationalResponse({
    _id: 'participant-id',
    fields: { name: 'Visible to authorized staff' },
    qrCode: 'ticket-code',
    secureIndex: { email: 'blind-index' },
    secureSearch: ['search-token'],
    registrationIdempotencyKeyHash: 'idempotency-hash',
    certificateVerificationId: 'certificate-token',
    participantTokenVersion: 2,
    trustedDevices: [{ id: 'device' }],
    lineUserId: 'line-user-id',
    isLineLinked: true,
  });

  assert.equal(response._id, 'participant-id');
  assert.equal(response.qrCode, 'ticket-code');
  assert.equal(response.isLineLinked, true);
  assert.equal(response.secureIndex, undefined);
  assert.equal(response.secureSearch, undefined);
  assert.equal(response.registrationIdempotencyKeyHash, undefined);
  assert.equal(response.certificateVerificationId, undefined);
  assert.equal(response.participantTokenVersion, undefined);
  assert.equal(response.trustedDevices, undefined);
  assert.equal(response.lineUserId, undefined);
});

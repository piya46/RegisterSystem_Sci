const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hashIdempotencyKey,
  normalizeIdempotencyKey,
  requestFingerprint,
} = require('../src/utils/idempotency');
const Participant = require('../src/models/participant');

test('idempotency keys are validated and stored only as deterministic hashes', () => {
  const key = '018f26d0-6e59-7c59-9f7d-5fbbdf831234';
  assert.equal(normalizeIdempotencyKey(key, { required: true }), key);
  assert.match(hashIdempotencyKey('donation:event-1', key), /^[a-f0-9]{64}$/);
  assert.throws(
    () => normalizeIdempotencyKey('short', { required: true }),
    /รูปแบบ Idempotency-Key/
  );
  assert.throws(
    () => normalizeIdempotencyKey('', { required: true }),
    /Idempotency-Key/
  );
});

test('request fingerprints are stable across object key order and detect payload changes', () => {
  const first = requestFingerprint({ amount: 500, eventId: 'event-1', package: { size: 'M', name: 'A' } });
  const reordered = requestFingerprint({ package: { name: 'A', size: 'M' }, eventId: 'event-1', amount: 500 });
  const changed = requestFingerprint({ amount: 501, eventId: 'event-1', package: { size: 'M', name: 'A' } });
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
});

test('participant registration stores only hashed replay metadata with a unique Event index', () => {
  const keyPath = Participant.schema.path('registrationIdempotencyKeyHash');
  const fingerprintPath = Participant.schema.path('registrationIdempotencyFingerprint');
  assert.equal(keyPath.options.select, false);
  assert.equal(keyPath.options.immutable, true);
  assert.equal(fingerprintPath.options.select, false);
  assert.equal(fingerprintPath.options.immutable, true);

  const index = Participant.schema.indexes().find(([, options]) => (
    options.name === 'uq_participant_registration_idempotency_per_event'
  ));
  assert.deepEqual(index?.[0], { eventId: 1, registrationIdempotencyKeyHash: 1 });
  assert.equal(index?.[1]?.unique, true);
  assert.deepEqual(index?.[1]?.partialFilterExpression, {
    registrationIdempotencyKeyHash: { $type: 'string' },
  });
});

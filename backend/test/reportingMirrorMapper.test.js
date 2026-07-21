const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mapDonation,
  mapParticipant,
  sourceHash,
} = require('../src/sql/reportingMirrorMapper');

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  for (const name of Object.keys(process.env)) {
    if (!(name in ORIGINAL_ENV)) delete process.env[name];
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

test('reporting mirror participant mapper never emits plaintext identity fields', () => {
  process.env.SQL_MIRROR_IDENTITY_HASH_SECRET = 'mirror-test-secret-that-is-long-enough';
  const mapped = mapParticipant({
    _id: '64b000000000000000000001',
    eventId: '64b000000000000000000002',
    qrCode: 'QR-001',
    fields: { name: 'Sensitive Name', email: 'private@example.com' },
    secureIndex: { email: 'a'.repeat(64), phone: 'b'.repeat(64) },
    lineUserId: 'U-sensitive-line-id',
    isLineLinked: true,
    registeredAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  const serialized = JSON.stringify(mapped);
  assert.doesNotMatch(serialized, /Sensitive Name|private@example\.com|U-sensitive-line-id/);
  assert.match(mapped.row.line_user_blind_index, /^[a-f0-9]{64}$/);
  assert.equal(mapped.row.email_blind_index, 'a'.repeat(64));
});

test('reporting mirror donation mapper excludes donor name, address, and slip', () => {
  const mapped = mapDonation({
    _id: '64b000000000000000000003',
    firstName: 'Private',
    lastName: 'Donor',
    address: 'Private address',
    slipUrl: 'https://private.example/slip.jpg',
    amount: 500,
    transferDateTime: new Date('2026-01-02T00:00:00.000Z'),
  });

  const serialized = JSON.stringify(mapped);
  assert.doesNotMatch(serialized, /Private|Donor|address|slip\.jpg/);
  assert.equal(mapped.row.amount, 500);
});

test('source hash is deterministic across object key order', () => {
  assert.equal(sourceHash({ a: 1, b: { c: 2 } }), sourceHash({ b: { c: 2 }, a: 1 }));
});

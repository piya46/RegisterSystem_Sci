const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mapDonation,
  mapParticipant,
  mapReceipt,
  mapTransaction,
  mapVendor,
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
  assert.doesNotMatch(serialized, /QR-001/);
  assert.match(mapped.row.qr_code, /^[a-f0-9]{64}$/);
  assert.match(mapped.row.line_user_blind_index, /^[a-f0-9]{64}$/);
  assert.equal(mapped.row.email_blind_index, 'a'.repeat(64));
});

test('reporting mirror hashes bearer-like values before SQL storage', () => {
  process.env.SQL_MIRROR_IDENTITY_HASH_SECRET = 'mirror-test-secret-that-is-long-enough';
  const transaction = mapTransaction({
    _id: '64b000000000000000000004',
    walletId: '64b000000000000000000005',
    vendorId: '64b000000000000000000006',
    idempotencyKey: 'raw-idempotency-key',
    verificationCode: '123456',
    amount: 20,
  });
  const vendor = mapVendor({
    _id: '64b000000000000000000007',
    qrCodeId: 'vendor-static-qr',
    name: 'Public vendor name',
  });
  const receipt = mapReceipt({
    _id: '64b000000000000000000008',
    receiptNumber: 'RECEIPT-0001',
    amount: 20,
  });

  const serialized = JSON.stringify({ transaction, vendor, receipt });
  assert.doesNotMatch(serialized, /raw-idempotency-key|vendor-static-qr|RECEIPT-0001/);
  assert.notEqual(transaction.row.verification_code, '123456');
  for (const value of [
    transaction.row.idempotency_key,
    transaction.row.verification_code,
    vendor.row.qr_code_id,
    receipt.row.receipt_number,
  ]) assert.match(value, /^[a-f0-9]{64}$/);
});

test('reporting mirror refuses protected values without a dedicated key', () => {
  delete process.env.SQL_MIRROR_IDENTITY_HASH_SECRET;

  assert.throws(() => mapParticipant({
    _id: '64b000000000000000000009',
    qrCode: 'must-not-be-stored-raw',
  }), (error) => error.code === 'SQL_MIRROR_PROTECTION_KEY_MISSING');
});

test('reporting mirror refuses malformed or plaintext participant blind indexes', () => {
  process.env.SQL_MIRROR_IDENTITY_HASH_SECRET = 'mirror-test-secret-that-is-long-enough';

  assert.throws(() => mapParticipant({
    _id: '64b000000000000000000010',
    qrCode: 'QR-010',
    secureIndex: { email: 'private@example.com' },
  }), (error) => error.code === 'SQL_MIRROR_UNPROTECTED_INDEX');
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

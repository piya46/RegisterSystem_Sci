const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWalletBalancePayload } = require('../src/utils/walletResponse');

test('guest wallet payload omits owner participant data and full wallet balance', () => {
  const payload = buildWalletBalancePayload({
    wallet: { coinBalance: 100, coupons: [{ code: 'FOOD' }] },
    guestToken: {
      limitAmount: 30,
      spentAmount: 12,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    },
    participant: { fields: { name: 'Must not leak', email: 'private@example.test' } },
  });

  assert.equal(payload.coinBalance, 18);
  assert.equal(payload.guestAccess.remainingAmount, 18);
  assert.equal(Object.hasOwn(payload, 'participant'), false);
  assert.equal(Object.hasOwn(payload, 'walletCoinBalance'), false);
  assert.equal(JSON.stringify(payload).includes('private@example.test'), false);
});

test('owner wallet payload includes its participant and full balance', () => {
  const participant = { status: 'checkedIn', certificateVerificationId: 'cert_example' };
  const payload = buildWalletBalancePayload({
    wallet: { coinBalance: 100, coupons: [] },
    participant,
  });

  assert.equal(payload.coinBalance, 100);
  assert.equal(payload.walletCoinBalance, 100);
  assert.equal(payload.participant, participant);
  assert.equal(payload.guestAccess, null);
});

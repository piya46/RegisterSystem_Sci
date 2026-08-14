const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const migrateWallets = require('../src/scripts/migrate_wallets');

test('wallet migration uses an event-scoped deterministic lookup key', () => {
  const participantId = new mongoose.Types.ObjectId();
  const eventId = new mongoose.Types.ObjectId();
  const scope = migrateWallets.walletScope({
    _id: participantId,
    eventId,
    eventYear: 2027,
  });
  assert.equal(scope.participantId, participantId);
  assert.equal(scope.eventId, eventId);
  assert.equal(scope.eventYear, '2027');
  assert.equal(
    migrateWallets.walletScopeKey(scope),
    `${participantId}:${eventId}:2027`
  );
  assert.notEqual(
    migrateWallets.walletScopeKey(scope),
    migrateWallets.walletScopeKey({ ...scope, eventId: null })
  );
});

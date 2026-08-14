const mongoose = require('mongoose');
const crypto = require('crypto');
const GuestToken = require('../models/guestToken');
const { explicitMigrationApply } = require('../utils/migrationMode');
const { connectMongoForMigration } = require('../utils/mongoMigrationConnection');

function hashGuestToken(token) {
  const secret = process.env.SESSION_TOKEN_HASH_SECRET || process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(String(secret), 'utf8') < 32) {
    throw new Error('SESSION_TOKEN_HASH_SECRET or JWT_SECRET must be at least 32 bytes for guest-token migration');
  }
  return crypto.createHmac('sha256', secret).update(String(token)).digest('hex');
}

async function migrateGuestTokens({ dryRun = true, unsetPlaintext = false } = {}) {
  const query = { token: { $exists: true, $nin: [null, ''] } };
  const total = await GuestToken.collection.countDocuments(query);
  const stats = {
    dryRun,
    plaintextTokens: total,
    needTokenHash: 0,
    wouldUnsetPlaintext: unsetPlaintext ? total : 0,
    hashesWritten: 0,
    plaintextUnset: 0,
    skippedByConcurrentWrite: 0,
  };
  const cursor = GuestToken.collection.find(query, {
    projection: { token: 1, tokenHash: 1 },
  });
  for await (const guestToken of cursor) {
    const needsHash = !guestToken.tokenHash;
    if (needsHash) stats.needTokenHash += 1;
    if (dryRun) continue;

    const update = {};
    if (needsHash) update.$set = { tokenHash: hashGuestToken(guestToken.token) };
    if (unsetPlaintext) update.$unset = { token: '' };
    if (!update.$set && !update.$unset) continue;

    const result = await GuestToken.collection.updateOne(
      { _id: guestToken._id, token: guestToken.token },
      update
    );
    if (result.modifiedCount !== 1) {
      stats.skippedByConcurrentWrite += 1;
      continue;
    }
    if (needsHash) stats.hashesWritten += 1;
    if (unsetPlaintext) stats.plaintextUnset += 1;
  }

  console.log(JSON.stringify(stats, null, 2));
  if (dryRun) console.log('Run with --apply and GUEST_TOKEN_MIGRATION_WRITE=true to write changes.');
  if (!unsetPlaintext) console.log('Plaintext token field was kept for compatibility. Set GUEST_TOKEN_UNSET_PLAINTEXT=true after cutover.');
  return stats;
}

module.exports = migrateGuestTokens;

if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  connectMongoForMigration(process.env.MONGODB_URI)
    .then(() => {
      const apply = explicitMigrationApply({
        writeFlag: 'GUEST_TOKEN_MIGRATION_WRITE',
        mongoSafetyGate: true,
      });
      return migrateGuestTokens({
      dryRun: !apply,
      unsetPlaintext: process.env.GUEST_TOKEN_UNSET_PLAINTEXT === 'true',
      });
    })
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

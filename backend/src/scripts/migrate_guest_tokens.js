const mongoose = require('mongoose');
const crypto = require('crypto');
const GuestToken = require('../models/guestToken');

function hashGuestToken(token) {
  const secret = process.env.SESSION_TOKEN_HASH_SECRET || process.env.JWT_SECRET;
  if (secret) {
    return crypto.createHmac('sha256', secret).update(String(token)).digest('hex');
  }
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function migrateGuestTokens({ dryRun = true, unsetPlaintext = false } = {}) {
  const query = {
    token: { $exists: true, $ne: null },
    $or: [
      { tokenHash: { $exists: false } },
      { tokenHash: null },
      { tokenHash: '' },
    ],
  };
  const total = await GuestToken.countDocuments(query);
  console.log(`Found ${total} guest tokens that need tokenHash migration.`);

  let updated = 0;
  const cursor = GuestToken.find(query).select('+token').cursor();
  for await (const guestToken of cursor) {
    const tokenHash = hashGuestToken(guestToken.token);
    const update = { $set: { tokenHash } };
    if (unsetPlaintext) update.$unset = { token: '' };

    if (!dryRun) {
      await GuestToken.updateOne({ _id: guestToken._id }, update);
    }
    updated += 1;
    if (updated % 100 === 0) console.log(`Processed ${updated}/${total}`);
  }

  console.log(`${dryRun ? 'Dry run completed' : 'Migration completed'}: ${updated} guest tokens processed.`);
  if (dryRun) console.log('Run with GUEST_TOKEN_MIGRATION_WRITE=true to write changes.');
  if (!unsetPlaintext) console.log('Plaintext token field was kept for compatibility. Set GUEST_TOKEN_UNSET_PLAINTEXT=true after cutover.');
}

module.exports = migrateGuestTokens;

if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => migrateGuestTokens({
      dryRun: process.env.GUEST_TOKEN_MIGRATION_WRITE !== 'true',
      unsetPlaintext: process.env.GUEST_TOKEN_UNSET_PLAINTEXT === 'true',
    }))
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

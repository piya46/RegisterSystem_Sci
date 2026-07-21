const mongoose = require('mongoose');
const Participant = require('../models/participant');
const Wallet = require('../models/wallet');

async function migrateWallets() {
  try {
    console.log('Starting DB Migration for Wallets...');

    // Find all participants that don't have a wallet yet.
    // Actually, we can just find all participants and try to create wallets,
    // handling duplicate key errors gracefully.
    const participants = await Participant.find({ status: { $ne: 'cancelled' } })
      .select('_id eventId eventYear')
      .lean();

    console.log(`Found ${participants.length} valid participants.`);
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    // Process in batches
    const batchSize = 100;
    for (let i = 0; i < participants.length; i += batchSize) {
      const batch = participants.slice(i, i + batchSize);

      const walletsToCreate = batch.map(p => ({
        participantId: p._id,
        eventId: p.eventId,
        eventYear: p.eventYear,
        coinBalance: 0,
        coupons: [],
        isActive: true
      }));

      try {
        await Wallet.insertMany(walletsToCreate, { ordered: false });
        successCount += batch.length;
      } catch (err) {
        // Handle duplicate key errors from insertMany (unordered)
        if (err.writeErrors) {
          err.writeErrors.forEach(e => {
            if (e.code === 11000) {
              skippedCount++;
            } else {
              errorCount++;
              console.error('Insert error:', e.errmsg);
            }
          });
          const inserted = batch.length - err.writeErrors.length;
          successCount += inserted;
        } else {
          errorCount += batch.length;
          console.error('Batch error:', err.message);
        }
      }

      process.stdout.write(`Processed ${i + batch.length} / ${participants.length}...\r`);
    }

    console.log('\nMigration Completed.');
    console.log(`Successfully created: ${successCount} wallets.`);
    console.log(`Skipped (already exists): ${skippedCount} wallets.`);
    console.log(`Errors: ${errorCount} wallets.`);

  } catch (err) {
    console.error('Migration failed:', err);
  }
}

module.exports = migrateWallets;

// If run directly
if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => migrateWallets())
    .then(() => mongoose.disconnect())
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

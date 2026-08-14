const mongoose = require('mongoose');
const Participant = require('../models/participant');
const Wallet = require('../models/wallet');
const { explicitMigrationApply } = require('../utils/migrationMode');
const { connectMongoForMigration } = require('../utils/mongoMigrationConnection');

function walletScope(participant) {
  return {
    participantId: participant._id,
    eventId: participant.eventId || null,
    eventYear: String(participant.eventYear || ''),
  };
}

function walletScopeKey(scope) {
  return [
    String(scope.participantId || ''),
    String(scope.eventId || ''),
    String(scope.eventYear || ''),
  ].join(':');
}

async function processParticipantBatch(participants, { dryRun, stats }) {
  if (participants.length === 0) return;
  const participantIds = participants.map((participant) => participant._id);
  const existingWallets = await Wallet.find({
    participantId: { $in: participantIds },
  }).select('participantId eventId eventYear').lean();
  const existingScopes = new Set(existingWallets.map(walletScopeKey));

  for (const participant of participants) {
    const scope = walletScope(participant);
    stats.participantsScanned += 1;
    if (existingScopes.has(walletScopeKey(scope))) {
      stats.existingWallets += 1;
      continue;
    }

    stats.walletsToCreate += 1;
    if (!dryRun) {
      try {
        await Wallet.create({
          ...scope,
          coinBalance: 0,
          coupons: [],
          isActive: true,
        });
        stats.walletsCreated += 1;
        existingScopes.add(walletScopeKey(scope));
      } catch (error) {
        if (error?.code === 11000) stats.duplicateRaces += 1;
        else throw error;
      }
    }
  }
}

async function migrateWallets({ dryRun = true, batchSize = 100 } = {}) {
  const normalizedBatchSize = Number(batchSize);
  if (!Number.isInteger(normalizedBatchSize) || normalizedBatchSize < 1 || normalizedBatchSize > 1000) {
    throw new Error('Wallet migration batch size must be between 1 and 1000');
  }

  const participantFilter = {
    status: { $ne: 'cancelled' },
    isDeleted: { $ne: true },
  };
  const total = await Participant.countDocuments(participantFilter);
  const stats = {
    dryRun,
    participantsScanned: 0,
    walletsToCreate: 0,
    walletsCreated: 0,
    existingWallets: 0,
    duplicateRaces: 0,
  };
  const cursor = Participant.find(participantFilter)
    .select('_id eventId eventYear')
    .lean()
    .cursor({ batchSize: normalizedBatchSize });

  let batch = [];
  for await (const participant of cursor) {
    batch.push(participant);
    if (batch.length < normalizedBatchSize) continue;
    await processParticipantBatch(batch, { dryRun, stats });
    batch = [];
    if (stats.participantsScanned % 500 === 0 || stats.participantsScanned === total) {
      console.log(`Wallet migration scanned ${stats.participantsScanned}/${total}`);
    }
  }
  await processParticipantBatch(batch, { dryRun, stats });
  if (batch.length > 0) {
    console.log(`Wallet migration scanned ${stats.participantsScanned}/${total}`);
  }
  return stats;
}

module.exports = migrateWallets;
module.exports.walletScope = walletScope;
module.exports.walletScopeKey = walletScopeKey;

if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');
  const apply = explicitMigrationApply({
    writeFlag: 'WALLET_MIGRATION_WRITE',
    mongoSafetyGate: true,
  });
  const batchSize = Number(process.env.WALLET_MIGRATION_BATCH_SIZE || 100);

  connectMongoForMigration(mongoUri)
    .then(() => migrateWallets({ dryRun: !apply, batchSize }))
    .then((stats) => {
      console.log(JSON.stringify(stats, null, 2));
      if (stats.dryRun) {
        console.log('Dry run only. Use --apply with WALLET_MIGRATION_WRITE=true during an approved maintenance window.');
      }
    })
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
      console.error(`Wallet migration failed: ${error.message}`);
      await mongoose.disconnect().catch(() => {});
      process.exitCode = 1;
    });
}

require('dotenv').config();

const mongoose = require('mongoose');
const Session = require('../models/session');
const { explicitMigrationApply } = require('../utils/migrationMode');
const { connectMongoForMigration } = require('../utils/mongoMigrationConnection');
const { hashSessionToken } = require('../utils/sessionToken');

async function migrateAdminSessionTokens({ dryRun = true, unsetPlaintext = false } = {}) {
  const query = { token: { $exists: true, $nin: [null, ''] } };
  const plaintextSessions = await Session.collection.countDocuments(query);
  const stats = {
    dryRun,
    plaintextSessions,
    needTokenHash: 0,
    wouldUnsetPlaintext: unsetPlaintext ? plaintextSessions : 0,
    hashesWritten: 0,
    plaintextUnset: 0,
    skippedByConcurrentWrite: 0,
  };
  const cursor = Session.collection.find(query, {
    projection: { token: 1, tokenHash: 1 },
  });

  for await (const session of cursor) {
    const needsHash = !session.tokenHash;
    if (needsHash) stats.needTokenHash += 1;
    if (dryRun) continue;

    const update = {};
    if (needsHash) update.$set = { tokenHash: hashSessionToken(session.token) };
    if (unsetPlaintext) update.$unset = { token: '' };
    if (!update.$set && !update.$unset) continue;

    const result = await Session.collection.updateOne(
      { _id: session._id, token: session.token },
      update
    );
    if (result.modifiedCount !== 1) {
      stats.skippedByConcurrentWrite += 1;
      continue;
    }
    if (needsHash) stats.hashesWritten += 1;
    if (unsetPlaintext) stats.plaintextUnset += 1;
  }
  return stats;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');
  const apply = explicitMigrationApply({
    writeFlag: 'ADMIN_SESSION_TOKEN_MIGRATION_WRITE',
    mongoSafetyGate: true,
  });
  const unsetPlaintext = process.env.ADMIN_SESSION_UNSET_PLAINTEXT === 'true';

  await connectMongoForMigration(mongoUri);
  try {
    const report = await migrateAdminSessionTokens({
      dryRun: !apply,
      unsetPlaintext,
    });
    console.log(JSON.stringify(report, null, 2));
    if (!apply) {
      console.log('Dry run only. Use --apply with ADMIN_SESSION_TOKEN_MIGRATION_WRITE=true during an approved maintenance window.');
    }
    if (!unsetPlaintext) {
      console.log('Set ADMIN_SESSION_UNSET_PLAINTEXT=true for the approved plaintext-removal run.');
    }
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Admin session token migration failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { migrateAdminSessionTokens };

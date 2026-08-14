require('dotenv').config();

const connectDB = require('../config/db');
const { disconnectDB } = require('../config/db');
const Participant = require('../models/participant');
const {
  CERTIFICATE_VERIFICATION_PATTERN,
  generateCertificateVerificationId,
  isCertificateVerificationId,
} = require('../utils/certificateVerification');
const { explicitMigrationApply } = require('../utils/migrationMode');
const { clearSecretCache, hydrateRuntimeSecrets } = require('../utils/secretProvider');

async function duplicateVerificationDocumentIds() {
  const groups = await Participant.collection.aggregate([
    { $match: { certificateVerificationId: { $regex: CERTIFICATE_VERIFICATION_PATTERN } } },
    {
      $group: {
        _id: '$certificateVerificationId',
        ids: { $push: '$_id' },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();

  return new Set(groups.flatMap((group) => group.ids.slice(1).map(String)));
}

async function writeVerificationId(participant, now) {
  const currentValueFilter = participant.certificateVerificationId === undefined
    ? { certificateVerificationId: { $exists: false } }
    : { certificateVerificationId: participant.certificateVerificationId };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await Participant.collection.updateOne(
        {
          _id: participant._id,
          ...currentValueFilter,
        },
        {
          $set: {
            certificateVerificationId: generateCertificateVerificationId(),
            certificateVerificationIssuedAt: now,
          },
        }
      );
      return result.modifiedCount === 1;
    } catch (error) {
      if (error?.code !== 11000 || attempt === 4) throw error;
    }
  }
  return false;
}

async function migrateCertificateVerificationIds({ dryRun = true } = {}) {
  const duplicateDocumentIds = await duplicateVerificationDocumentIds();
  const stats = {
    dryRun,
    scanned: 0,
    missing: 0,
    malformed: 0,
    duplicate: duplicateDocumentIds.size,
    candidates: 0,
    migrated: 0,
    skippedByConcurrentWrite: 0,
  };

  const cursor = Participant.find({})
    .select('_id +certificateVerificationId +certificateVerificationIssuedAt')
    .lean()
    .cursor();

  for await (const participant of cursor) {
    stats.scanned += 1;
    const raw = participant.certificateVerificationId;
    const missing = raw === undefined || raw === null || raw === '';
    const malformed = !missing && !isCertificateVerificationId(raw);
    const duplicate = duplicateDocumentIds.has(String(participant._id));
    if (missing) stats.missing += 1;
    if (malformed) stats.malformed += 1;
    if (!missing && !malformed && !duplicate) continue;

    stats.candidates += 1;
    if (!dryRun) {
      const changed = await writeVerificationId(participant, new Date());
      if (changed) stats.migrated += 1;
      else stats.skippedByConcurrentWrite += 1;
    }
  }

  if (!dryRun) {
    await Participant.collection.createIndex(
      { certificateVerificationId: 1 },
      { unique: true, sparse: true, name: 'uq_participant_certificate_verification_id' }
    );
  }

  return stats;
}

async function main() {
  const apply = explicitMigrationApply({
    writeFlag: 'CERTIFICATE_VERIFICATION_MIGRATION_WRITE',
    mongoSafetyGate: true,
  });
  const dryRun = !apply;

  try {
    await hydrateRuntimeSecrets();
    await connectDB({ autoIndex: false });
    const stats = await migrateCertificateVerificationIds({ dryRun });
    console.log(JSON.stringify(stats, null, 2));
    if (dryRun) console.log('Dry run only. Use --apply with the write flag during an approved maintenance window.');
  } finally {
    await disconnectDB().catch(() => {});
    clearSecretCache();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Certificate verification migration failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  migrateCertificateVerificationIds,
};

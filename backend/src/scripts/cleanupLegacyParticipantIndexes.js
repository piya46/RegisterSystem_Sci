require('dotenv').config();

const mongoose = require('mongoose');
const Participant = require('../models/participant');
const GuestToken = require('../models/guestToken');
const Session = require('../models/session');
const { auditSensitiveAccess } = require('../helpers/sensitiveAuditLog');
const {
  isEncryptedValue,
  participantSensitiveFields,
} = require('../utils/fieldEncryption');
const { explicitMigrationApply } = require('../utils/migrationMode');
const { connectMongoForMigration } = require('../utils/mongoMigrationConnection');

const CONFIRMATION = 'drop-legacy-plaintext-indexes';

function plaintextFieldIndex(index) {
  const entries = Object.entries(index?.key || {});
  if (entries.length !== 1) return null;
  const [[key, direction]] = entries;
  if (direction !== 1 || !key.startsWith('fields.')) return null;
  return key.slice('fields.'.length);
}

function hasMeaningfulValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function plaintextFieldCounts(participants, fieldNames) {
  const counts = Object.fromEntries(fieldNames.map((field) => [field, 0]));
  for (const participant of participants || []) {
    for (const field of fieldNames) {
      const value = participant?.fields?.[field];
      if (hasMeaningfulValue(value) && !isEncryptedValue(value)) counts[field] += 1;
    }
  }
  return counts;
}

async function scanPlaintextFields(fieldNames) {
  const counts = Object.fromEntries(fieldNames.map((field) => [field, 0]));
  if (fieldNames.length === 0) return { scanned: 0, counts };
  const projection = Object.fromEntries(fieldNames.map((field) => [`fields.${field}`, 1]));
  const cursor = Participant.find({}, projection).lean().cursor({ batchSize: 250 });
  let scanned = 0;
  for await (const participant of cursor) {
    scanned += 1;
    const rowCounts = plaintextFieldCounts([participant], fieldNames);
    for (const field of fieldNames) counts[field] += rowCounts[field];
  }
  return { scanned, counts };
}

async function inspectLegacyIndexes() {
  const indexes = await Participant.collection.indexes();
  const sensitive = new Set(participantSensitiveFields());
  const candidates = indexes
    .map((index) => ({
      name: index.name,
      field: plaintextFieldIndex(index),
      unique: index.unique === true,
    }))
    .filter((index) => index.field && sensitive.has(index.field));
  const fields = [...new Set(candidates.map((index) => index.field))].sort();
  const plaintext = await scanPlaintextFields(fields);
  return {
    candidates,
    plaintext,
  };
}

async function inspectLegacyTokenIndexes() {
  const models = [
    { model: GuestToken, field: 'token' },
    { model: Session, field: 'token' },
  ];
  const candidates = [];
  const plaintextDocumentsByCollection = {};
  for (const { model, field } of models) {
    const collection = model.collection.collectionName;
    const indexes = await model.collection.indexes();
    for (const index of indexes) {
      const entries = Object.entries(index.key || {});
      if (entries.length === 1 && entries[0][0] === field && entries[0][1] === 1) {
        candidates.push({ collection, name: index.name, field, unique: index.unique === true });
      }
    }
    plaintextDocumentsByCollection[collection] = await model.collection.countDocuments({
      [field]: { $type: 'string', $ne: '' },
    });
  }
  return {
    candidates,
    plaintextDocumentsByCollection,
  };
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');
  const apply = explicitMigrationApply({
    writeFlag: 'MONGO_LEGACY_INDEX_CLEANUP_WRITE',
    mongoSafetyGate: true,
  });
  if (apply && process.env.CONFIRM_MONGO_LEGACY_INDEX_CLEANUP !== CONFIRMATION) {
    throw new Error(`CONFIRM_MONGO_LEGACY_INDEX_CLEANUP=${CONFIRMATION} is required`);
  }

  await connectMongoForMigration(mongoUri);
  try {
    const participantBefore = await inspectLegacyIndexes();
    const tokenBefore = await inspectLegacyTokenIndexes();
    const plaintextDocuments = Object.values(participantBefore.plaintext.counts)
      .concat(Object.values(tokenBefore.plaintextDocumentsByCollection))
      .reduce((sum, count) => sum + count, 0);
    const report = {
      dryRun: !apply,
      participant: {
        candidates: participantBefore.candidates,
        documentsScanned: participantBefore.plaintext.scanned,
        plaintextDocumentsByField: participantBefore.plaintext.counts,
      },
      bearerTokens: {
        candidates: tokenBefore.candidates,
        plaintextDocumentsByCollection: tokenBefore.plaintextDocumentsByCollection,
      },
      dropped: [],
      remainingCandidates: participantBefore.candidates.length + tokenBefore.candidates.length,
    };

    if (apply && plaintextDocuments > 0) {
      throw new Error(
        `Refusing to drop legacy indexes while ${plaintextDocuments} plaintext field/token occurrences remain`
      );
    }
    if (apply) {
      for (const candidate of participantBefore.candidates) {
        await Participant.collection.dropIndex(candidate.name);
        report.dropped.push({ collection: Participant.collection.collectionName, name: candidate.name });
      }
      const modelByCollection = new Map([
        [GuestToken.collection.collectionName, GuestToken],
        [Session.collection.collectionName, Session],
      ]);
      for (const candidate of tokenBefore.candidates) {
        await modelByCollection.get(candidate.collection).collection.dropIndex(candidate.name);
        report.dropped.push({ collection: candidate.collection, name: candidate.name });
      }
      const participantAfter = await inspectLegacyIndexes();
      const tokenAfter = await inspectLegacyTokenIndexes();
      report.remainingCandidates = participantAfter.candidates.length + tokenAfter.candidates.length;
      if (report.remainingCandidates > 0) {
        throw new Error('Legacy plaintext index cleanup did not converge');
      }
      if (report.dropped.length > 0) {
        await auditSensitiveAccess({
          action: 'LEGACY_PLAINTEXT_INDEX_CLEANUP',
          purpose: 'remove_legacy_plaintext_search_and_bearer_indexes',
          resource: 'participants,guesttokens,sessions',
          recordCount: report.dropped.length,
          fields: [
            ...participantBefore.candidates.map(
              (candidate) => `participant.fields.${candidate.field}`
            ),
            ...tokenBefore.candidates.map(
              (candidate) => `${candidate.collection}.${candidate.field}`
            ),
          ],
          extra: {
            mode: 'apply',
            indexes: report.dropped,
            participantDocumentsScanned: report.participant.documentsScanned,
          },
        });
      }
    }

    console.log(JSON.stringify(report, null, 2));
    if (!apply) {
      console.log(
        `Dry run only. After privacy backfill reaches zero, use --apply with `
        + `MONGO_LEGACY_INDEX_CLEANUP_WRITE=true and `
        + `CONFIRM_MONGO_LEGACY_INDEX_CLEANUP=${CONFIRMATION}.`
      );
    }
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Legacy plaintext index cleanup failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  plaintextFieldCounts,
  plaintextFieldIndex,
};

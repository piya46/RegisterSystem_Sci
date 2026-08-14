require('dotenv').config();

const mongoose = require('mongoose');
const Participant = require('../models/participant');
const Donation = require('../models/Donation');
const Package = require('../models/Package');
const Prize = require('../models/prize');
const { auditSensitiveAccess } = require('../helpers/sensitiveAuditLog');
const { getCurrentEventYear, normalizeEventYear } = require('../utils/eventYear');
const { explicitMigrationApply } = require('../utils/migrationMode');
const { connectMongoForMigration } = require('../utils/mongoMigrationConnection');
const {
  donationSensitiveFields,
  encryptValue,
  encryptionEnabled,
  isEncryptedValue,
  participantBlindIndexes,
  participantBlindIndexFields,
  participantSearchFields,
  participantSearchTokens,
  participantSensitiveFields,
  revealParticipantFields,
} = require('../utils/fieldEncryption');

const PROTECTED_INDEX_PATTERN = /^[a-f0-9]{64}$/;

function hasMeaningfulValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function participantBackfillReasons(participant) {
  const fields = participant.fields || {};
  const secureIndex = participant.secureIndex || {};
  const plaintextSensitiveFields = participantSensitiveFields().filter((field) => (
    hasMeaningfulValue(fields[field]) && !isEncryptedValue(fields[field])
  ));
  const missingBlindIndexes = participantBlindIndexFields().filter((field) => (
    hasMeaningfulValue(fields[field])
    && !PROTECTED_INDEX_PATTERN.test(String(secureIndex[field] || '').toLowerCase())
  ));
  const hasSearchableValue = participantSearchFields().some((field) => hasMeaningfulValue(fields[field]));
  const missingSearchIndex = hasSearchableValue
    && (!Array.isArray(participant.secureSearch) || participant.secureSearch.length === 0);
  const plaintextSpecialAssistance = hasMeaningfulValue(participant.specialAssistance)
    && !isEncryptedValue(participant.specialAssistance);
  const missingEventYear = !String(participant.eventYear || '').trim();

  return {
    missingEventYear,
    plaintextSensitiveFields,
    plaintextSpecialAssistance,
    missingBlindIndexes,
    missingSearchIndex,
    needsSecurityBackfill: plaintextSensitiveFields.length > 0
      || plaintextSpecialAssistance
      || missingBlindIndexes.length > 0
      || missingSearchIndex,
  };
}

function donationBackfillReasons(donation) {
  const plaintextSensitiveFields = donationSensitiveFields().filter((field) => (
    hasMeaningfulValue(donation[field]) && !isEncryptedValue(donation[field])
  ));
  return {
    missingEventYear: !String(donation.eventYear || '').trim(),
    plaintextSensitiveFields,
    needsSecurityBackfill: plaintextSensitiveFields.length > 0,
  };
}

function participantSummary(inspections) {
  return inspections.reduce((summary, { reasons }) => {
    summary.scanned += 1;
    if (reasons.missingEventYear) summary.missingEventYear += 1;
    if (reasons.plaintextSensitiveFields.length > 0) summary.plaintextSensitiveDocuments += 1;
    summary.plaintextSensitiveValues += reasons.plaintextSensitiveFields.length;
    if (reasons.plaintextSpecialAssistance) summary.plaintextSpecialAssistance += 1;
    if (reasons.missingBlindIndexes.length > 0) summary.missingBlindIndexDocuments += 1;
    summary.missingBlindIndexValues += reasons.missingBlindIndexes.length;
    if (reasons.missingSearchIndex) summary.missingSearchIndex += 1;
    if (reasons.missingEventYear || reasons.needsSecurityBackfill) summary.wouldUpdate += 1;
    return summary;
  }, {
    scanned: 0,
    wouldUpdate: 0,
    missingEventYear: 0,
    plaintextSensitiveDocuments: 0,
    plaintextSensitiveValues: 0,
    plaintextSpecialAssistance: 0,
    missingBlindIndexDocuments: 0,
    missingBlindIndexValues: 0,
    missingSearchIndex: 0,
  });
}

function donationSummary(inspections) {
  return inspections.reduce((summary, { reasons }) => {
    summary.scanned += 1;
    if (reasons.missingEventYear) summary.missingEventYear += 1;
    if (reasons.plaintextSensitiveFields.length > 0) summary.plaintextSensitiveDocuments += 1;
    summary.plaintextSensitiveValues += reasons.plaintextSensitiveFields.length;
    if (reasons.missingEventYear || reasons.needsSecurityBackfill) summary.wouldUpdate += 1;
    return summary;
  }, {
    scanned: 0,
    wouldUpdate: 0,
    missingEventYear: 0,
    plaintextSensitiveDocuments: 0,
    plaintextSensitiveValues: 0,
  });
}

async function applyParticipantBackfill(inspections, eventYear) {
  let updated = 0;
  for (const { document: participant, reasons } of inspections) {
    if (!reasons.missingEventYear && !reasons.needsSecurityBackfill) continue;

    if (reasons.needsSecurityBackfill) {
      const plainFields = revealParticipantFields(participant.fields || {});
      for (const field of reasons.plaintextSensitiveFields) {
        participant.fields[field] = encryptValue(participant.fields[field]);
      }
      if (reasons.plaintextSensitiveFields.length > 0) participant.markModified('fields');

      participant.secureIndex = participantBlindIndexes(plainFields);
      participant.secureSearch = participantSearchTokens(plainFields);
      participant.markModified('secureIndex');
      participant.markModified('secureSearch');

      if (reasons.plaintextSpecialAssistance) {
        participant.specialAssistance = encryptValue(participant.specialAssistance);
        participant.markModified('specialAssistance');
      }
    }
    if (reasons.missingEventYear) participant.eventYear = eventYear;
    await participant.save();
    updated += 1;
  }
  return updated;
}

async function applyDonationBackfill(inspections, eventYear) {
  let updated = 0;
  for (const { document: donation, reasons } of inspections) {
    if (!reasons.missingEventYear && !reasons.needsSecurityBackfill) continue;

    for (const field of reasons.plaintextSensitiveFields) {
      donation[field] = encryptValue(donation[field]);
      donation.markModified(field);
    }
    if (reasons.missingEventYear) donation.eventYear = eventYear;
    await donation.save();
    updated += 1;
  }
  return updated;
}

async function runBackfill({ apply, eventYear }) {
  const missingYearFilter = {
    $or: [{ eventYear: { $exists: false } }, { eventYear: '' }, { eventYear: null }],
  };
  const [participants, donations, packageCount, prizeCount] = await Promise.all([
    Participant.find({}).select('+secureIndex +secureSearch'),
    Donation.find({}),
    Package.countDocuments(missingYearFilter),
    Prize.countDocuments(missingYearFilter),
  ]);
  const participantInspections = participants.map((document) => ({
    document,
    reasons: participantBackfillReasons(document),
  }));
  const donationInspections = donations.map((document) => ({
    document,
    reasons: donationBackfillReasons(document),
  }));
  const report = {
    dryRun: !apply,
    eventYear,
    participants: participantSummary(participantInspections),
    donations: donationSummary(donationInspections),
    packages: { missingEventYear: packageCount, updated: 0 },
    prizes: { missingEventYear: prizeCount, updated: 0 },
  };

  const needsCrypto = report.participants.plaintextSensitiveDocuments > 0
    || report.participants.plaintextSpecialAssistance > 0
    || report.participants.missingBlindIndexDocuments > 0
    || report.participants.missingSearchIndex > 0
    || report.donations.plaintextSensitiveDocuments > 0;
  if (apply && needsCrypto && !encryptionEnabled()) {
    throw new Error('Field encryption and blind-index keys are required before applying the privacy backfill');
  }
  if (!apply) return report;

  report.participants.updated = await applyParticipantBackfill(participantInspections, eventYear);
  report.donations.updated = await applyDonationBackfill(donationInspections, eventYear);
  const [packages, prizes] = await Promise.all([
    Package.updateMany(missingYearFilter, { $set: { eventYear } }),
    Prize.updateMany(missingYearFilter, { $set: { eventYear } }),
  ]);
  report.packages.updated = packages.modifiedCount;
  report.prizes.updated = prizes.modifiedCount;
  return report;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');

  const apply = explicitMigrationApply({
    writeFlag: 'PRIVACY_YEAR_BACKFILL_WRITE',
    mongoSafetyGate: true,
  });
  await connectMongoForMigration(mongoUri);
  try {
    const eventYear = normalizeEventYear(process.env.BACKFILL_EVENT_YEAR || await getCurrentEventYear());
    const report = await runBackfill({ apply, eventYear });
    if (apply) {
      await auditSensitiveAccess({
        action: 'PRIVACY_YEAR_BACKFILL_APPLY',
        purpose: 'privacy_and_event_year_backfill',
        resource: 'participants,donations,packages,prizes',
        eventYear,
        recordCount: report.participants.wouldUpdate + report.donations.wouldUpdate,
        fields: [
          'participant.fields',
          'participant.specialAssistance',
          'participant.secureIndex',
          'participant.secureSearch',
          'donation.firstName',
          'donation.lastName',
          'donation.address',
          'donation.slipUrl',
        ],
        extra: {
          mode: 'apply',
          participants: report.participants,
          donations: report.donations,
        },
      });
    }
    console.log(JSON.stringify(report, null, 2));
    if (!apply) {
      console.log('Dry run only. Use --apply with PRIVACY_YEAR_BACKFILL_WRITE=true during an approved maintenance window.');
    }
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Privacy/event-year backfill failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  donationBackfillReasons,
  participantBackfillReasons,
  runBackfill,
};

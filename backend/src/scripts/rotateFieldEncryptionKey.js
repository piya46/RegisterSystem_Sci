require('dotenv').config();

const mongoose = require('mongoose');
const Participant = require('../models/participant');
const Donation = require('../models/Donation');
const { auditSensitiveAccess } = require('../helpers/sensitiveAuditLog');
const { explicitMigrationApply } = require('../utils/migrationMode');
const { connectMongoForMigration } = require('../utils/mongoMigrationConnection');
const {
  donationSensitiveFields,
  encryptionEnabled,
  isEncryptedValue,
  needsKeyRotation,
  participantBlindIndexes,
  participantSearchTokens,
  participantSensitiveFields,
  reencryptValue,
  revealParticipantFields,
} = require('../utils/fieldEncryption');

function hasEncryptedValues(values) {
  return values.some(isEncryptedValue);
}

function hasMeaningfulValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function hasRotatableValues(values) {
  return values
    .filter(hasMeaningfulValue)
    .some((value) => !isEncryptedValue(value) || needsKeyRotation(value));
}

async function rotateParticipants({ apply }) {
  const participants = await Participant.find({}).select('+secureIndex +secureSearch');
  const sensitiveFields = participantSensitiveFields();
  let scanned = 0;
  let changed = 0;

  for (const participant of participants) {
    scanned += 1;
    const fieldValues = sensitiveFields.map((field) => participant.fields?.[field]);
    const sensitiveValues = [...fieldValues, participant.specialAssistance];
    if (!hasRotatableValues(sensitiveValues)) continue;

    if (hasEncryptedValues(sensitiveValues) && !encryptionEnabled()) {
      throw new Error('DATA_ENCRYPTION_KEYS or DATA_ENCRYPTION_KEY is required to rotate existing encrypted participant data');
    }

    changed += 1;
    if (!apply) continue;

    const plainFields = revealParticipantFields(participant.fields || {});
    const protectedFields = { ...(participant.fields || {}) };
    for (const field of sensitiveFields) {
      const value = participant.fields?.[field];
      if (hasMeaningfulValue(value) && (!isEncryptedValue(value) || needsKeyRotation(value))) {
        protectedFields[field] = reencryptValue(value);
      }
    }
    participant.fields = protectedFields;
    participant.secureIndex = participantBlindIndexes(plainFields);
    participant.secureSearch = participantSearchTokens(plainFields);
    if (
      hasMeaningfulValue(participant.specialAssistance)
      && (!isEncryptedValue(participant.specialAssistance) || needsKeyRotation(participant.specialAssistance))
    ) {
      participant.specialAssistance = reencryptValue(participant.specialAssistance);
      participant.markModified('specialAssistance');
    }
    participant.markModified('fields');
    participant.markModified('secureIndex');
    participant.markModified('secureSearch');
    await participant.save();
  }

  return { scanned, changed };
}

async function rotateDonations({ apply }) {
  const donations = await Donation.find({});
  const sensitiveFields = donationSensitiveFields();
  let scanned = 0;
  let changed = 0;

  for (const donation of donations) {
    scanned += 1;
    const sensitiveValues = sensitiveFields.map((field) => donation[field]);
    if (!hasRotatableValues(sensitiveValues)) continue;

    if (hasEncryptedValues(sensitiveValues) && !encryptionEnabled()) {
      throw new Error('DATA_ENCRYPTION_KEYS or DATA_ENCRYPTION_KEY is required to rotate existing encrypted donation data');
    }

    changed += 1;
    if (!apply) continue;

    for (const field of sensitiveFields) {
      const value = donation[field];
      if (!hasMeaningfulValue(value) || (isEncryptedValue(value) && !needsKeyRotation(value))) continue;
      donation[field] = reencryptValue(value);
      donation.markModified(field);
    }
    await donation.save();
  }

  return { scanned, changed };
}

async function main() {
  if (!encryptionEnabled()) {
    throw new Error('Encryption is not enabled. Set DATA_ENCRYPTION_KEYS or DATA_ENCRYPTION_KEY before rotating.');
  }

  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');

  const apply = explicitMigrationApply({
    writeFlag: 'FIELD_ENCRYPTION_ROTATION_WRITE',
    mongoSafetyGate: true,
  });
  await connectMongoForMigration(mongoUri);

  const [participants, donations] = await Promise.all([
    rotateParticipants({ apply }),
    rotateDonations({ apply }),
  ]);

  if (apply) {
    await auditSensitiveAccess({
      action: 'SENSITIVE_KEY_ROTATION_APPLY',
      purpose: 'field_encryption_key_rotation',
      resource: 'participants,donations',
      recordCount: participants.changed + donations.changed,
      fields: ['participant.fields', 'participant.specialAssistance', 'donation.firstName', 'donation.lastName', 'donation.address', 'donation.slipUrl'],
      extra: {
        mode: 'apply',
        participants,
        donations,
        activeKeyId: process.env.DATA_ENCRYPTION_KEY_ID || 'v1',
      },
    });
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    participants,
    donations,
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

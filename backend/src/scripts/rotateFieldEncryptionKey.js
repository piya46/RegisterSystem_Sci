require('dotenv').config();

const mongoose = require('mongoose');
const Participant = require('../models/participant');
const Donation = require('../models/Donation');
const { auditSensitiveAccess } = require('../helpers/sensitiveAuditLog');
const {
  decryptValue,
  encryptValue,
  encryptionEnabled,
  isEncryptedValue,
  needsKeyRotation,
  participantBlindIndexes,
  participantSearchTokens,
  protectDonationPayload,
  protectParticipantFields,
  revealDonationObject,
  revealParticipantFields,
} = require('../utils/fieldEncryption');

const DONATION_SENSITIVE_FIELDS = ['firstName', 'lastName', 'address', 'slipUrl'];

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
  const participants = await Participant.find({}).select('+secureIndex');
  let scanned = 0;
  let changed = 0;

  for (const participant of participants) {
    scanned += 1;
    const fieldValues = Object.values(participant.fields || {});
    const sensitiveValues = [...fieldValues, participant.specialAssistance];
    if (!hasRotatableValues(sensitiveValues)) continue;

    if (hasEncryptedValues(sensitiveValues) && !encryptionEnabled()) {
      throw new Error('DATA_ENCRYPTION_KEYS or DATA_ENCRYPTION_KEY is required to rotate existing encrypted participant data');
    }

    changed += 1;
    if (!apply) continue;

    const plainFields = revealParticipantFields(participant.fields || {});
    participant.fields = protectParticipantFields(plainFields);
    participant.secureIndex = participantBlindIndexes(plainFields);
    participant.secureSearch = participantSearchTokens(plainFields);
    participant.specialAssistance = encryptValue(decryptValue(participant.specialAssistance || ''));
    participant.markModified('fields');
    participant.markModified('secureIndex');
    participant.markModified('secureSearch');
    participant.markModified('specialAssistance');
    await participant.save();
  }

  return { scanned, changed };
}

async function rotateDonations({ apply }) {
  const donations = await Donation.find({});
  let scanned = 0;
  let changed = 0;

  for (const donation of donations) {
    scanned += 1;
    const sensitiveValues = DONATION_SENSITIVE_FIELDS.map((field) => donation[field]);
    if (!hasRotatableValues(sensitiveValues)) continue;

    if (hasEncryptedValues(sensitiveValues) && !encryptionEnabled()) {
      throw new Error('DATA_ENCRYPTION_KEYS or DATA_ENCRYPTION_KEY is required to rotate existing encrypted donation data');
    }

    changed += 1;
    if (!apply) continue;

    const plainDonation = revealDonationObject(donation);
    const protectedDonation = protectDonationPayload({
      firstName: plainDonation.firstName,
      lastName: plainDonation.lastName,
      address: plainDonation.address,
      slipUrl: plainDonation.slipUrl,
    });
    for (const [field, value] of Object.entries(protectedDonation)) {
      donation[field] = value;
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

  const apply = String(process.env.APPLY || '').toLowerCase() === 'true';
  await mongoose.connect(mongoUri);

  const [participants, donations] = await Promise.all([
    rotateParticipants({ apply }),
    rotateDonations({ apply }),
  ]);

  await auditSensitiveAccess({
    action: apply ? 'SENSITIVE_KEY_ROTATION_APPLY' : 'SENSITIVE_KEY_ROTATION_DRY_RUN',
    purpose: 'field_encryption_key_rotation',
    resource: 'participants,donations',
    recordCount: participants.changed + donations.changed,
    fields: ['participant.fields', 'participant.specialAssistance', 'donation.firstName', 'donation.lastName', 'donation.address', 'donation.slipUrl'],
    extra: {
      mode: apply ? 'apply' : 'dry-run',
      participants,
      donations,
      activeKeyId: process.env.DATA_ENCRYPTION_KEY_ID || 'v1',
    },
  });

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

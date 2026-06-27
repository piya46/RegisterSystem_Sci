require('dotenv').config();

const mongoose = require('mongoose');
const Participant = require('../models/participant');
const Donation = require('../models/Donation');
const Package = require('../models/Package');
const Prize = require('../models/prize');
const { getCurrentEventYear, normalizeEventYear } = require('../utils/eventYear');
const {
  decryptValue,
  encryptValue,
  encryptionEnabled,
  isEncryptedValue,
  participantBlindIndexes,
  participantSearchTokens,
  protectDonationPayload,
  protectParticipantFields,
  revealDonationObject,
  revealParticipantFields,
} = require('../utils/fieldEncryption');

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');

  await mongoose.connect(mongoUri);
  const eventYear = normalizeEventYear(process.env.BACKFILL_EVENT_YEAR || await getCurrentEventYear());
  console.log(`Backfilling eventYear=${eventYear}`);

  const participants = await Participant.find({}).select('+secureIndex');
  let participantCount = 0;
  for (const participant of participants) {
    const hasEncryptedParticipantData = Object.values(participant.fields || {}).some(isEncryptedValue) ||
      isEncryptedValue(participant.specialAssistance);
    if (hasEncryptedParticipantData && !encryptionEnabled()) {
      throw new Error('DATA_ENCRYPTION_KEYS or DATA_ENCRYPTION_KEY is required to backfill existing encrypted participant data');
    }

    const plainFields = revealParticipantFields(participant.fields || {});
    participant.fields = protectParticipantFields(plainFields);
    participant.secureIndex = participantBlindIndexes(plainFields);
    participant.secureSearch = participantSearchTokens(plainFields);
    participant.specialAssistance = encryptValue(decryptValue(participant.specialAssistance || ''));
    if (!participant.eventYear) participant.eventYear = eventYear;
    participant.markModified('fields');
    participant.markModified('secureIndex');
    participant.markModified('secureSearch');
    participant.markModified('specialAssistance');
    await participant.save();
    participantCount += 1;
  }

  const donationDocs = await Donation.find({});
  let donationCount = 0;
  for (const donation of donationDocs) {
    const hasEncryptedDonationData = ['firstName', 'lastName', 'address', 'slipUrl']
      .some((field) => isEncryptedValue(donation[field]));
    if (hasEncryptedDonationData && !encryptionEnabled()) {
      throw new Error('DATA_ENCRYPTION_KEYS or DATA_ENCRYPTION_KEY is required to backfill existing encrypted donation data');
    }

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
    if (!donation.eventYear) donation.eventYear = eventYear;
    await donation.save();
    donationCount += 1;
  }

  const [packages, prizes] = await Promise.all([
    Package.updateMany({ $or: [{ eventYear: { $exists: false } }, { eventYear: '' }, { eventYear: null }] }, { $set: { eventYear } }),
    Prize.updateMany({ $or: [{ eventYear: { $exists: false } }, { eventYear: '' }, { eventYear: null }] }, { $set: { eventYear } }),
  ]);

  console.log(`Participants processed: ${participantCount}`);
  console.log(`Donations processed: ${donationCount}`);
  console.log(`Packages updated: ${packages.modifiedCount}`);
  console.log(`Prizes updated: ${prizes.modifiedCount}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

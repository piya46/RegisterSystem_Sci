const mongoose = require('mongoose');
const ParticipantField = require('../models/participantField');
const SystemSetting = require('../models/SystemSetting');
const Event = require('../models/event');

async function migrateParticipantFieldsScope({
  dryRun = true,
  assignCurrentEvent = false,
  dropLegacyNameIndex = false,
} = {}) {
  const legacyFilter = { $or: [{ eventId: null }, { eventId: { $exists: false } }] };
  const legacyCount = await ParticipantField.countDocuments(legacyFilter);
  const indexes = await ParticipantField.collection.indexes();
  const legacyNameIndex = indexes.find((idx) => idx.name === 'name_1' && idx.unique === true);

  console.log(`Legacy/global participant fields: ${legacyCount}`);
  console.log(`Legacy unique name_1 index: ${legacyNameIndex ? 'found' : 'not found'}`);

  if (assignCurrentEvent) {
    const setting = await SystemSetting.findOne().select('currentEventId currentEventYear currentEventSeriesId defaultOrganizationId');
    if (!setting?.currentEventId) {
      throw new Error('ASSIGN_CURRENT_EVENT requested but SystemSetting.currentEventId is missing.');
    }
    const event = await Event.findById(setting.currentEventId).select('eventYear organizationId seriesId');
    if (!event) throw new Error('Current event not found.');

    const update = {
      $set: {
        eventId: event._id,
        eventYear: String(event.eventYear || setting.currentEventYear || ''),
        organizationId: event.organizationId || setting.defaultOrganizationId || null,
        seriesId: event.seriesId || setting.currentEventSeriesId || null,
      },
    };

    console.log(`${dryRun ? 'Would assign' : 'Assigning'} ${legacyCount} fields to current event ${event._id}.`);
    if (!dryRun) await ParticipantField.updateMany(legacyFilter, update);
  }

  if (dropLegacyNameIndex && legacyNameIndex) {
    console.log(`${dryRun ? 'Would drop' : 'Dropping'} legacy unique index name_1.`);
    if (!dryRun) await ParticipantField.collection.dropIndex('name_1');
  }

  console.log(dryRun ? 'Dry run completed.' : 'Migration completed.');
  if (dryRun) {
    console.log('Set PARTICIPANT_FIELD_SCOPE_WRITE=true to write changes.');
    console.log('Set PARTICIPANT_FIELD_ASSIGN_CURRENT_EVENT=true to bind legacy fields to the current event.');
    console.log('Set PARTICIPANT_FIELD_DROP_NAME_INDEX=true to drop the old global unique name index.');
  }
}

module.exports = migrateParticipantFieldsScope;

if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');

  mongoose.connect(mongoUri)
    .then(() => migrateParticipantFieldsScope({
      dryRun: process.env.PARTICIPANT_FIELD_SCOPE_WRITE !== 'true',
      assignCurrentEvent: process.env.PARTICIPANT_FIELD_ASSIGN_CURRENT_EVENT === 'true',
      dropLegacyNameIndex: process.env.PARTICIPANT_FIELD_DROP_NAME_INDEX === 'true',
    }))
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

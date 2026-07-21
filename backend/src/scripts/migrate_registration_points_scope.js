const mongoose = require('mongoose');
const RegistrationPoint = require('../models/registrationPoint');
const SystemSetting = require('../models/SystemSetting');
const Event = require('../models/event');

async function migrateRegistrationPointsScope({
  dryRun = true,
  assignCurrentEvent = false,
  dropLegacyNameIndex = false,
} = {}) {
  const legacyFilter = { $or: [{ eventId: null }, { eventId: { $exists: false } }] };
  const legacyCount = await RegistrationPoint.countDocuments(legacyFilter);
  const indexes = await RegistrationPoint.collection.indexes();
  const legacyNameIndex = indexes.find((idx) => idx.name === 'name_1' && idx.unique === true);

  console.log(`Legacy/global registration points: ${legacyCount}`);
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

    console.log(`${dryRun ? 'Would assign' : 'Assigning'} ${legacyCount} legacy points to current event ${event._id}.`);
    if (!dryRun) await RegistrationPoint.updateMany(legacyFilter, update);
  }

  if (dropLegacyNameIndex && legacyNameIndex) {
    console.log(`${dryRun ? 'Would drop' : 'Dropping'} legacy unique index name_1.`);
    if (!dryRun) await RegistrationPoint.collection.dropIndex('name_1');
  }

  console.log(dryRun ? 'Dry run completed.' : 'Migration completed.');
  if (dryRun) {
    console.log('Set REG_POINT_SCOPE_WRITE=true to write changes.');
    console.log('Set REG_POINT_ASSIGN_CURRENT_EVENT=true to bind legacy points to the current event.');
    console.log('Set REG_POINT_DROP_NAME_INDEX=true to drop the old global unique name index.');
  }
}

module.exports = migrateRegistrationPointsScope;

if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');

  mongoose.connect(mongoUri)
    .then(() => migrateRegistrationPointsScope({
      dryRun: process.env.REG_POINT_SCOPE_WRITE !== 'true',
      assignCurrentEvent: process.env.REG_POINT_ASSIGN_CURRENT_EVENT === 'true',
      dropLegacyNameIndex: process.env.REG_POINT_DROP_NAME_INDEX === 'true',
    }))
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

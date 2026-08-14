const mongoose = require('mongoose');
const RegistrationPoint = require('../models/registrationPoint');
const SystemSetting = require('../models/SystemSetting');
const Event = require('../models/event');
const { explicitMigrationApply, legacyScopeDecision } = require('../utils/migrationMode');
const { isLegacyFullUniqueNameIndex } = require('../utils/mongoIndexMigration');
const { connectMongoForMigration } = require('../utils/mongoMigrationConnection');

const GLOBAL_NAME_INDEX = {
  key: { name: 1 },
  options: {
    unique: true,
    partialFilterExpression: { eventId: null, enabled: true },
    name: 'name_1',
  },
};

const EVENT_NAME_INDEX = {
  key: { eventId: 1, name: 1 },
  options: {
    unique: true,
    partialFilterExpression: { eventId: { $type: 'objectId' }, enabled: true },
    name: 'eventId_1_name_1',
  },
};

async function currentEventScope() {
  const setting = await SystemSetting.findOne()
    .select('currentEventId currentEventYear currentEventSeriesId defaultOrganizationId');
  if (!setting?.currentEventId) {
    throw new Error('ASSIGN_CURRENT_EVENT requested but SystemSetting.currentEventId is missing.');
  }
  const event = await Event.findById(setting.currentEventId).select('eventYear organizationId seriesId');
  if (!event) throw new Error('Current event not found.');
  return { event, setting };
}

async function assignmentConflicts(model, legacyFilter, eventId) {
  const legacyNames = await model.distinct('name', legacyFilter);
  if (legacyNames.length === 0) return 0;
  return model.countDocuments({
    eventId,
    enabled: true,
    name: { $in: legacyNames },
  });
}

async function migrateRegistrationPointsScope({
  dryRun = true,
  assignCurrentEvent = false,
  dropLegacyNameIndex = false,
} = {}) {
  const legacyFilter = { $or: [{ eventId: null }, { eventId: { $exists: false } }] };
  const legacyCount = await RegistrationPoint.countDocuments(legacyFilter);
  const indexes = await RegistrationPoint.collection.indexes();
  const legacyNameIndex = indexes.find(isLegacyFullUniqueNameIndex);
  let scope = null;
  let conflicts = 0;
  if (assignCurrentEvent) {
    scope = await currentEventScope();
    conflicts = await assignmentConflicts(RegistrationPoint, legacyFilter, scope.event._id);
  }

  console.log(`Legacy/global registration points: ${legacyCount}`);
  console.log(`Legacy unique name_1 index: ${legacyNameIndex ? 'found' : 'not found'}`);
  console.log(`Current-event name conflicts: ${conflicts}`);
  if (conflicts > 0) {
    throw new Error(`Cannot assign registration points: ${conflicts} enabled names already exist in the current event`);
  }
  if (!dryRun && legacyNameIndex && !dropLegacyNameIndex) {
    throw new Error('REG_POINT_DROP_NAME_INDEX=true is required to replace the legacy full unique index');
  }

  if (assignCurrentEvent) {
    const { event, setting } = scope;

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
  if (!dryRun) {
    await RegistrationPoint.collection.createIndex(EVENT_NAME_INDEX.key, EVENT_NAME_INDEX.options);
    await RegistrationPoint.collection.createIndex(GLOBAL_NAME_INDEX.key, GLOBAL_NAME_INDEX.options);
  }

  console.log(dryRun ? 'Dry run completed.' : 'Migration completed.');
  if (dryRun) {
    console.log('Use --apply with REG_POINT_SCOPE_WRITE=true to write changes.');
    console.log('For apply, set REG_POINT_LEGACY_SCOPE_DECISION=global or current-event.');
    console.log('Set REG_POINT_DROP_NAME_INDEX=true to drop the old global unique name index.');
  }
}

module.exports = migrateRegistrationPointsScope;

if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');

  connectMongoForMigration(mongoUri)
    .then(() => {
      const apply = explicitMigrationApply({
        writeFlag: 'REG_POINT_SCOPE_WRITE',
        mongoSafetyGate: true,
      });
      const decision = legacyScopeDecision({
        value: process.env.REG_POINT_LEGACY_SCOPE_DECISION,
        required: apply,
        variableName: 'REG_POINT_LEGACY_SCOPE_DECISION',
      });
      return migrateRegistrationPointsScope({
      dryRun: !apply,
      assignCurrentEvent: decision === 'current-event',
      dropLegacyNameIndex: process.env.REG_POINT_DROP_NAME_INDEX === 'true',
      });
    })
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

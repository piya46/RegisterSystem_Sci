const mongoose = require('mongoose');
const ParticipantField = require('../models/participantField');
const SystemSetting = require('../models/SystemSetting');
const Event = require('../models/event');
const { explicitMigrationApply, legacyScopeDecision } = require('../utils/migrationMode');
const { isLegacyFullUniqueNameIndex } = require('../utils/mongoIndexMigration');
const { connectMongoForMigration } = require('../utils/mongoMigrationConnection');

const GLOBAL_NAME_INDEX = {
  key: { name: 1 },
  options: {
    unique: true,
    partialFilterExpression: { eventId: null },
    name: 'name_1',
  },
};

const EVENT_NAME_INDEX = {
  key: { eventId: 1, name: 1 },
  options: {
    unique: true,
    partialFilterExpression: { eventId: { $type: 'objectId' } },
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
  return model.countDocuments({ eventId, name: { $in: legacyNames } });
}

async function migrateParticipantFieldsScope({
  dryRun = true,
  assignCurrentEvent = false,
  dropLegacyNameIndex = false,
} = {}) {
  const legacyFilter = { $or: [{ eventId: null }, { eventId: { $exists: false } }] };
  const legacyCount = await ParticipantField.countDocuments(legacyFilter);
  const indexes = await ParticipantField.collection.indexes();
  const legacyNameIndex = indexes.find(isLegacyFullUniqueNameIndex);
  let scope = null;
  let conflicts = 0;
  if (assignCurrentEvent) {
    scope = await currentEventScope();
    conflicts = await assignmentConflicts(ParticipantField, legacyFilter, scope.event._id);
  }

  console.log(`Legacy/global participant fields: ${legacyCount}`);
  console.log(`Legacy unique name_1 index: ${legacyNameIndex ? 'found' : 'not found'}`);
  console.log(`Current-event name conflicts: ${conflicts}`);
  if (conflicts > 0) {
    throw new Error(`Cannot assign participant fields: ${conflicts} names already exist in the current event`);
  }
  if (!dryRun && legacyNameIndex && !dropLegacyNameIndex) {
    throw new Error('PARTICIPANT_FIELD_DROP_NAME_INDEX=true is required to replace the legacy full unique index');
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

    console.log(`${dryRun ? 'Would assign' : 'Assigning'} ${legacyCount} fields to current event ${event._id}.`);
    if (!dryRun) await ParticipantField.updateMany(legacyFilter, update);
  }

  if (dropLegacyNameIndex && legacyNameIndex) {
    console.log(`${dryRun ? 'Would drop' : 'Dropping'} legacy unique index name_1.`);
    if (!dryRun) await ParticipantField.collection.dropIndex('name_1');
  }
  if (!dryRun) {
    await ParticipantField.collection.createIndex(EVENT_NAME_INDEX.key, EVENT_NAME_INDEX.options);
    await ParticipantField.collection.createIndex(GLOBAL_NAME_INDEX.key, GLOBAL_NAME_INDEX.options);
  }

  console.log(dryRun ? 'Dry run completed.' : 'Migration completed.');
  if (dryRun) {
    console.log('Use --apply with PARTICIPANT_FIELD_SCOPE_WRITE=true to write changes.');
    console.log('For apply, set PARTICIPANT_FIELD_LEGACY_SCOPE_DECISION=global or current-event.');
    console.log('Set PARTICIPANT_FIELD_DROP_NAME_INDEX=true to drop the old global unique name index.');
  }
}

module.exports = migrateParticipantFieldsScope;

if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');

  connectMongoForMigration(mongoUri)
    .then(() => {
      const apply = explicitMigrationApply({
        writeFlag: 'PARTICIPANT_FIELD_SCOPE_WRITE',
        mongoSafetyGate: true,
      });
      const decision = legacyScopeDecision({
        value: process.env.PARTICIPANT_FIELD_LEGACY_SCOPE_DECISION,
        required: apply,
        variableName: 'PARTICIPANT_FIELD_LEGACY_SCOPE_DECISION',
      });
      return migrateParticipantFieldsScope({
      dryRun: !apply,
      assignCurrentEvent: decision === 'current-event',
      dropLegacyNameIndex: process.env.PARTICIPANT_FIELD_DROP_NAME_INDEX === 'true',
      });
    })
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

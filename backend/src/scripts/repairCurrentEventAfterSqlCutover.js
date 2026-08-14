const mongoose = require('mongoose');
const Event = require('../models/event');
const Participant = require('../models/participant');
const ParticipantField = require('../models/participantField');
const RegistrationPoint = require('../models/registrationPoint');
const SystemSetting = require('../models/SystemSetting');
const { connectMongoForMigration } = require('../utils/mongoMigrationConnection');
const { explicitMigrationApply } = require('../utils/migrationMode');
const { normalizeEventYear } = require('../utils/eventYear');

const DEFAULT_SOURCE_EVENT_ID = '6a3f90702a898b13ea8b4d11';
const DEFAULT_TARGET_EVENT_ID = '6a3f89d09eb7de1bdcb04a0a';
const CONFIRMATION = 'activate-2569-registration-event';

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const inlineValueIndex = item.indexOf('=');
    if (inlineValueIndex > 2) {
      args[item.slice(2, inlineValueIndex)] = item.slice(inlineValueIndex + 1);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function objectId(value, label) {
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) {
    throw new Error(`${label} must be a valid Mongo ObjectId`);
  }
  return new mongoose.Types.ObjectId(String(value));
}

function jsonDate(value) {
  return value ? new Date(value).toISOString() : null;
}

function fixedKioskEndDate(config = {}) {
  const start = config.kioskStartDate ? new Date(config.kioskStartDate) : null;
  const end = config.kioskEndDate ? new Date(config.kioskEndDate) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end >= start) {
    return null;
  }
  const fixed = new Date(start);
  fixed.setUTCHours(end.getUTCHours(), end.getUTCMinutes(), end.getUTCSeconds(), end.getUTCMilliseconds());
  if (fixed <= start) fixed.setTime(start.getTime() + 8 * 60 * 60 * 1000);
  return fixed;
}

async function inspect({ sourceEventId, targetEventId }) {
  const [settings, source, target] = await Promise.all([
    SystemSetting.findOne(),
    Event.findById(sourceEventId),
    Event.findById(targetEventId),
  ]);
  if (!source) throw new Error('Source event not found');
  if (!target) throw new Error('Target event not found');

  const [
    sourceParticipants,
    targetParticipants,
    sourceFields,
    targetFields,
    sourcePoints,
    targetPoints,
  ] = await Promise.all([
    Participant.countDocuments({ eventId: source._id }),
    Participant.countDocuments({ eventId: target._id }),
    ParticipantField.countDocuments({ eventId: source._id }),
    ParticipantField.countDocuments({ eventId: target._id }),
    RegistrationPoint.countDocuments({ eventId: source._id }),
    RegistrationPoint.countDocuments({ eventId: target._id }),
  ]);

  return {
    settings,
    source,
    target,
    counts: {
      sourceParticipants,
      targetParticipants,
      sourceFields,
      targetFields,
      sourcePoints,
      targetPoints,
    },
    kioskEndFix: fixedKioskEndDate(target.config || {}),
  };
}

function assertExpectedState(report) {
  const { settings, source, target, counts } = report;
  if (!settings) throw new Error('SystemSetting document is required');
  if (String(source._id) === String(target._id)) throw new Error('Source and target events must be different');
  if (normalizeEventYear(source.eventYear) !== '2027') throw new Error('Source event must be year 2027 for this guarded repair');
  if (normalizeEventYear(target.eventYear) !== '2569') throw new Error('Target event must be year 2569 for this guarded repair');
  if (counts.sourceParticipants !== 0) throw new Error('Source event must have zero participants before archive');
  if (counts.sourceFields !== 0) throw new Error('Source event must have zero participant fields before archive');
  if (counts.sourcePoints !== 0) throw new Error('Source event must have zero registration points before archive');
  if (counts.targetParticipants < 900) throw new Error('Target event must contain the migrated participant set');
  if (counts.targetFields < 8) throw new Error('Target event must contain migrated participant fields');
  if (counts.targetPoints < 4) throw new Error('Target event must contain migrated registration points');
}

function publicReport(report, apply) {
  const { settings, source, target, counts, kioskEndFix } = report;
  return {
    dryRun: !apply,
    confirmationRequired: apply ? null : CONFIRMATION,
    settings: {
      currentEventId: settings?.currentEventId ? String(settings.currentEventId) : null,
      currentEventYear: settings?.currentEventYear || '',
    },
    source: {
      id: String(source._id),
      name: source.name,
      eventYear: source.eventYear,
      status: source.status,
    },
    target: {
      id: String(target._id),
      name: target.name,
      eventYear: target.eventYear,
      status: target.status,
      kioskStartDate: jsonDate(target.config?.kioskStartDate),
      kioskEndDate: jsonDate(target.config?.kioskEndDate),
      plannedKioskEndDate: jsonDate(kioskEndFix),
    },
    counts,
    actions: [
      String(settings?.currentEventId || '') === String(target._id)
        ? null
        : 'set SystemSetting.currentEventId/currentEventYear to target event 2569',
      source.status === 'archived' ? null : 'archive empty source event 2027',
      kioskEndFix ? 'repair target event kioskEndDate because it is earlier than kioskStartDate' : null,
    ].filter(Boolean),
  };
}

async function applyRepair(report) {
  const { settings, source, target, kioskEndFix } = report;
  target.activatedAt = new Date();
  if (kioskEndFix) {
    target.config = {
      ...(target.config || {}),
      kioskEndDate: kioskEndFix,
    };
    target.markModified('config');
  }
  await target.save();

  if (source.status !== 'archived') {
    source.status = 'archived';
    source.archivedAt = new Date();
    await source.save();
  }

  settings.set({
    eventName: target.name,
    currentEventId: target._id,
    currentEventYear: normalizeEventYear(target.eventYear),
    currentEventSeriesId: target.seriesId || null,
    defaultOrganizationId: target.organizationId || null,
    eventLinkingMode: target.linkingMode || 'series-linked',
  });

  const config = target.config || {};
  [
    'enableRegister',
    'maintenanceMode',
    'enablePickup',
    'enableDelivery',
    'contactEmail',
    'welcomeMessage',
    'preRegStartDate',
    'preRegEndDate',
    'kioskStartDate',
    'kioskEndDate',
  ].forEach((key) => {
    if (config[key] !== undefined) settings.set(key, config[key]);
  });
  await settings.save();
}

async function run(args = parseArgs()) {
  const sourceEventId = objectId(args['source-event-id'] || process.env.SOURCE_EVENT_ID || DEFAULT_SOURCE_EVENT_ID, 'source-event-id');
  const targetEventId = objectId(args['target-event-id'] || process.env.TARGET_EVENT_ID || DEFAULT_TARGET_EVENT_ID, 'target-event-id');
  const apply = explicitMigrationApply({
    writeFlag: 'EVENT_CURRENT_SCOPE_WRITE',
    mongoSafetyGate: true,
    args: process.argv.slice(2),
  });
  if (apply && process.env.CONFIRM_EVENT_CURRENT_SCOPE !== CONFIRMATION) {
    throw new Error(`CONFIRM_EVENT_CURRENT_SCOPE=${CONFIRMATION} is required`);
  }

  const before = await inspect({ sourceEventId, targetEventId });
  assertExpectedState(before);
  const report = publicReport(before, apply);
  if (apply) {
    await applyRepair(before);
    report.after = publicReport(await inspect({ sourceEventId, targetEventId }), true);
  }
  return report;
}

if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');

  connectMongoForMigration(mongoUri)
    .then(() => run())
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      return mongoose.disconnect();
    })
    .catch((error) => {
      console.error(`Current event repair failed: ${error.message}`);
      mongoose.disconnect().finally(() => {
        process.exitCode = 1;
      });
    });
}

module.exports = {
  CONFIRMATION,
  fixedKioskEndDate,
  run,
};

require('dotenv').config();

const mongoose = require('mongoose');
const Event = require('../models/event');
const Participant = require('../models/participant');
const ParticipantField = require('../models/participantField');
const RegistrationPoint = require('../models/registrationPoint');
const { connectMongoForMigration } = require('../utils/mongoMigrationConnection');
const { explicitMigrationApply } = require('../utils/migrationMode');

const DEFAULT_SOURCE_EVENT_ID = '6a3f90702a898b13ea8b4d11';
const DEFAULT_TARGET_EVENT_ID = '6a3f89d09eb7de1bdcb04a0a';
const CONFIRMATION = 'move-2027-registration-setup-to-2569';

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const [rawKey, inlineValue] = item.slice(2).split(/=(.*)/s, 2);
    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) args[rawKey] = true;
    else {
      args[rawKey] = next;
      index += 1;
    }
  }
  return args;
}

function objectId(value, label) {
  const normalized = String(value || '').trim();
  if (!mongoose.Types.ObjectId.isValid(normalized)) throw new Error(`${label} must be a valid MongoDB ObjectId`);
  return new mongoose.Types.ObjectId(normalized);
}

async function inspect({ sourceEventId, targetEventId }) {
  const [source, target] = await Promise.all([
    Event.findById(sourceEventId).select('_id name slug eventYear status organizationId seriesId').lean(),
    Event.findById(targetEventId).select('_id name slug eventYear status organizationId seriesId').lean(),
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
    targetParticipantsWrongYear,
  ] = await Promise.all([
    Participant.countDocuments({ eventId: sourceEventId }),
    Participant.countDocuments({ eventId: targetEventId }),
    ParticipantField.countDocuments({ eventId: sourceEventId }),
    ParticipantField.countDocuments({ eventId: targetEventId }),
    RegistrationPoint.countDocuments({ eventId: sourceEventId }),
    RegistrationPoint.countDocuments({ eventId: targetEventId }),
    Participant.countDocuments({ eventId: targetEventId, eventYear: { $ne: String(target.eventYear || '') } }),
  ]);

  return {
    source,
    target,
    counts: {
      sourceParticipants,
      targetParticipants,
      sourceFields,
      targetFields,
      sourcePoints,
      targetPoints,
      targetParticipantsWrongYear,
    },
  };
}

function assertRepairGuard(report) {
  const { source, target, counts } = report;
  if (String(source._id) === String(target._id)) throw new Error('Source and target events must differ');
  if (String(source.eventYear) !== '2027') throw new Error('Source event year must be 2027 for this repair');
  if (String(target.eventYear) !== '2569') throw new Error('Target event year must be 2569 for this repair');
  if (source.status !== 'registration_open') throw new Error('Source event must still be registration_open for this guarded repair');
  if (target.status !== 'registration_open') throw new Error('Target event must be registration_open for this guarded repair');
  if (counts.sourceParticipants !== 0) throw new Error('Source event must have zero participants before moving setup');
  if (counts.targetParticipants < 900) throw new Error('Target event must have the legacy participant set before repair');
  if (counts.sourceFields !== 8) throw new Error('Source event must have exactly 8 participant fields to move');
  if (counts.sourcePoints !== 4) throw new Error('Source event must have exactly 4 registration points to move');
  if (counts.targetFields !== 0) throw new Error('Target event must not already have participant fields');
  if (counts.targetPoints !== 0) throw new Error('Target event must not already have registration points');
}

async function applyRepair({ sourceEventId, targetEventId, target }) {
  const now = new Date();
  const fieldUpdate = await ParticipantField.updateMany(
    { eventId: sourceEventId },
    {
      $set: {
        eventId: target._id,
        organizationId: target.organizationId || null,
        seriesId: target.seriesId || null,
        eventYear: String(target.eventYear || ''),
        updatedAt: now,
      },
    }
  );
  const pointUpdate = await RegistrationPoint.updateMany(
    { eventId: sourceEventId },
    {
      $set: {
        eventId: target._id,
        organizationId: target.organizationId || null,
        seriesId: target.seriesId || null,
        eventYear: String(target.eventYear || ''),
        updatedAt: now,
      },
    }
  );
  const participantUpdate = await Participant.updateMany(
    { eventId: targetEventId, eventYear: { $ne: String(target.eventYear || '') } },
    {
      $set: {
        organizationId: target.organizationId || null,
        seriesId: target.seriesId || null,
        eventYear: String(target.eventYear || ''),
        updatedAt: now,
      },
    }
  );
  return {
    movedFields: fieldUpdate.modifiedCount,
    movedPoints: pointUpdate.modifiedCount,
    normalizedParticipants: participantUpdate.modifiedCount,
  };
}

async function run(args = parseArgs()) {
  const apply = explicitMigrationApply({
    writeFlag: 'EVENT_REGISTRATION_TARGET_REPAIR_WRITE',
    mongoSafetyGate: true,
    args: process.argv.slice(2),
  });
  if (apply && String(process.env.CONFIRM_EVENT_REGISTRATION_TARGET_REPAIR || '').trim() !== CONFIRMATION) {
    throw new Error(`CONFIRM_EVENT_REGISTRATION_TARGET_REPAIR must be ${CONFIRMATION}`);
  }

  const sourceEventId = objectId(args['source-event-id'] || process.env.EVENT_REGISTRATION_REPAIR_SOURCE_EVENT_ID || DEFAULT_SOURCE_EVENT_ID, 'source event id');
  const targetEventId = objectId(args['target-event-id'] || process.env.EVENT_REGISTRATION_REPAIR_TARGET_EVENT_ID || DEFAULT_TARGET_EVENT_ID, 'target event id');
  const before = await inspect({ sourceEventId, targetEventId });
  assertRepairGuard(before);

  const report = {
    dryRun: !apply,
    confirmationRequired: apply ? null : CONFIRMATION,
    source: {
      id: String(before.source._id),
      name: before.source.name,
      slug: before.source.slug,
      eventYear: before.source.eventYear,
      status: before.source.status,
    },
    target: {
      id: String(before.target._id),
      name: before.target.name,
      slug: before.target.slug,
      eventYear: before.target.eventYear,
      status: before.target.status,
    },
    before: before.counts,
  };

  if (apply) {
    report.applied = await applyRepair({ sourceEventId, targetEventId, target: before.target });
    report.after = (await inspect({ sourceEventId, targetEventId })).counts;
  }
  return report;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');
  await connectMongoForMigration(mongoUri);
  try {
    console.log(JSON.stringify(await run(), null, 2));
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Event registration target repair failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  CONFIRMATION,
  run,
};

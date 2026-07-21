const mongoose = require('mongoose');
const Participant = require('../models/participant');
const RegistrationPoint = require('../models/registrationPoint');

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

async function resolvePoint(participant) {
  const rawPoint = participant.registeredPoint;
  if (!rawPoint || rawPoint === 'Online') return null;

  if (isObjectId(rawPoint)) {
    const byId = await RegistrationPoint.findById(rawPoint).select('name').lean();
    if (byId) return byId;
  }

  const name = String(rawPoint).trim();
  if (!name) return null;

  const scopedFilters = [];
  if (participant.eventId) scopedFilters.push({ eventId: participant.eventId, name });
  if (participant.eventYear) scopedFilters.push({ eventYear: participant.eventYear, name });
  scopedFilters.push({ $or: [{ eventId: null }, { eventId: { $exists: false } }], name });

  return RegistrationPoint.findOne({ $or: scopedFilters }).select('name').lean();
}

async function migrateParticipantRegisteredPoints({ dryRun = true } = {}) {
  const query = {
    $or: [
      { registeredPointName: { $exists: false } },
      { registeredPointName: '' },
      {
        $and: [
          { registrationType: { $ne: 'online' } },
          { registeredPoint: { $ne: 'Online' } },
          {
            $or: [
              { registeredPointId: { $exists: false } },
              { registeredPointId: null },
            ],
          },
        ],
      },
    ],
  };

  const total = await Participant.countDocuments(query);
  console.log(`Participants needing registered point backfill: ${total}`);

  let processed = 0;
  let matched = 0;
  const cursor = Participant.find(query)
    .select('registeredPoint registeredPointId registeredPointName eventId eventYear registrationType')
    .cursor();

  for await (const participant of cursor) {
    const update = {};
    if (participant.registeredPoint === 'Online' || participant.registrationType === 'online') {
      update.registeredPointName = 'Online';
    } else {
      const point = await resolvePoint(participant);
      if (point) {
        update.registeredPointId = point._id;
        update.registeredPointName = point.name;
        matched += 1;
      } else if (participant.registeredPoint) {
        update.registeredPointName = String(participant.registeredPoint);
      }
    }

    if (Object.keys(update).length > 0 && !dryRun) {
      await Participant.updateOne({ _id: participant._id }, { $set: update });
    }

    processed += 1;
    if (processed % 500 === 0) console.log(`Processed ${processed}/${total}`);
  }

  console.log(`${dryRun ? 'Dry run completed' : 'Migration completed'}: processed=${processed}, matchedPoints=${matched}`);
  if (dryRun) console.log('Run with PARTICIPANT_POINT_MIGRATION_WRITE=true to write changes.');
}

module.exports = migrateParticipantRegisteredPoints;

if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');

  mongoose.connect(mongoUri)
    .then(() => migrateParticipantRegisteredPoints({
      dryRun: process.env.PARTICIPANT_POINT_MIGRATION_WRITE !== 'true',
    }))
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

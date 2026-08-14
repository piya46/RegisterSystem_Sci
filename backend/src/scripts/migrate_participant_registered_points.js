const mongoose = require('mongoose');
const Participant = require('../models/participant');
const RegistrationPoint = require('../models/registrationPoint');
const { explicitMigrationApply } = require('../utils/migrationMode');
const { connectMongoForMigration } = require('../utils/mongoMigrationConnection');

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function addLookupValue(map, key, point) {
  if (!key) return;
  const existing = map.get(key) || [];
  existing.push(point);
  map.set(key, existing);
}

function pointLookup(points) {
  const lookup = {
    byId: new Map(),
    byEventIdAndName: new Map(),
    byEventYearAndName: new Map(),
    globalByName: new Map(),
  };
  for (const point of points || []) {
    lookup.byId.set(String(point._id), point);
    const name = String(point.name || '').trim();
    if (!name) continue;
    if (point.eventId) {
      addLookupValue(
        lookup.byEventIdAndName,
        `${point.eventId}:${name}`,
        point
      );
    }
    if (point.eventYear) {
      addLookupValue(
        lookup.byEventYearAndName,
        `${point.eventYear}:${name}`,
        point
      );
    }
    if (!point.eventId) addLookupValue(lookup.globalByName, name, point);
  }
  return lookup;
}

function uniqueLookup(map, key, description) {
  const matches = map.get(key) || [];
  if (matches.length > 1) {
    throw new Error(`Ambiguous registration point mapping for ${description}`);
  }
  return matches[0] || null;
}

function resolvePoint(participant, lookup) {
  const rawPoint = participant.registeredPoint;
  if (!rawPoint || rawPoint === 'Online') return null;

  if (isObjectId(rawPoint)) {
    const byId = lookup.byId.get(String(rawPoint));
    if (byId) {
      if (
        participant.eventId
        && byId.eventId
        && String(participant.eventId) !== String(byId.eventId)
      ) {
        throw new Error('Registration point ID belongs to a different event');
      }
      if (
        participant.eventYear
        && byId.eventYear
        && String(participant.eventYear) !== String(byId.eventYear)
      ) {
        throw new Error('Registration point ID belongs to a different event year');
      }
      return byId;
    }
  }

  const name = String(rawPoint).trim();
  if (!name) return null;

  if (participant.eventId) {
    const byEventId = uniqueLookup(
      lookup.byEventIdAndName,
      `${participant.eventId}:${name}`,
      'eventId and name'
    );
    if (byEventId) return byEventId;
  }
  if (participant.eventYear) {
    const byEventYear = uniqueLookup(
      lookup.byEventYearAndName,
      `${participant.eventYear}:${name}`,
      'eventYear and name'
    );
    if (byEventYear) return byEventYear;
  }
  return uniqueLookup(lookup.globalByName, name, 'global name');
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
  const points = await RegistrationPoint.find({})
    .select('name eventId eventYear')
    .lean();
  const lookup = pointLookup(points);

  let processed = 0;
  let matched = 0;
  const cursor = Participant.find(query)
    .select('registeredPoint registeredPointId registeredPointName eventId eventYear registrationType')
    .cursor();

  for await (const participant of cursor) {
    const update = {};
    if (participant.registeredPoint === 'Online') {
      update.registeredPointName = 'Online';
    } else {
      const point = resolvePoint(participant, lookup);
      if (point) {
        update.registeredPointId = point._id;
        update.registeredPointName = point.name;
        matched += 1;
      } else if (participant.registeredPoint) {
        update.registeredPointName = String(participant.registeredPoint);
      } else if (participant.registrationType === 'online') {
        update.registeredPointName = 'Online';
      }
    }

    if (Object.keys(update).length > 0 && !dryRun) {
      await Participant.updateOne({ _id: participant._id }, { $set: update });
    }

    processed += 1;
    if (processed % 500 === 0) console.log(`Processed ${processed}/${total}`);
  }

  console.log(`${dryRun ? 'Dry run completed' : 'Migration completed'}: processed=${processed}, matchedPoints=${matched}`);
  if (dryRun) console.log('Run with --apply and PARTICIPANT_POINT_MIGRATION_WRITE=true to write changes.');
}

module.exports = migrateParticipantRegisteredPoints;
module.exports.pointLookup = pointLookup;
module.exports.resolvePoint = resolvePoint;

if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');

  connectMongoForMigration(mongoUri)
    .then(() => {
      const apply = explicitMigrationApply({
        writeFlag: 'PARTICIPANT_POINT_MIGRATION_WRITE',
        mongoSafetyGate: true,
      });
      return migrateParticipantRegisteredPoints({ dryRun: !apply });
    })
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

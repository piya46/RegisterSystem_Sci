require('dotenv').config();

const mongoose = require('mongoose');
const Event = require('../models/event');
const { closeSQL, connectSQL, executeSql } = require('../config/sql');
const { applySqlMigrationCredentials, hydrateSqlMigrationSecrets } = require('../sql/migrationRuntime');
const { connectMongoForMigration } = require('../utils/mongoMigrationConnection');
const { explicitMigrationApply } = require('../utils/migrationMode');

const DEFAULT_EVENT_IDS = [
  '6a3f90702a898b13ea8b4d11',
  '6a3f89d09eb7de1bdcb04a0a',
];

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
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function eventIds(args = {}) {
  const raw = args['event-ids'] || args['event-id'] || process.env.EVENT_IDS || '';
  const ids = raw
    ? String(raw).split(',').map((value) => value.trim()).filter(Boolean)
    : DEFAULT_EVENT_IDS;
  ids.forEach((id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error(`Invalid event id: ${id}`);
  });
  return ids;
}

function jsonValue(value) {
  return JSON.stringify(value ?? null);
}

function dateValue(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date in SQL runtime config repair');
  return date;
}

function registrationConfig(event) {
  return {
    status: event.status,
    startsAt: event.startsAt || null,
    endsAt: event.endsAt || null,
    timezone: event.timezone || 'Asia/Bangkok',
    publication: event.publication || {},
    config: event.config || {},
  };
}

async function sqlEventForMongoId(mongoId) {
  const result = await executeSql(
    'SELECT id, mongo_id, event_year, slug, status FROM events WHERE mongo_id = ? LIMIT 1',
    [String(mongoId)],
    { operation: 'read', timeoutMs: 60000 }
  );
  return result.rows[0] || null;
}

async function currentRuntimeConfig(sqlEventId) {
  const result = await executeSql(
    `SELECT event_id,
            JSON_UNQUOTE(JSON_EXTRACT(registration_config_json, '$.status')) AS status,
            JSON_UNQUOTE(JSON_EXTRACT(registration_config_json, '$.config.kioskStartDate')) AS kioskStartDate,
            JSON_UNQUOTE(JSON_EXTRACT(registration_config_json, '$.config.kioskEndDate')) AS kioskEndDate
       FROM event_runtime_configs
      WHERE event_id = ?
      LIMIT 1`,
    [sqlEventId],
    { operation: 'read', timeoutMs: 60000 }
  );
  return result.rows[0] || null;
}

async function upsertRuntimeConfig(sqlEventId, event) {
  await executeSql(
    `INSERT INTO event_runtime_configs
      (event_id, public_links_json, branding_json, enabled_features_json,
       registration_config_json, layout_registration_form_json, templates_json,
       source_updated_at, migrated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       public_links_json=VALUES(public_links_json),
       branding_json=VALUES(branding_json),
       enabled_features_json=VALUES(enabled_features_json),
       registration_config_json=VALUES(registration_config_json),
       layout_registration_form_json=VALUES(layout_registration_form_json),
       templates_json=VALUES(templates_json),
       source_updated_at=VALUES(source_updated_at),
       migrated_at=VALUES(migrated_at)`,
    [
      sqlEventId,
      jsonValue(event.publicLinks || {}),
      jsonValue(event.branding || {}),
      jsonValue(event.config?.enabledFeatures || {}),
      jsonValue(registrationConfig(event)),
      jsonValue(event.layouts?.registrationForm || {}),
      jsonValue(event.templates || {}),
      dateValue(event.updatedAt),
    ],
    { operation: 'write', timeoutMs: 60000 }
  );
}

async function run(args = parseArgs()) {
  const apply = explicitMigrationApply({
    writeFlag: 'SQL_EVENT_RUNTIME_CONFIG_REPAIR_WRITE',
    mongoSafetyGate: false,
    args: process.argv.slice(2),
  });
  const ids = eventIds(args);
  const events = await Event.find({ _id: { $in: ids } }).lean();
  const eventsById = new Map(events.map((event) => [String(event._id), event]));
  const reports = [];

  for (const id of ids) {
    const event = eventsById.get(id);
    if (!event) throw new Error(`Event not found in MongoDB: ${id}`);
    const sqlEvent = await sqlEventForMongoId(id);
    if (!sqlEvent) throw new Error(`Event not found in MariaDB mirror: ${id}`);
    const before = await currentRuntimeConfig(sqlEvent.id);
    if (apply) await upsertRuntimeConfig(sqlEvent.id, event);
    const after = apply ? await currentRuntimeConfig(sqlEvent.id) : null;
    reports.push({
      mongoEventId: id,
      sqlEventId: String(sqlEvent.id),
      eventYear: event.eventYear,
      eventStatus: event.status,
      before,
      planned: {
        status: event.status,
        kioskStartDate: event.config?.kioskStartDate || null,
        kioskEndDate: event.config?.kioskEndDate || null,
      },
      after,
    });
  }

  return {
    dryRun: !apply,
    reports,
  };
}

async function main() {
  const args = parseArgs();
  const apply = process.argv.slice(2).includes('--apply');
  await connectMongoForMigration(process.env.MONGODB_URI || process.env.MONGO_URI);
  if (apply) {
    await hydrateSqlMigrationSecrets();
    applySqlMigrationCredentials();
  }
  await connectSQL();
  try {
    console.log(JSON.stringify(await run(args), null, 2));
  } finally {
    await closeSQL().catch(() => {});
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`SQL runtime config repair failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  run,
};

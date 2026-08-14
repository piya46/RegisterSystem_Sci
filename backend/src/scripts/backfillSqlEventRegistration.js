require('dotenv').config();

const crypto = require('crypto');
const mongoose = require('mongoose');
const Admin = require('../models/admin');
const Event = require('../models/event');
const EventSeries = require('../models/eventSeries');
const Organization = require('../models/organization');
const Participant = require('../models/participant');
const ParticipantField = require('../models/participantField');
const RegistrationPoint = require('../models/registrationPoint');
const ScopedRegistrationSession = require('../models/scopedRegistrationSession');
const SystemSetting = require('../models/SystemSetting');
const { closeSQL, connectSQL, executeSql, withSqlTransaction } = require('../config/sql');
const { connectMongoForMigration } = require('../utils/mongoMigrationConnection');
const {
  applySqlMigrationCredentials,
  hydrateSqlMigrationSecrets,
} = require('../sql/migrationRuntime');
const { createReportingMirrorRepository } = require('../sql/reportingMirrorRepository');
const {
  canonicalJson,
  mapEvent,
  mapEventSeries,
  mapOrganization,
  sourceHash,
} = require('../sql/reportingMirrorMapper');
const { blindIndex, encryptValue, encryptionEnabled } = require('../utils/fieldEncryption');
const { hashIdempotencyKey } = require('../utils/idempotency');
const { normalizeEventYear } = require('../utils/eventYear');
const { clearSecretCache, hydrateRuntimeSecrets } = require('../utils/secretProvider');

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

function sqlIdentifier(value) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `\`${value}\``;
}

function jsonValue(value) {
  return canonicalJson(JSON.parse(JSON.stringify(value ?? null)));
}

function dateValue(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date in event registration migration source');
  return date;
}

function mongoId(value) {
  if (!value) return null;
  const normalized = String(value);
  if (!/^[a-f0-9]{24}$/i.test(normalized)) throw new Error(`Invalid MongoDB ObjectId: ${normalized}`);
  return normalized;
}

function optionalMongoId(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  return /^[a-f0-9]{24}$/i.test(normalized) ? normalized : null;
}

function encryptedBuffer(value) {
  if (value === undefined || value === null || value === '') return null;
  return Buffer.from(jsonValue(encryptValue(value)), 'utf8');
}

function existingProtectedBuffer(value) {
  if (value === undefined || value === null || value === '') return null;
  return Buffer.from(jsonValue(value), 'utf8');
}

function requiredBlindIndex(label, value) {
  const index = blindIndex(label, value);
  if (!index) throw new Error(`Cannot create protected SQL lookup for ${label}; DATA_BLIND_INDEX_SECRET or DATA_ENCRYPTION_KEY is required`);
  return index;
}

function optionalBlindIndex(label, value) {
  if (!value) return null;
  return requiredBlindIndex(label, value);
}

function integer(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function upsertSql(transaction, table, row, { immutable = [] } = {}) {
  const columns = Object.keys(row);
  if (!columns.length) throw new Error(`Cannot upsert empty row into ${table}`);
  const updates = columns
    .filter((column) => !immutable.includes(column))
    .map((column) => `${sqlIdentifier(column)}=VALUES(${sqlIdentifier(column)})`);
  const sql = `INSERT INTO ${sqlIdentifier(table)} (${columns.map(sqlIdentifier).join(', ')})
    VALUES (${columns.map(() => '?').join(', ')})
    ON DUPLICATE KEY UPDATE ${updates.length ? updates.join(', ') : `${sqlIdentifier(columns[0])}=${sqlIdentifier(columns[0])}`}`;
  return transaction.executeWrite(sql, columns.map((column) => row[column]));
}

async function findSqlId(transaction, table, mongoIdValue, { required = true } = {}) {
  if (!mongoIdValue) {
    if (required) throw new Error(`Missing Mongo id for SQL ${table} lookup`);
    return null;
  }
  const result = await transaction.executeRead(
    `SELECT id FROM ${sqlIdentifier(table)} WHERE mongo_id = ? LIMIT 1`,
    [mongoId(mongoIdValue)]
  );
  const id = result.rows[0]?.id || null;
  if (!id && required) throw new Error(`SQL ${table} row is missing for Mongo id ${mongoIdValue}`);
  return id;
}

async function resolveEvent(args) {
  const eventId = args['event-id'] || process.env.EVENT_ID || process.env.CURRENT_EVENT_ID;
  const eventSlug = args['event-slug'] || args.slug || process.env.EVENT_SLUG;
  if (eventId) return Event.findById(eventId).lean();
  if (eventSlug) return Event.findOne({ slug: String(eventSlug).trim().toLowerCase() }).lean();
  const settings = await SystemSetting.findOne().select('currentEventId').lean();
  if (!settings?.currentEventId) return null;
  return Event.findById(settings.currentEventId).lean();
}

async function highestMongoId(model, filter) {
  const document = await model.findOne(filter).sort({ _id: -1 }).select('_id').lean();
  return document?._id ? String(document._id) : null;
}

function scopedFilter(event, extra = {}) {
  return { eventId: event._id, ...extra };
}

async function loadSource(event) {
  const eventYear = normalizeEventYear(event.eventYear);
  const [organization, series, points, fields, participants, sessions, eventStaffCount] = await Promise.all([
    Organization.findById(event.organizationId).lean(),
    EventSeries.findById(event.seriesId).lean(),
    RegistrationPoint.find(scopedFilter(event)).sort({ name: 1 }).lean(),
    ParticipantField.find(scopedFilter(event)).sort({ order: 1, name: 1 }).lean(),
    Participant.find(scopedFilter(event))
      .sort({ _id: 1 })
      .select('+secureIndex +secureSearch +registrationIdempotencyKeyHash +registrationIdempotencyFingerprint +certificateVerificationId')
      .lean(),
    ScopedRegistrationSession.find(scopedFilter(event)).sort({ _id: 1 }).lean(),
    Admin.countDocuments({
      role: { $in: ['staff', 'event_manager', 'event_admin'] },
      eventIds: event._id,
    }),
  ]);
  if (!organization) throw new Error('Event organization is missing in MongoDB');
  if (!series) throw new Error('Event series is missing in MongoDB');
  return {
    eventYear,
    organization,
    series,
    points,
    fields,
    participants,
    sessions,
    eventStaffCount,
    highWatermark: await highestMongoId(Participant, scopedFilter(event)),
  };
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

async function upsertFoundations(transaction, source) {
  const repository = createReportingMirrorRepository({ transaction });
  const organizationId = await repository.upsertOrganization(mapOrganization(source.organization));
  const seriesId = await repository.upsertEventSeries(mapEventSeries(source.series));
  const eventId = await repository.upsertEvent(mapEvent(source.event));
  return { organizationId, seriesId, eventId };
}

async function upsertRuntimeConfig(transaction, eventId, event) {
  await upsertSql(transaction, 'event_runtime_configs', {
    event_id: eventId,
    public_links_json: jsonValue(event.publicLinks || {}),
    branding_json: jsonValue(event.branding || {}),
    enabled_features_json: jsonValue(event.config?.enabledFeatures || {}),
    registration_config_json: jsonValue(registrationConfig(event)),
    layout_registration_form_json: jsonValue(event.layouts?.registrationForm || {}),
    templates_json: jsonValue(event.templates || {}),
    source_updated_at: dateValue(event.updatedAt),
    migrated_at: new Date(),
  }, { immutable: ['event_id'] });
}

async function upsertRegistrationPoints(transaction, source, sqlRefs) {
  const ids = new Map();
  const names = new Map();
  for (const point of source.points) {
    await upsertSql(transaction, 'event_registration_points', {
      mongo_id: mongoId(point._id),
      organization_id: sqlRefs.organizationId,
      series_id: sqlRefs.seriesId,
      event_id: sqlRefs.eventId,
      event_year: source.eventYear,
      name: String(point.name || '').trim(),
      description: point.description ? String(point.description) : null,
      point_type: String(point.type || 'onsite'),
      enabled: point.enabled !== false,
      allowed_staff_mongo_ids_json: jsonValue((point.allowedStaff || []).map(String)),
      device_ids_json: jsonValue(point.deviceIds || []),
      kiosk_policy_json: jsonValue(point.kioskPolicy || {}),
      source_created_at: dateValue(point.createdAt),
      source_updated_at: dateValue(point.updatedAt),
      migrated_at: new Date(),
    }, { immutable: ['mongo_id'] });
    const pointMongoId = String(point._id);
    ids.set(pointMongoId, await findSqlId(transaction, 'event_registration_points', point._id));
    names.set(pointMongoId, String(point.name || '').trim());
  }
  return { idsByMongoId: ids, namesByMongoId: names };
}

async function upsertParticipantFields(transaction, source, sqlRefs) {
  const ids = new Map();
  for (const field of source.fields) {
    await upsertSql(transaction, 'event_participant_fields', {
      mongo_id: mongoId(field._id),
      organization_id: sqlRefs.organizationId,
      series_id: sqlRefs.seriesId,
      event_id: sqlRefs.eventId,
      event_year: source.eventYear,
      field_name: String(field.name || '').trim(),
      label: String(field.label || field.name || '').trim(),
      field_type: String(field.type || 'text'),
      required: field.required === true,
      enabled: field.enabled !== false,
      display_order: integer(field.order, 0),
      options_json: jsonValue(field.options || []),
      source_updated_at: dateValue(field.updatedAt),
      migrated_at: new Date(),
    }, { immutable: ['mongo_id'] });
    ids.set(String(field.name), await findSqlId(transaction, 'event_participant_fields', field._id));
  }
  return ids;
}

function participantPointMongoId(participant) {
  return optionalMongoId(participant.registeredPointId) || optionalMongoId(participant.registeredPoint);
}

function participantRegisteredPointName(participant, pointMaps) {
  const explicitName = String(participant.registeredPointName || '').trim();
  if (explicitName) return explicitName;
  const pointMongoId = participantPointMongoId(participant);
  if (pointMongoId && pointMaps.namesByMongoId.has(pointMongoId)) return pointMaps.namesByMongoId.get(pointMongoId);
  const legacyValue = String(participant.registeredPoint || '').trim();
  return optionalMongoId(legacyValue) ? '' : legacyValue;
}

function participantRow(participant, source, sqlRefs, pointMaps) {
  const pointMongoId = participantPointMongoId(participant);
  const registeredPointId = pointMongoId
    ? pointMaps.idsByMongoId.get(pointMongoId) || null
    : null;
  const qrCode = String(participant.qrCode || '').trim();
  if (!qrCode) throw new Error(`Participant ${participant._id} is missing qrCode`);
  const certificateId = participant.certificateVerificationId ? String(participant.certificateVerificationId) : '';
  const secureIndex = participant.secureIndex || {};
  return {
    mongo_id: mongoId(participant._id),
    organization_id: sqlRefs.organizationId,
    series_id: sqlRefs.seriesId,
    event_id: sqlRefs.eventId,
    event_year: source.eventYear,
    qr_code_hash: requiredBlindIndex('qrCode', qrCode),
    qr_code_ciphertext: encryptedBuffer(qrCode),
    certificate_verification_hash: optionalBlindIndex('certificateVerificationId', certificateId),
    certificate_verification_ciphertext: certificateId ? encryptedBuffer(certificateId) : null,
    status: String(participant.status || 'registered'),
    registration_type: String(participant.registrationType || 'online'),
    registered_point_id: registeredPointId,
    registered_point_name: participantRegisteredPointName(participant, pointMaps),
    registered_by_mongo_id: mongoId(participant.registeredBy),
    followers: Math.max(0, integer(participant.followers, 0)),
    consent_status: participant.consent || null,
    special_assistance_ciphertext: existingProtectedBuffer(participant.specialAssistance),
    field_payload_json: jsonValue(participant.fields || {}),
    secure_index_json: jsonValue(secureIndex),
    secure_search_json: jsonValue(participant.secureSearch || []),
    email_blind_index: secureIndex.email || null,
    phone_blind_index: secureIndex.phone || null,
    name_blind_index: secureIndex.name || secureIndex.fullName || secureIndex.fullname || null,
    line_user_blind_index: optionalBlindIndex('lineUserId', participant.lineUserId),
    auth_provider: String(participant.authProvider || 'email'),
    auth_providers_json: jsonValue(participant.authProviders || []),
    primary_auth_provider: String(participant.primaryAuthProvider || 'email'),
    is_line_linked: participant.isLineLinked === true,
    line_profile_ciphertext: participant.lineDisplayName || participant.linePictureUrl
      ? encryptedBuffer({
        displayName: participant.lineDisplayName || '',
        pictureUrl: participant.linePictureUrl || '',
      })
      : null,
    notification_preferences_json: jsonValue(participant.notificationPreferences || {}),
    trusted_devices_json: jsonValue(participant.trustedDevices || []),
    tags_json: jsonValue(participant.tags || []),
    participant_token_version: Math.max(0, integer(participant.participantTokenVersion, 0)),
    is_deleted: participant.isDeleted === true,
    is_revoked: participant.isRevoked === true,
    is_forfeited: participant.isForfeited === true,
    registered_at: dateValue(participant.registeredAt || participant.createdAt),
    checked_in_at: dateValue(participant.checkedInAt),
    last_login_at: dateValue(participant.lastLoginAt),
    deleted_at: participant.isDeleted ? dateValue(participant.updatedAt) : null,
    revoked_at: participant.isRevoked ? dateValue(participant.updatedAt) : null,
    source_created_at: dateValue(participant.createdAt),
    source_updated_at: dateValue(participant.updatedAt),
    migrated_at: new Date(),
  };
}

async function upsertParticipantFieldValues(transaction, participant, participantId, fieldIdsByName, sqlEventId) {
  let count = 0;
  for (const [fieldName, fieldId] of fieldIdsByName.entries()) {
    if (!Object.prototype.hasOwnProperty.call(participant.fields || {}, fieldName)) continue;
    await upsertSql(transaction, 'event_registration_field_values', {
      participant_id: participantId,
      field_id: fieldId,
      event_id: sqlEventId,
      field_name: fieldName,
      value_type: 'text',
      value_ciphertext: existingProtectedBuffer(participant.fields[fieldName]),
      value_json: null,
      value_blind_index: participant.secureIndex?.[fieldName] || null,
      value_search_json: null,
    }, { immutable: ['participant_id', 'field_id'] });
    count += 1;
  }
  return count;
}

async function upsertParticipants(transaction, source, sqlRefs, pointMaps, fieldIdsByName) {
  let fieldValueCount = 0;
  for (const participant of source.participants) {
    await upsertSql(
      transaction,
      'event_registrations',
      participantRow(participant, source, sqlRefs, pointMaps),
      { immutable: ['mongo_id'] }
    );
    const participantId = await findSqlId(transaction, 'event_registrations', participant._id);
    fieldValueCount += await upsertParticipantFieldValues(
      transaction,
      participant,
      participantId,
      fieldIdsByName,
      sqlRefs.eventId
    );

    if (participant.registrationIdempotencyKeyHash && participant.registrationIdempotencyFingerprint) {
      await upsertSql(transaction, 'event_registration_idempotency_keys', {
        event_id: sqlRefs.eventId,
        key_hash: participant.registrationIdempotencyKeyHash,
        fingerprint_hash: hashIdempotencyKey('sql-event-registration:fingerprint', participant.registrationIdempotencyFingerprint),
        participant_id: participantId,
        request_scope: 'participant-registration',
        first_seen_at: dateValue(participant.registeredAt || participant.createdAt) || new Date(),
        last_replayed_at: null,
        replay_count: 0,
      }, { immutable: ['event_id', 'key_hash'] });
    }

    if (participant.checkedInAt) {
      const pointMongoId = participantPointMongoId(participant);
      await upsertSql(transaction, 'event_registration_checkins', {
        event_id: sqlRefs.eventId,
        participant_id: participantId,
        registration_point_id: pointMongoId ? pointMaps.idsByMongoId.get(pointMongoId) || null : null,
        checked_in_by_mongo_id: mongoId(participant.registeredBy),
        device_id: null,
        source_scope: participant.registrationType || 'staff',
        result: 'success',
        previous_status: 'registered',
        followers: Math.max(0, integer(participant.followers, 0)),
        checked_in_at: dateValue(participant.checkedInAt),
        created_at: dateValue(participant.checkedInAt),
      }, { immutable: ['id'] });
    }
  }
  return fieldValueCount;
}

async function upsertSessions(transaction, source, sqlRefs, pointIdsByMongoId) {
  let count = 0;
  for (const session of source.sessions) {
    const pointId = pointIdsByMongoId.get(String(session.pointId));
    if (!pointId) throw new Error(`Scoped registration session ${session._id} references a missing registration point`);
    const participantId = session.participantId
      ? await findSqlId(transaction, 'event_registrations', session.participantId, { required: false })
      : null;
    await upsertSql(transaction, 'event_scoped_registration_sessions', {
      jti_hash: requiredBlindIndex('scopedRegistrationSession.jti', session.jti),
      scope: String(session.scope || 'self_register_session'),
      event_id: sqlRefs.eventId,
      event_year: source.eventYear,
      point_id: pointId,
      staff_mongo_id: mongoId(session.staffId),
      participant_id: participantId,
      used_at: dateValue(session.usedAt),
      expires_at: dateValue(session.expiresAt),
      source_created_at: dateValue(session.createdAt),
      source_updated_at: dateValue(session.updatedAt),
      migrated_at: new Date(),
    }, { immutable: ['jti_hash'] });
    count += 1;
  }
  return count;
}

async function sqlCount(transaction, table, eventId) {
  const result = await transaction.executeRead(
    `SELECT COUNT(*) AS count FROM ${sqlIdentifier(table)} WHERE event_id = ?`,
    [eventId]
  );
  return Number(result.rows[0]?.count || 0);
}

async function writeReconciliation(transaction, sqlRefs, runId, sourceCounts, sqlCounts) {
  const sourceChecksum = sourceHash(sourceCounts);
  const sqlChecksum = sourceHash(sqlCounts);
  const mismatchCount = Object.entries(sourceCounts)
    .filter(([key, value]) => sqlCounts[key] !== value)
    .length;
  await upsertSql(transaction, 'event_registration_reconciliation_snapshots', {
    event_id: sqlRefs.eventId,
    run_id: runId,
    snapshot_type: 'event_registration_cutover',
    source_count: sourceCounts.participants || 0,
    sql_count: sqlCounts.participants || 0,
    source_checksum: sourceChecksum,
    sql_checksum: sqlChecksum,
    mismatch_count: mismatchCount,
    detail_json: jsonValue({ sourceCounts, sqlCounts }),
  }, { immutable: ['run_id', 'snapshot_type'] });
  return { sourceChecksum, sqlChecksum, mismatchCount };
}

async function applyBackfill({ event, source }) {
  const runId = crypto.randomUUID();
  return withSqlTransaction(async (transaction) => {
    const sqlRefs = await upsertFoundations(transaction, { ...source, event });
    await upsertRuntimeConfig(transaction, sqlRefs.eventId, event);
    const pointMaps = await upsertRegistrationPoints(transaction, source, sqlRefs);
    const fieldIdsByName = await upsertParticipantFields(transaction, source, sqlRefs);
    const fieldValueCount = await upsertParticipants(transaction, source, sqlRefs, pointMaps, fieldIdsByName);
    const sessionCount = await upsertSessions(transaction, source, sqlRefs, pointMaps.idsByMongoId);

    const sourceCounts = {
      points: source.points.length,
      fields: source.fields.length,
      participants: source.participants.length,
      participantFieldValues: fieldValueCount,
      sessions: source.sessions.length,
    };
    const sqlCounts = {
      points: await sqlCount(transaction, 'event_registration_points', sqlRefs.eventId),
      fields: await sqlCount(transaction, 'event_participant_fields', sqlRefs.eventId),
      participants: await sqlCount(transaction, 'event_registrations', sqlRefs.eventId),
      participantFieldValues: await sqlCount(transaction, 'event_registration_field_values', sqlRefs.eventId),
      sessions: await sqlCount(transaction, 'event_scoped_registration_sessions', sqlRefs.eventId),
    };
    const reconciliation = await writeReconciliation(transaction, sqlRefs, runId, sourceCounts, sqlCounts);
    const status = reconciliation.mismatchCount === 0 ? 'passed' : 'failed';
    await upsertSql(transaction, 'event_registration_cutover_runs', {
      run_id: runId,
      event_id: sqlRefs.eventId,
      mongo_event_id: mongoId(event._id),
      phase: 'event_registration_backfill',
      status,
      started_at: new Date(),
      completed_at: new Date(),
      source_high_watermark_mongo_id: source.highWatermark,
      source_counts_json: jsonValue(sourceCounts),
      sql_counts_json: jsonValue(sqlCounts),
      source_checksum: reconciliation.sourceChecksum,
      sql_checksum: reconciliation.sqlChecksum,
      blockers_json: reconciliation.mismatchCount === 0 ? jsonValue([]) : jsonValue(['count_mismatch']),
      note: 'MongoDB to MariaDB event registration backfill',
    }, { immutable: ['run_id'] });
    if (reconciliation.mismatchCount !== 0) {
      throw new Error(`Event registration SQL reconciliation failed: ${JSON.stringify({ sourceCounts, sqlCounts })}`);
    }
    return {
      runId,
      sqlEventId: sqlRefs.eventId,
      sourceCounts,
      sqlCounts,
      reconciliation,
      sessionCount,
    };
  });
}

async function runBackfill(args = parseArgs()) {
  const apply = args.apply === true || args.apply === 'true';
  const event = await resolveEvent(args);
  if (!event) throw new Error('Event not found. Pass --event-id=<mongoEventId> or set CURRENT_EVENT_ID');
  if (apply && process.env.SQL_EVENT_REGISTRATION_BACKFILL_WRITE !== 'true') {
    throw new Error('Applying event registration SQL backfill requires SQL_EVENT_REGISTRATION_BACKFILL_WRITE=true');
  }
  if (apply && !encryptionEnabled()) {
    throw new Error('FIELD_ENCRYPTION_ENABLED and DATA_ENCRYPTION_KEY are required before SQL primary event registration backfill');
  }
  const source = await loadSource(event);
  const report = {
    dryRun: !apply,
    event: {
      id: String(event._id),
      name: event.name,
      slug: event.slug,
      eventYear: source.eventYear,
      status: event.status,
    },
    sourceCounts: {
      eventStaff: source.eventStaffCount,
      points: source.points.length,
      fields: source.fields.length,
      participants: source.participants.length,
      sessions: source.sessions.length,
    },
    highWatermark: source.highWatermark,
  };
  if (!apply) return report;
  return { ...report, applied: await applyBackfill({ event, source }) };
}

async function hydrateSecrets({ apply }) {
  const required = ['MONGODB_URI'];
  if (apply) {
    required.push('DATA_ENCRYPTION_KEY', 'DATA_BLIND_INDEX_SECRET');
    await hydrateSqlMigrationSecrets(required);
  } else {
    await hydrateRuntimeSecrets({ requiredNames: required, managedNames: required });
  }
}

async function main() {
  const args = parseArgs();
  const apply = args.apply === true || args.apply === 'true';
  await hydrateSecrets({ apply });
  await connectMongoForMigration(process.env.MONGODB_URI || process.env.MONGO_URI);
  if (apply) {
    applySqlMigrationCredentials();
    await connectSQL();
  }
  try {
    const report = await runBackfill(args);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await closeSQL().catch(() => {});
    await mongoose.disconnect().catch(() => {});
    clearSecretCache();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`SQL event registration backfill failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  runBackfill,
};

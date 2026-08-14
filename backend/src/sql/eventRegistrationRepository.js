const crypto = require('crypto');
const { executeSql, withSqlTransaction } = require('../config/sql');
const { boolEnv } = require('../utils/cloudCostGuardrail');
const {
  blindIndex,
  decryptValue,
  participantBlindIndexes,
  participantSearchTokens,
  protectParticipantFields,
  revealParticipantFields,
} = require('../utils/fieldEncryption');
const { normalizeEventYear } = require('../utils/eventYear');

const DEFAULT_KIOSK_POLICY = {
  allowStaffMode: true,
  allowKioskMode: false,
  requireCamera: true,
  requireFullscreen: false,
  idleTimeoutSeconds: 120,
  successResetSeconds: 8,
};

function sqlEventRegistrationPrimaryEnabled(context = {}) {
  return boolEnv('SQL_EVENT_REGISTRATION_PRIMARY', false) && Boolean(context?.eventId);
}

function sqlIdentifier(value) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `\`${value}\``;
}

function parseJson(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (Buffer.isBuffer(value)) return parseJson(value.toString('utf8'), fallback);
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function jsonValue(value) {
  return JSON.stringify(value ?? null);
}

function dateValue(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date in SQL event registration payload');
  return date;
}

function mongoId(value) {
  if (!value) return null;
  const normalized = String(value);
  if (!/^[a-f0-9]{24}$/i.test(normalized)) return null;
  return normalized;
}

function decryptStoredValue(value) {
  const parsed = parseJson(value, value);
  return decryptValue(parsed);
}

function encryptedBuffer(value) {
  if (value === undefined || value === null || value === '') return null;
  return Buffer.from(jsonValue(value), 'utf8');
}

function requiredBlindIndex(label, value) {
  const index = blindIndex(label, value);
  if (!index) {
    const error = new Error(`Cannot create SQL event registration blind index for ${label}`);
    error.code = 'SQL_EVENT_REGISTRATION_BLIND_INDEX_MISSING';
    error.statusCode = 503;
    throw error;
  }
  return index;
}

function optionalBlindIndex(label, value) {
  if (!value) return null;
  return requiredBlindIndex(label, value);
}

function executorFor(transaction) {
  if (transaction) {
    return {
      read: (sql, params) => transaction.executeRead(sql, params),
      write: (sql, params) => transaction.executeWrite(sql, params),
    };
  }
  return {
    read: (sql, params) => executeSql(sql, params, { operation: 'read' }),
    write: (sql, params) => executeSql(sql, params, { operation: 'write' }),
  };
}

function idWhere(alias, id) {
  const value = String(id || '').trim();
  if (!value) throw new Error('SQL event registration id is required');
  if (/^\d+$/.test(value)) return { clause: `${alias}.id = ?`, params: [value] };
  const objectId = mongoId(value);
  if (!objectId) throw new Error('SQL event registration id must be a SQL id or Mongo ObjectId');
  return { clause: `${alias}.mongo_id = ?`, params: [objectId] };
}

async function resolveSqlEvent(context, transaction = null) {
  const eventMongoId = mongoId(context?.eventId);
  if (!eventMongoId) throw new Error('SQL event registration requires a Mongo eventId context');
  const executor = executorFor(transaction);
  const result = await executor.read(
    `SELECT id, mongo_id, organization_id, series_id, event_year
       FROM events
      WHERE mongo_id = ?
      LIMIT 1`,
    [eventMongoId]
  );
  const row = result.rows[0];
  if (!row) {
    const error = new Error('Event is not present in MariaDB. Run SQL schema/backfill before enabling event registration primary mode.');
    error.code = 'SQL_EVENT_NOT_BACKFILLED';
    error.statusCode = 503;
    throw error;
  }
  return row;
}

function normalizeIdList(values) {
  return (Array.isArray(values) ? values : parseJson(values, []))
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function fieldFromRow(row) {
  return {
    _id: String(row.mongo_id || row.id),
    id: String(row.mongo_id || row.id),
    sqlId: String(row.id),
    eventId: row.event_mongo_id || null,
    eventYear: row.event_year || '',
    name: row.field_name,
    label: row.label,
    type: row.field_type,
    required: Boolean(row.required),
    enabled: Boolean(row.enabled),
    order: Number(row.display_order || 0),
    options: parseJson(row.options_json, []),
    inherited: false,
  };
}

function pointFromRow(row) {
  return {
    _id: String(row.mongo_id || row.id),
    id: String(row.mongo_id || row.id),
    sqlId: String(row.id),
    eventId: row.event_mongo_id || null,
    eventYear: row.event_year || '',
    name: row.name,
    description: row.description || '',
    type: row.point_type,
    enabled: Boolean(row.enabled),
    allowedStaff: normalizeIdList(row.allowed_staff_mongo_ids_json),
    deviceIds: normalizeIdList(row.device_ids_json),
    kioskPolicy: parseJson(row.kiosk_policy_json, DEFAULT_KIOSK_POLICY) || DEFAULT_KIOSK_POLICY,
    requiresDeviceBinding: normalizeIdList(row.device_ids_json).length > 0,
  };
}

function participantFromRow(row) {
  const protectedFields = parseJson(row.field_payload_json, {}) || {};
  const fields = revealParticipantFields(protectedFields);
  const qrCode = decryptStoredValue(row.qr_code_ciphertext) || '';
  const specialAssistance = decryptStoredValue(row.special_assistance_ciphertext) || '';
  return {
    _id: String(row.mongo_id || row.id),
    id: String(row.mongo_id || row.id),
    sqlId: String(row.id),
    organizationId: row.organization_mongo_id || null,
    seriesId: row.series_mongo_id || null,
    eventId: row.event_mongo_id || null,
    eventYear: row.event_year || '',
    qrCode,
    fields,
    secureIndex: parseJson(row.secure_index_json, {}) || {},
    secureSearch: parseJson(row.secure_search_json, []) || [],
    status: row.status || 'registered',
    checkedInAt: row.checked_in_at || null,
    registeredAt: row.registered_at || row.created_at || null,
    createdAt: row.created_at || row.registered_at || null,
    updatedAt: row.updated_at || null,
    registeredBy: row.registered_by_mongo_id || null,
    registeredPoint: row.registered_point_name || '',
    registeredPointId: row.registered_point_mongo_id || (row.registered_point_id ? String(row.registered_point_id) : null),
    registeredPointName: row.registered_point_name || '',
    registrationType: row.registration_type || 'online',
    followers: Number(row.followers || 0),
    consent: row.consent_status || null,
    specialAssistance,
    tags: parseJson(row.tags_json, []) || [],
    isDeleted: Boolean(row.is_deleted),
    isRevoked: Boolean(row.is_revoked),
    isForfeited: Boolean(row.is_forfeited),
    authProvider: row.auth_provider || 'email',
    authProviders: parseJson(row.auth_providers_json, []) || [],
    primaryAuthProvider: row.primary_auth_provider || 'email',
    isLineLinked: Boolean(row.is_line_linked),
    notificationPreferences: parseJson(row.notification_preferences_json, {}) || {},
    registrationIdempotencyKeyHash: row.registration_idempotency_key_hash || null,
    registrationIdempotencyFingerprint: row.registration_idempotency_fingerprint || null,
  };
}

async function listParticipantFields(context, { enabledOnly = false } = {}) {
  const sqlEvent = await resolveSqlEvent(context);
  const params = [sqlEvent.id];
  const enabledClause = enabledOnly ? 'AND f.enabled = TRUE' : '';
  const result = await executeSql(
    `SELECT f.*, e.mongo_id AS event_mongo_id
       FROM event_participant_fields f
       JOIN events e ON e.id = f.event_id
      WHERE f.event_id = ?
        ${enabledClause}
      ORDER BY f.display_order ASC, f.field_name ASC`,
    params
  );
  return result.rows.map(fieldFromRow);
}

async function createParticipantField(context, payload) {
  const sqlEvent = await resolveSqlEvent(context);
  await executeSql(
    `INSERT INTO event_participant_fields
      (organization_id, series_id, event_id, event_year, field_name, label, field_type,
       required, enabled, display_order, options_json, migrated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
    [
      sqlEvent.organization_id,
      sqlEvent.series_id,
      sqlEvent.id,
      normalizeEventYear(sqlEvent.event_year || context.eventYear),
      payload.name,
      payload.label,
      payload.type || 'text',
      payload.required === true,
      payload.enabled !== false,
      Number.parseInt(payload.order, 10) || 0,
      jsonValue(Array.isArray(payload.options) ? payload.options : []),
    ],
    { operation: 'write' }
  );
  const fields = await listParticipantFields(context);
  return fields.find((field) => field.name === payload.name);
}

async function updateParticipantField(id, context, updates) {
  const sqlEvent = await resolveSqlEvent(context);
  const where = idWhere('f', id);
  const current = await executeSql(
    `SELECT f.*
       FROM event_participant_fields f
      WHERE f.event_id = ? AND ${where.clause}
      LIMIT 1`,
    [sqlEvent.id, ...where.params]
  );
  if (!current.rows[0]) return null;

  const next = {
    field_name: updates.name,
    label: updates.label,
    field_type: updates.type,
    required: updates.required,
    enabled: updates.enabled,
    display_order: updates.order,
    options_json: updates.options !== undefined ? jsonValue(updates.options) : undefined,
  };
  const entries = Object.entries(next).filter(([, value]) => value !== undefined);
  if (entries.length) {
    await executeSql(
      `UPDATE event_participant_fields f
          SET ${entries.map(([column]) => `${sqlIdentifier(column)} = ?`).join(', ')}
        WHERE f.event_id = ? AND ${where.clause}`,
      [
        ...entries.map(([, value]) => value),
        sqlEvent.id,
        ...where.params,
      ],
      { operation: 'write' }
    );
  }
  const fields = await listParticipantFields(context);
  const normalizedId = String(id);
  return fields.find((field) => field.sqlId === normalizedId || field._id === normalizedId) || null;
}

async function deleteParticipantField(id, context) {
  return updateParticipantField(id, context, { enabled: false });
}

async function listRegistrationPoints(context, { enabledOnly = false } = {}) {
  const sqlEvent = await resolveSqlEvent(context);
  const enabledClause = enabledOnly ? 'AND p.enabled = TRUE' : '';
  const result = await executeSql(
    `SELECT p.*, e.mongo_id AS event_mongo_id
       FROM event_registration_points p
       JOIN events e ON e.id = p.event_id
      WHERE p.event_id = ?
        ${enabledClause}
      ORDER BY p.point_type ASC, p.name ASC`,
    [sqlEvent.id]
  );
  return result.rows.map(pointFromRow);
}

async function findRegistrationPointById(id, context, transaction = null) {
  const sqlEvent = await resolveSqlEvent(context, transaction);
  const where = idWhere('p', id);
  const executor = executorFor(transaction);
  const result = await executor.read(
    `SELECT p.*, e.mongo_id AS event_mongo_id
       FROM event_registration_points p
       JOIN events e ON e.id = p.event_id
      WHERE p.event_id = ? AND ${where.clause}
      LIMIT 1`,
    [sqlEvent.id, ...where.params]
  );
  return result.rows[0] ? pointFromRow(result.rows[0]) : null;
}

async function createRegistrationPoint(context, payload) {
  const sqlEvent = await resolveSqlEvent(context);
  await executeSql(
    `INSERT INTO event_registration_points
      (organization_id, series_id, event_id, event_year, name, description, point_type,
       enabled, allowed_staff_mongo_ids_json, device_ids_json, kiosk_policy_json, migrated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
    [
      sqlEvent.organization_id,
      sqlEvent.series_id,
      sqlEvent.id,
      normalizeEventYear(sqlEvent.event_year || context.eventYear),
      payload.name,
      payload.description || '',
      payload.type || 'onsite',
      payload.enabled !== false,
      jsonValue(payload.allowedStaff || []),
      jsonValue(payload.deviceIds || []),
      jsonValue(payload.kioskPolicy || DEFAULT_KIOSK_POLICY),
    ],
    { operation: 'write' }
  );
  const points = await listRegistrationPoints(context);
  return points.find((point) => point.name === payload.name);
}

async function updateRegistrationPoint(id, context, updates) {
  const sqlEvent = await resolveSqlEvent(context);
  const where = idWhere('p', id);
  const current = await findRegistrationPointById(id, context);
  if (!current) return null;
  const next = {
    name: updates.name,
    description: updates.description,
    point_type: updates.type,
    enabled: updates.enabled,
    allowed_staff_mongo_ids_json: updates.allowedStaff !== undefined ? jsonValue(updates.allowedStaff) : undefined,
    device_ids_json: updates.deviceIds !== undefined ? jsonValue(updates.deviceIds) : undefined,
    kiosk_policy_json: updates.kioskPolicy !== undefined ? jsonValue(updates.kioskPolicy) : undefined,
  };
  const entries = Object.entries(next).filter(([, value]) => value !== undefined);
  if (entries.length) {
    await executeSql(
      `UPDATE event_registration_points p
          SET ${entries.map(([column]) => `${sqlIdentifier(column)} = ?`).join(', ')}
        WHERE p.event_id = ? AND ${where.clause}`,
      [...entries.map(([, value]) => value), sqlEvent.id, ...where.params],
      { operation: 'write' }
    );
  }
  return findRegistrationPointById(id, context);
}

async function softDeleteRegistrationPoint(id, context) {
  return updateRegistrationPoint(id, context, { enabled: false });
}

function participantSelectSql() {
  return `SELECT r.*, e.mongo_id AS event_mongo_id, o.mongo_id AS organization_mongo_id,
      s.mongo_id AS series_mongo_id, p.mongo_id AS registered_point_mongo_id,
      k.key_hash AS registration_idempotency_key_hash,
      k.fingerprint_hash AS registration_idempotency_fingerprint
    FROM event_registrations r
    JOIN events e ON e.id = r.event_id
    LEFT JOIN organizations o ON o.id = r.organization_id
    LEFT JOIN event_series s ON s.id = r.series_id
    LEFT JOIN event_registration_points p ON p.id = r.registered_point_id
    LEFT JOIN event_registration_idempotency_keys k ON k.participant_id = r.id`;
}

async function findParticipantById(id, context, transaction = null) {
  const sqlEvent = await resolveSqlEvent(context, transaction);
  const where = idWhere('r', id);
  const executor = executorFor(transaction);
  const result = await executor.read(
    `${participantSelectSql()}
      WHERE r.event_id = ? AND ${where.clause}
      LIMIT 1`,
    [sqlEvent.id, ...where.params]
  );
  return result.rows[0] ? participantFromRow(result.rows[0]) : null;
}

async function findParticipantByRegistrationIdempotency(context, keyHash) {
  if (!keyHash) return null;
  const sqlEvent = await resolveSqlEvent(context);
  const result = await executeSql(
    `${participantSelectSql()}
      WHERE k.event_id = ? AND k.key_hash = ?
      LIMIT 1`,
    [sqlEvent.id, keyHash]
  );
  return result.rows[0] ? participantFromRow(result.rows[0]) : null;
}

async function findDuplicateParticipant(context, fields = {}) {
  const sqlEvent = await resolveSqlEvent(context);
  const indexes = participantBlindIndexes(fields);
  const clauses = [];
  const params = [sqlEvent.id];
  if (indexes.email) {
    clauses.push('r.email_blind_index = ?');
    params.push(indexes.email);
  }
  if (indexes.phone) {
    clauses.push('r.phone_blind_index = ?');
    params.push(indexes.phone);
  }
  if (!clauses.length) return null;
  const result = await executeSql(
    `${participantSelectSql()}
      WHERE r.event_id = ?
        AND r.is_deleted = FALSE
        AND (${clauses.join(' OR ')})
      LIMIT 1`,
    params
  );
  return result.rows[0] ? participantFromRow(result.rows[0]) : null;
}

async function insertFieldValues(transaction, participantId, eventId, protectedFields, secureIndex) {
  const fields = await transaction.executeRead(
    `SELECT id, field_name FROM event_participant_fields WHERE event_id = ?`,
    [eventId]
  );
  await transaction.executeWrite('DELETE FROM event_registration_field_values WHERE participant_id = ?', [participantId]);
  for (const field of fields.rows) {
    if (!Object.prototype.hasOwnProperty.call(protectedFields || {}, field.field_name)) continue;
    await transaction.executeWrite(
      `INSERT INTO event_registration_field_values
        (participant_id, field_id, event_id, field_name, value_type, value_ciphertext, value_blind_index)
       VALUES (?, ?, ?, ?, 'text', ?, ?)`,
      [
        participantId,
        field.id,
        eventId,
        field.field_name,
        encryptedBuffer(protectedFields[field.field_name]),
        secureIndex?.[field.field_name] || null,
      ]
    );
  }
}

async function createParticipant(context, payload) {
  return withSqlTransaction(async (transaction) => {
    const sqlEvent = await resolveSqlEvent(context, transaction);
    const point = payload.registeredPointId
      ? await findRegistrationPointById(payload.registeredPointId, context, transaction)
      : null;
    const protectedFields = payload.fields || protectParticipantFields(payload.plainFields || {});
    const secureIndex = payload.secureIndex || participantBlindIndexes(payload.plainFields || {});
    const secureSearch = payload.secureSearch || participantSearchTokens(payload.plainFields || {});
    const specialAssistance = payload.specialAssistance;
    const qrCode = String(payload.qrCode || '').trim() || crypto.randomUUID();
    const registeredPointSqlId = point?.sqlId || null;
    const result = await transaction.executeWrite(
      `INSERT INTO event_registrations
        (organization_id, series_id, event_id, event_year, qr_code_hash, qr_code_ciphertext,
         certificate_verification_hash, certificate_verification_ciphertext, status, registration_type,
         registered_point_id, registered_point_name, registered_by_mongo_id, followers, consent_status,
         special_assistance_ciphertext, field_payload_json, secure_index_json, secure_search_json,
         email_blind_index, phone_blind_index, name_blind_index, auth_provider, auth_providers_json,
         primary_auth_provider, notification_preferences_json, tags_json, registered_at, checked_in_at,
         source_created_at, source_updated_at, migrated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
      [
        sqlEvent.organization_id,
        sqlEvent.series_id,
        sqlEvent.id,
        normalizeEventYear(sqlEvent.event_year || context.eventYear),
        requiredBlindIndex('qrCode', qrCode),
        encryptedBuffer(qrCode),
        payload.status || 'registered',
        payload.registrationType || 'online',
        registeredPointSqlId,
        payload.registeredPointName || point?.name || '',
        mongoId(payload.registeredBy),
        Math.max(0, Number.parseInt(payload.followers, 10) || 0),
        payload.consent || null,
        encryptedBuffer(specialAssistance),
        jsonValue(protectedFields),
        jsonValue(secureIndex),
        jsonValue(secureSearch),
        secureIndex.email || null,
        secureIndex.phone || null,
        secureIndex.name || secureIndex.fullName || secureIndex.fullname || null,
        payload.authProvider || 'email',
        jsonValue(payload.authProviders || []),
        payload.primaryAuthProvider || 'email',
        jsonValue(payload.notificationPreferences || {}),
        jsonValue(payload.tags || []),
        dateValue(payload.registeredAt) || new Date(),
        dateValue(payload.checkedInAt),
        new Date(),
        new Date(),
      ]
    );
    const participantId = result.rows.insertId;
    await insertFieldValues(transaction, participantId, sqlEvent.id, protectedFields, secureIndex);
    if (payload.registrationIdempotencyKeyHash && payload.registrationIdempotencyFingerprint) {
      await transaction.executeWrite(
        `INSERT INTO event_registration_idempotency_keys
          (event_id, key_hash, fingerprint_hash, participant_id, request_scope)
         VALUES (?, ?, ?, ?, 'participant-registration')
         ON DUPLICATE KEY UPDATE participant_id = VALUES(participant_id)`,
        [
          sqlEvent.id,
          payload.registrationIdempotencyKeyHash,
          payload.registrationIdempotencyFingerprint,
          participantId,
        ]
      );
    }
    return {
      ...(await findParticipantById(String(participantId), context, transaction)),
      qrCode,
      fields: payload.plainFields || revealParticipantFields(protectedFields),
      specialAssistance: decryptValue(specialAssistance),
    };
  });
}

async function listParticipants(context, { status = '' } = {}) {
  const sqlEvent = await resolveSqlEvent(context);
  const params = [sqlEvent.id];
  const statusClause = status ? 'AND r.status = ?' : '';
  if (status) params.push(status);
  const result = await executeSql(
    `${participantSelectSql()}
      WHERE r.event_id = ?
        AND r.is_deleted = FALSE
        ${statusClause}
      ORDER BY r.created_at DESC`,
    params
  );
  return result.rows.map(participantFromRow);
}

async function updateParticipant(id, context, updates) {
  return withSqlTransaction(async (transaction) => {
    const existing = await findParticipantById(id, context, transaction);
    if (!existing) return null;
    const sqlEvent = await resolveSqlEvent(context, transaction);
    const where = idWhere('r', id);
    const protectedFields = updates.fields || protectParticipantFields(updates.plainFields || existing.fields || {});
    const secureIndex = updates.secureIndex || participantBlindIndexes(updates.plainFields || existing.fields || {});
    const secureSearch = updates.secureSearch || participantSearchTokens(updates.plainFields || existing.fields || {});
    const assignments = {
      followers: updates.followers,
      consent_status: updates.consent,
      special_assistance_ciphertext: updates.specialAssistance !== undefined ? encryptedBuffer(updates.specialAssistance) : undefined,
      field_payload_json: jsonValue(protectedFields),
      secure_index_json: jsonValue(secureIndex),
      secure_search_json: jsonValue(secureSearch),
      email_blind_index: secureIndex.email || null,
      phone_blind_index: secureIndex.phone || null,
      name_blind_index: secureIndex.name || secureIndex.fullName || secureIndex.fullname || null,
      tags_json: updates.tags !== undefined ? jsonValue(updates.tags) : undefined,
      updated_at: new Date(),
      source_updated_at: new Date(),
    };
    const entries = Object.entries(assignments).filter(([, value]) => value !== undefined);
    await transaction.executeWrite(
      `UPDATE event_registrations r
          SET ${entries.map(([column]) => `${sqlIdentifier(column)} = ?`).join(', ')}
        WHERE r.event_id = ? AND ${where.clause}`,
      [...entries.map(([, value]) => value), sqlEvent.id, ...where.params]
    );
    const participantId = existing.sqlId;
    await insertFieldValues(transaction, participantId, sqlEvent.id, protectedFields, secureIndex);
    return findParticipantById(id, context, transaction);
  });
}

async function softDeleteParticipant(id, context) {
  const sqlEvent = await resolveSqlEvent(context);
  const where = idWhere('r', id);
  await executeSql(
    `UPDATE event_registrations r
        SET is_deleted = TRUE,
            is_revoked = TRUE,
            deleted_at = CURRENT_TIMESTAMP(3),
            revoked_at = CURRENT_TIMESTAMP(3),
            participant_token_version = participant_token_version + 1,
            updated_at = CURRENT_TIMESTAMP(3)
      WHERE r.event_id = ? AND ${where.clause}`,
    [sqlEvent.id, ...where.params],
    { operation: 'write' }
  );
  return true;
}

async function findParticipantByQr(context, qrCode, transaction = null, { forUpdate = false } = {}) {
  const sqlEvent = await resolveSqlEvent(context, transaction);
  const executor = executorFor(transaction);
  const result = await executor.read(
    `${participantSelectSql()}
      WHERE r.event_id = ?
        AND r.qr_code_hash = ?
        AND r.is_deleted = FALSE
      LIMIT 1
      ${forUpdate ? 'FOR UPDATE' : ''}`,
    [sqlEvent.id, requiredBlindIndex('qrCode', qrCode)]
  );
  return result.rows[0] ? participantFromRow(result.rows[0]) : null;
}

async function checkinParticipantByQr(context, qrCode, {
  registrationPointId,
  registeredBy,
  followers,
  sourceScope = 'staff',
} = {}) {
  return withSqlTransaction(async (transaction) => {
    const sqlEvent = await resolveSqlEvent(context, transaction);
    const participant = await findParticipantByQr(context, qrCode, transaction, { forUpdate: true });
    if (!participant) return null;
    if (participant.status === 'checkedIn') {
      const error = new Error('Already checked in.');
      error.code = 'SQL_EVENT_PARTICIPANT_ALREADY_CHECKED_IN';
      error.statusCode = 400;
      throw error;
    }
    const point = registrationPointId
      ? await findRegistrationPointById(registrationPointId, context, transaction)
      : null;
    const checkedInAt = new Date();
    await transaction.executeWrite(
      `UPDATE event_registrations
          SET status = 'checkedIn',
              checked_in_at = ?,
              registered_by_mongo_id = ?,
              registered_point_id = ?,
              registered_point_name = ?,
              followers = COALESCE(?, followers),
              updated_at = CURRENT_TIMESTAMP(3)
        WHERE id = ?`,
      [
        checkedInAt,
        mongoId(registeredBy),
        point?.sqlId || null,
        point?.name || '',
        followers === undefined ? null : Math.max(0, Number.parseInt(followers, 10) || 0),
        participant.sqlId,
      ]
    );
    await transaction.executeWrite(
      `INSERT INTO event_registration_checkins
        (event_id, participant_id, registration_point_id, checked_in_by_mongo_id,
         source_scope, result, previous_status, followers, checked_in_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'success', ?, ?, ?, ?)`,
      [
        sqlEvent.id,
        participant.sqlId,
        point?.sqlId || null,
        mongoId(registeredBy),
        sourceScope,
        participant.status,
        followers === undefined ? participant.followers : Math.max(0, Number.parseInt(followers, 10) || 0),
        checkedInAt,
        checkedInAt,
      ]
    );
    return findParticipantById(participant.sqlId, context, transaction);
  });
}

module.exports = {
  checkinParticipantByQr,
  createParticipant,
  createParticipantField,
  createRegistrationPoint,
  deleteParticipantField,
  findDuplicateParticipant,
  findParticipantById,
  findParticipantByQr,
  findParticipantByRegistrationIdempotency,
  findRegistrationPointById,
  listParticipantFields,
  listParticipants,
  listRegistrationPoints,
  softDeleteParticipant,
  softDeleteRegistrationPoint,
  sqlEventRegistrationPrimaryEnabled,
  updateParticipant,
  updateParticipantField,
  updateRegistrationPoint,
};

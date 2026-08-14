const mongoose = require('mongoose');
const Admin = require('../models/admin');
const Event = require('../models/event');
const Package = require('../models/Package');
const ParticipantField = require('../models/participantField');
const RegistrationPoint = require('../models/registrationPoint');
const SystemSetting = require('../models/SystemSetting');
const { closeSQL, connectSQL } = require('../config/sql');
const sqlEventRegistration = require('../sql/eventRegistrationRepository');
const { connectMongoForMigration } = require('../utils/mongoMigrationConnection');
const { explicitMigrationApply } = require('../utils/migrationMode');
const { isLegacyFullUniqueNameIndex } = require('../utils/mongoIndexMigration');
const { normalizeEventYear } = require('../utils/eventYear');
const { listEffectiveParticipantFields } = require('../utils/participantFieldScope');

const BASIC_FIELDS = new Set(['name', 'email', 'phone']);
const DEFAULT_POINT_NAME = 'จุดลงทะเบียนหลัก';
const DEFAULT_KIOSK_POINT_NAME = 'Kiosk หน้างาน';
const DEFAULT_KIOSK_POLICY = {
  allowStaffMode: true,
  allowKioskMode: false,
  requireCamera: true,
  requireFullscreen: false,
  idleTimeoutSeconds: 120,
  successResetSeconds: 8,
};
const DEFAULT_FIELDS = [
  { name: 'name', label: 'ชื่อ-นามสกุล', type: 'text', required: true, order: 10 },
  { name: 'email', label: 'อีเมล', type: 'email', required: true, order: 20 },
  { name: 'phone', label: 'เบอร์โทรศัพท์', type: 'text', required: true, order: 30 },
  { name: 'dept', label: 'ภาควิชา/หน่วยงาน', type: 'text', required: false, order: 40 },
  { name: 'date_year', label: 'ปีการศึกษา', type: 'text', required: false, order: 50 },
  { name: 'usr_add', label: 'ที่อยู่', type: 'text', required: false, order: 80 },
  { name: 'usr_add_post', label: 'รหัสไปรษณีย์', type: 'text', required: false, order: 90 },
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
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function boolValue(value, fallback = false) {
  if (value === undefined) return fallback;
  if (value === true) return true;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function boolArg(args, name, fallback = false) {
  return boolValue(args[name], fallback);
}

function pointPolicy({ existingPolicy = {}, allowKioskMode = false } = {}) {
  return {
    ...DEFAULT_KIOSK_POLICY,
    ...(existingPolicy || {}),
    allowKioskMode: allowKioskMode === true
      ? true
      : existingPolicy?.allowKioskMode === true,
  };
}

async function resolveEvent(args) {
  const eventId = args['event-id'] || process.env.EVENT_ID || process.env.CURRENT_EVENT_ID;
  const eventSlug = args['event-slug'] || args.slug || process.env.EVENT_SLUG;
  if (eventId) return Event.findById(eventId);
  if (eventSlug) return Event.findOne({ slug: String(eventSlug).trim().toLowerCase() });
  const settings = await SystemSetting.findOne().select('currentEventId');
  if (!settings?.currentEventId) return null;
  return Event.findById(settings.currentEventId);
}

function eventRefs(event) {
  return {
    organizationId: event.organizationId || null,
    seriesId: event.seriesId || null,
    eventId: event._id,
    eventYear: normalizeEventYear(event.eventYear),
  };
}

function normalizeField(field) {
  const fallback = DEFAULT_FIELDS.find((item) => item.name === field.name) || {};
  const type = ['text', 'email', 'number', 'select', 'date'].includes(field.type) ? field.type : fallback.type || 'text';
  return {
    name: field.name,
    label: field.label || fallback.label || field.name,
    type,
    required: BASIC_FIELDS.has(field.name) ? true : field.required === true,
    options: Array.isArray(field.options) ? field.options : [],
    order: Number.isFinite(Number(field.order)) ? Number(field.order) : fallback.order || 100,
    enabled: field.enabled !== false,
  };
}

function uniqueFields(fields) {
  const map = new Map();
  fields.forEach((field) => {
    if (!field?.name || map.has(field.name)) return;
    map.set(field.name, normalizeField(field));
  });
  return [...map.values()].sort((a, b) => a.order - b.order);
}

function pointPayload({ event, name, type = 'onsite', allowKioskMode = false, description = '' }) {
  return {
    ...eventRefs(event),
    name,
    description: description || (type === 'kiosk' ? 'Kiosk event registration point' : 'Default event registration point'),
    type,
    enabled: true,
    kioskPolicy: pointPolicy({ allowKioskMode: allowKioskMode || type === 'kiosk' }),
  };
}

async function upsertRegistrationPoint({ event, apply, name, type = 'onsite', allowKioskMode = false, description = '' }) {
  const context = eventRefs(event);
  const useSqlPrimary = sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(context);
  const existing = useSqlPrimary
    ? (await sqlEventRegistration.listRegistrationPoints(context)).find((point) => point.name === name)
    : await RegistrationPoint.findOne({ eventId: event._id, name });
  const payload = pointPayload({ event, name, type, allowKioskMode, description });
  if (!existing) {
    if (apply) {
      if (useSqlPrimary) await sqlEventRegistration.createRegistrationPoint(context, payload);
      else await RegistrationPoint.create(payload);
    }
    return [`create registration point ${name}`];
  }

  const update = {};
  if (existing.enabled !== true) update.enabled = true;
  if (existing.type !== type) update.type = type;
  if (description && existing.description !== description) update.description = description;

  const nextPolicy = pointPolicy({
    existingPolicy: existing.kioskPolicy || {},
    allowKioskMode: allowKioskMode || type === 'kiosk',
  });
  const policyChanged = JSON.stringify(existing.kioskPolicy || {}) !== JSON.stringify(nextPolicy);
  if (policyChanged) update.kioskPolicy = nextPolicy;

  if (Object.keys(update).length === 0) return [];
  if (apply) {
    if (useSqlPrimary) {
      await sqlEventRegistration.updateRegistrationPoint(existing.sqlId || existing._id || existing.id, context, update);
    } else {
      await RegistrationPoint.updateOne({ _id: existing._id }, { $set: update });
    }
  }
  return [`update registration point ${name}: ${Object.keys(update).join(', ')}`];
}

async function ensureParticipantFields({ event, apply, includeAddress }) {
  const context = eventRefs(event);
  const useSqlPrimary = sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(context);
  const [effectiveFields, directFields] = await Promise.all([
    listEffectiveParticipantFields(context, { enabledOnly: false }),
    useSqlPrimary
      ? sqlEventRegistration.listParticipantFields(context, { enabledOnly: false })
      : ParticipantField.find({ eventId: event._id }).lean(),
  ]);
  const directByName = new Map(directFields.map((field) => [field.name, field]));
  const wantedNames = new Set([
    ...DEFAULT_FIELDS.filter((field) => BASIC_FIELDS.has(field.name)).map((field) => field.name),
    ...effectiveFields.map((field) => field.name),
  ]);
  if (includeAddress) {
    wantedNames.add('usr_add');
    wantedNames.add('usr_add_post');
  }
  const sourceFields = uniqueFields([
    ...effectiveFields,
    ...DEFAULT_FIELDS,
  ]).filter((field) => wantedNames.has(field.name));

  const actions = [];
  const legacyNameIndex = useSqlPrimary
    ? null
    : (await ParticipantField.collection.indexes()).find(isLegacyFullUniqueNameIndex);
  const needsCreate = sourceFields.some((field) => !directByName.has(field.name));
  if (needsCreate && legacyNameIndex) {
    actions.push('blocked field creation: legacy participantfields.name_1 index exists; run npm run migrate:participant-fields with PARTICIPANT_FIELD_DROP_NAME_INDEX=true first');
    return actions;
  }

  for (const field of sourceFields) {
    const existing = directByName.get(field.name);
    const payload = { ...context, ...field };
    if (!existing) {
      actions.push(`create field ${field.name}`);
      if (apply) {
        if (useSqlPrimary) await sqlEventRegistration.createParticipantField(context, payload);
        else await ParticipantField.create(payload);
      }
      continue;
    }
    const update = {};
    if (existing.enabled !== true) update.enabled = true;
    if (BASIC_FIELDS.has(field.name) && existing.required !== true) update.required = true;
    if (Object.keys(update).length > 0) {
      actions.push(`update field ${field.name}: ${Object.keys(update).join(', ')}`);
      if (apply) {
        if (useSqlPrimary) {
          await sqlEventRegistration.updateParticipantField(existing.sqlId || existing._id || existing.id, context, update);
        } else {
          await ParticipantField.updateOne({ _id: existing._id }, { $set: update });
        }
      }
    }
  }
  return actions;
}

async function ensureRegistrationPoint({ event, apply, args }) {
  const context = eventRefs(event);
  const useSqlPrimary = sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(context);
  const enabledPoints = useSqlPrimary
    ? await sqlEventRegistration.listRegistrationPoints(context, { enabledOnly: true })
    : await RegistrationPoint.find({ eventId: event._id, enabled: true }).select('name type kioskPolicy').lean();
  const actions = [];
  const requestedName = String(args['point-name'] || DEFAULT_POINT_NAME).trim();
  const requestedType = String(args['point-type'] || 'onsite').trim();
  const requestedAllowKiosk = boolArg(args, 'allow-kiosk', false);

  if (enabledPoints.length === 0) {
    actions.push(...(await upsertRegistrationPoint({
      event,
      apply,
      name: requestedName,
      type: requestedType,
      allowKioskMode: requestedAllowKiosk,
    })));
  } else if (args['point-name'] || args['point-type']) {
    actions.push(...(await upsertRegistrationPoint({
      event,
      apply,
      name: requestedName,
      type: requestedType,
      allowKioskMode: requestedAllowKiosk,
    })));
  }

  const willHaveKioskFromRequestedPoint = requestedType === 'kiosk' || requestedAllowKiosk;
  const requestedPointScheduled = enabledPoints.length === 0 || Boolean(args['point-name'] || args['point-type']);
  const kioskReady = enabledPoints.some((point) => point.type === 'kiosk' || point.kioskPolicy?.allowKioskMode === true)
    || (requestedPointScheduled && willHaveKioskFromRequestedPoint);
  const shouldEnsureKiosk = boolArg(args, 'ensure-kiosk', false) || willHaveKioskFromRequestedPoint;
  if (shouldEnsureKiosk && !kioskReady) {
    const kioskName = String(args['kiosk-point-name'] || (willHaveKioskFromRequestedPoint ? requestedName : DEFAULT_KIOSK_POINT_NAME)).trim();
    actions.push(...(await upsertRegistrationPoint({
      event,
      apply,
      name: kioskName,
      type: 'kiosk',
      allowKioskMode: true,
      description: 'Kiosk event registration point',
    })));
  }

  return actions;
}

async function assignStaff({ event, apply, args }) {
  const staffId = args['staff-id'];
  const staffUsername = args['staff-username'];
  if (!staffId && !staffUsername) return [];

  const admin = staffId
    ? await Admin.findById(staffId)
    : await Admin.findOne({ username: staffUsername });
  if (!admin) return [`staff not found: ${staffId || staffUsername}`];

  const pointName = String(args['staff-point-name'] || '').trim();
  const context = eventRefs(event);
  const useSqlPrimary = sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(context);
  const points = useSqlPrimary
    ? (await sqlEventRegistration.listRegistrationPoints(context, { enabledOnly: true }))
      .filter((point) => !pointName || point.name === pointName)
    : await RegistrationPoint.find({
      eventId: event._id,
      enabled: true,
      ...(pointName ? { name: pointName } : {}),
    }).select('_id name allowedStaff').lean();
  const pointIds = points.map((point) => point._id);
  const mongoPointIds = pointIds.filter((pointId) => mongoose.Types.ObjectId.isValid(String(pointId)));
  const addToSet = { eventIds: event._id };
  if (mongoPointIds.length > 0) addToSet.registrationPoints = { $each: mongoPointIds };

  if (apply) {
    await Admin.updateOne({ _id: admin._id }, { $addToSet: addToSet });
    if (useSqlPrimary) {
      for (const point of points) {
        const allowedStaff = new Set((Array.isArray(point.allowedStaff) ? point.allowedStaff : []).map(String));
        allowedStaff.add(String(admin._id));
        await sqlEventRegistration.updateRegistrationPoint(point.sqlId || point._id || point.id, context, {
          allowedStaff: [...allowedStaff],
        });
      }
    } else if (pointIds.length > 0) {
      await RegistrationPoint.updateMany(
        { _id: { $in: pointIds } },
        { $addToSet: { allowedStaff: admin._id } }
      );
    }
  }

  const roles = Array.isArray(admin.role) ? admin.role : [];
  const roleWarning = roles.some((role) => ['staff', 'event_manager', 'event_admin'].includes(role))
    ? ''
    : '; warning: user role is not staff/event_manager/event_admin';
  if (pointName && pointIds.length === 0) return [`assign staff ${admin.username} to event only; point not found: ${pointName}${roleWarning}`];
  if (pointIds.length === 0) return [`assign staff ${admin.username} to event only${roleWarning}`];
  return [`assign staff ${admin.username} to event and points ${points.map((point) => point.name).join(', ')}${roleWarning}`];
}

async function handlePackageFeature({ event, apply, args }) {
  const packagesEnabled = event.config?.enabledFeatures?.packages === true;
  if (!packagesEnabled) return [];
  const activePackages = await Package.countDocuments({ eventId: event._id, isActive: true, deletedAt: null });
  if (activePackages > 0) return [];
  if (!args['disable-empty-packages']) {
    return ['packages feature is enabled but no active package exists; add package data or rerun with --disable-empty-packages'];
  }
  const config = event.config || {};
  const enabledFeatures = { ...(config.enabledFeatures || {}), packages: false };
  const nextConfig = { ...config, enabledFeatures };
  if (apply) await Event.updateOne({ _id: event._id }, { $set: { config: nextConfig } });
  return ['disable empty packages feature'];
}

async function seedEventRegistrationMinimum({ apply = false, args = parseArgs() } = {}) {
  const event = await resolveEvent(args);
  if (!event) throw new Error('Event not found. Pass --event-id, --event-slug, or set SystemSetting.currentEventId.');

  const includeAddress = event.config?.enabledFeatures?.packages === true || args['include-address'] === true;
  const actions = [
    ...(await ensureParticipantFields({ event, apply, includeAddress })),
    ...(await ensureRegistrationPoint({ event, apply, args })),
    ...(await assignStaff({ event, apply, args })),
    ...(await handlePackageFeature({ event, apply, args })),
  ];

  return {
    apply,
    event: {
      id: String(event._id),
      name: event.name,
      slug: event.slug,
      eventYear: normalizeEventYear(event.eventYear),
    },
    actions,
  };
}

function printResult(result) {
  console.log(`Event: ${result.event.name} / ${result.event.eventYear} / ${result.event.id}`);
  console.log(result.apply ? 'Applied setup changes.' : 'Dry run only.');
  if (!result.actions.length) {
    console.log('No setup changes needed.');
    return;
  }
  result.actions.forEach((action) => console.log(`- ${action}`));
}

module.exports = seedEventRegistrationMinimum;

if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const args = parseArgs();
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');

  connectMongoForMigration(mongoUri)
    .then(async () => {
      if (boolValue(process.env.SQL_EVENT_REGISTRATION_PRIMARY, false)) await connectSQL();
      const apply = explicitMigrationApply({
        writeFlag: 'EVENT_REGISTRATION_SETUP_WRITE',
        args: process.argv.slice(2),
      });
      return seedEventRegistrationMinimum({ apply, args });
    })
    .then((result) => {
      if (args.json) console.log(JSON.stringify(result, null, 2));
      else printResult(result);
      return Promise.all([mongoose.disconnect(), closeSQL()]);
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      Promise.allSettled([mongoose.disconnect(), closeSQL()]).finally(() => process.exit(1));
    });
}

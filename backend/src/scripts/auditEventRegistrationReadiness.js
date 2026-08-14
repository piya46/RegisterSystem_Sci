const mongoose = require('mongoose');
const Admin = require('../models/admin');
const Event = require('../models/event');
const Package = require('../models/Package');
const Participant = require('../models/participant');
const ParticipantField = require('../models/participantField');
const RegistrationPoint = require('../models/registrationPoint');
const SystemSetting = require('../models/SystemSetting');
const { closeSQL, connectSQL } = require('../config/sql');
const sqlEventRegistration = require('../sql/eventRegistrationRepository');
const { connectMongoForMigration } = require('../utils/mongoMigrationConnection');
const { boolEnv } = require('../utils/cloudCostGuardrail');
const { normalizeEventYear } = require('../utils/eventYear');
const { listEffectiveParticipantFields } = require('../utils/participantFieldScope');

const PUBLIC_OPEN_STATUSES = new Set(['registration_open', 'active']);
const ONSITE_OPEN_STATUSES = new Set(['registration_open', 'event_day', 'active']);
const BASIC_FIELDS = ['name', 'email', 'phone'];
const PACKAGE_ADDRESS_FIELDS = ['usr_add', 'usr_add_post'];
const EVENT_STAFF_ROLES = ['staff', 'event_manager', 'event_admin'];
const REGISTRATION_OPERATOR_ROLES = [...EVENT_STAFF_ROLES, 'kiosk'];

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

function issue(level, code, message, where, fix = '') {
  return { level, code, message, where, fix };
}

function isPast(date) {
  return date && !Number.isNaN(date.getTime()) && date < new Date();
}

function isFuture(date) {
  return date && !Number.isNaN(date.getTime()) && date > new Date();
}

function scopedFilter(event, extra = {}) {
  return { eventId: event._id, ...extra };
}

async function resolveEvent(args) {
  const eventId = args['event-id'] || process.env.EVENT_ID || process.env.CURRENT_EVENT_ID;
  const eventSlug = args['event-slug'] || args.slug || process.env.EVENT_SLUG;
  if (eventId) return Event.findById(eventId);
  if (eventSlug) return Event.findOne({ slug: String(eventSlug).trim().toLowerCase() });

  const settings = await SystemSetting.findOne().select('currentEventId currentEventYear');
  if (!settings?.currentEventId) return null;
  return Event.findById(settings.currentEventId);
}

function fieldByName(fields) {
  return new Map(fields.map((field) => [field.name, field]));
}

async function auditEventRegistrationReadiness(args = parseArgs()) {
  const items = [];
  const event = await resolveEvent(args);
  const settings = await SystemSetting.findOne()
    .select('currentEventId currentEventYear currentEventSeriesId defaultOrganizationId');

  if (!event) {
    items.push(issue(
      'fail',
      'EVENT_MISSING',
      'ยังไม่พบ Event ที่จะเปิดรับลงทะเบียน',
      '/workspace หรือ /admin/events',
      'สร้าง Organization, Event Series และ Event ก่อน จากนั้นกด Activate/ตั้ง current event'
    ));
    return { ok: false, event: null, counts: {}, items };
  }

  const eventContext = {
    eventId: event._id,
    eventYear: normalizeEventYear(event.eventYear),
    organizationId: event.organizationId,
    seriesId: event.seriesId,
    event,
  };
  const config = event.config || {};
  const features = config.enabledFeatures || {};
  const useSqlRegistrationPrimary = sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(eventContext);

  if (!event.organizationId) {
    items.push(issue('fail', 'EVENT_ORGANIZATION_MISSING', 'Event ยังไม่มี organizationId', `/admin/events/${event._id}/settings`, 'เลือก/สร้าง Organization ของงานนี้'));
  }
  if (!event.seriesId) {
    items.push(issue('fail', 'EVENT_SERIES_MISSING', 'Event ยังไม่มี seriesId', `/admin/events/${event._id}/settings`, 'เลือก/สร้าง Event Series ของงานนี้'));
  }
  if (!event.slug) {
    items.push(issue('fail', 'EVENT_SLUG_MISSING', 'Event ยังไม่มี slug สำหรับ public URL', `/admin/events/${event._id}/settings`, 'กำหนด slug เช่น alumni-2026'));
  }
  if (String(settings?.currentEventId || '') !== String(event._id)) {
    items.push(issue(
      'warn',
      'CURRENT_EVENT_DIFFERENT',
      'SystemSetting.currentEventId ไม่ตรงกับ Event นี้',
      '/workspace หรือ /admin/events',
      'ถ้าต้องการให้ legacy/current public route ใช้งาน Event นี้ ให้กด Activate Event นี้'
    ));
  }

  if (config.maintenanceMode === true) {
    items.push(issue('fail', 'MAINTENANCE_ON', 'Event เปิด maintenanceMode อยู่', `/admin/events/${event._id}/settings`, 'ปิด maintenanceMode ก่อนเปิดรับลงทะเบียน'));
  }
  if (features.registration === false || config.enableRegister === false) {
    items.push(issue('fail', 'REGISTRATION_DISABLED', 'Feature registration หรือ enableRegister ถูกปิดอยู่', `/admin/events/${event._id}/settings`, 'เปิด Registration feature และ enableRegister'));
  }
  if (!PUBLIC_OPEN_STATUSES.has(event.status)) {
    items.push(issue('fail', 'PUBLIC_REGISTRATION_STATUS_CLOSED', `Public registration ใช้ไม่ได้เมื่อ status=${event.status}`, `/admin/events/${event._id}/settings`, 'เปลี่ยน status เป็น registration_open เมื่อต้องเปิดลงทะเบียนล่วงหน้า'));
  }
  if (!ONSITE_OPEN_STATUSES.has(event.status)) {
    items.push(issue('warn', 'ONSITE_STATUS_CLOSED', `Onsite/Kiosk จะใช้ไม่ได้เมื่อ status=${event.status}`, `/admin/events/${event._id}/settings`, 'วันงานใช้ status event_day หรือ registration_open/active'));
  }

  const preRegStart = config.preRegStartDate ? new Date(config.preRegStartDate) : null;
  const preRegEnd = config.preRegEndDate ? new Date(config.preRegEndDate) : null;
  const kioskStart = config.kioskStartDate ? new Date(config.kioskStartDate) : null;
  const kioskEnd = config.kioskEndDate ? new Date(config.kioskEndDate) : null;
  if (isFuture(preRegStart)) {
    items.push(issue('warn', 'PREREG_NOT_STARTED', 'ยังไม่ถึง preRegStartDate', `/admin/events/${event._id}/settings`, 'ปรับเวลาเปิดลงทะเบียนล่วงหน้าหรือรอถึงเวลา'));
  }
  if (isPast(preRegEnd)) {
    items.push(issue('fail', 'PREREG_ENDED', 'preRegEndDate หมดเวลาแล้ว', `/admin/events/${event._id}/settings`, 'ขยายเวลาหรือปิด public registration'));
  }
  if (isFuture(kioskStart)) {
    items.push(issue('warn', 'KIOSK_NOT_STARTED', 'ยังไม่ถึง kioskStartDate', `/admin/events/${event._id}/settings`, 'ปรับเวลาเปิด onsite/kiosk หรือรอถึงเวลา'));
  }
  if (isPast(kioskEnd)) {
    items.push(issue('fail', 'KIOSK_ENDED', 'kioskEndDate หมดเวลาแล้ว', `/admin/events/${event._id}/settings`, 'ขยายเวลา onsite/kiosk window'));
  }

  const [effectiveFields, directFields, legacyFieldCount] = await Promise.all([
    listEffectiveParticipantFields(eventContext, { enabledOnly: true }),
    useSqlRegistrationPrimary
      ? sqlEventRegistration.listParticipantFields(eventContext, { enabledOnly: false })
      : ParticipantField.find(scopedFilter(event)).select('_id').lean(),
    useSqlRegistrationPrimary
      ? Promise.resolve(0)
      : ParticipantField.countDocuments({ $or: [{ eventId: null }, { eventId: { $exists: false } }] }),
  ]);
  const eventFieldCount = directFields.length;
  const fieldsByName = fieldByName(effectiveFields);
  BASIC_FIELDS.forEach((name) => {
    const field = fieldsByName.get(name);
    if (!field) {
      items.push(issue('fail', `FIELD_${name.toUpperCase()}_MISSING`, `ยังไม่มี field ${name} ที่เปิดใช้งาน`, `/admin/events/${event._id}/registration-fields`, `เพิ่ม field ${name} และเปิด enabled`));
    } else if (field.required !== true) {
      items.push(issue('warn', `FIELD_${name.toUpperCase()}_NOT_REQUIRED`, `field ${name} ยังไม่ได้ตั้ง required`, `/admin/events/${event._id}/registration-fields`, `ตั้ง required=true สำหรับ ${name}`));
    }
  });
  if (eventFieldCount === 0 && legacyFieldCount > 0) {
    items.push(issue(
      'warn',
      'FIELDS_INHERITED_FROM_LEGACY',
      'Event นี้ยังใช้ participant fields แบบ legacy/global fallback',
      `/admin/events/${event._id}/registration-fields`,
      'ควร clone/create fields ให้ผูก eventId นี้ หรือรัน npm run migrate:participant-fields หลังตั้ง current event ถูกต้อง'
    ));
  }
  if (features.packages === true) {
    PACKAGE_ADDRESS_FIELDS.forEach((name) => {
      if (!fieldsByName.get(name)) {
        items.push(issue('fail', `FIELD_${name.toUpperCase()}_MISSING`, `เปิด packages แล้วแต่ยังไม่มี field ${name}`, `/admin/events/${event._id}/registration-fields`, `เพิ่ม field ${name} สำหรับที่อยู่จัดส่ง/package`));
      }
    });
  }

  const [enabledPoints, legacyPointCount, eventOperators, activePackages, legacyParticipantPointCount] = await Promise.all([
    useSqlRegistrationPrimary
      ? sqlEventRegistration.listRegistrationPoints(eventContext, { enabledOnly: true })
      : RegistrationPoint.find(scopedFilter(event, { enabled: true })).select('name type kioskPolicy allowedStaff deviceIds').lean(),
    useSqlRegistrationPrimary
      ? Promise.resolve(0)
      : RegistrationPoint.countDocuments({ enabled: true, $or: [{ eventId: null }, { eventId: { $exists: false } }] }),
    Admin.find({
      role: { $in: REGISTRATION_OPERATOR_ROLES },
      eventIds: event._id,
    }).select('_id role registrationPoints').lean(),
    Package.countDocuments(scopedFilter(event, { isActive: true, deletedAt: null })),
    useSqlRegistrationPrimary
      ? Promise.resolve(0)
      : Participant.countDocuments(scopedFilter(event, {
        registeredPointId: null,
        registeredPoint: { $nin: ['', 'Online', null] },
        isDeleted: false,
      })),
  ]);

  if (enabledPoints.length === 0) {
    items.push(issue(
      'fail',
      'REGISTRATION_POINT_MISSING',
      'ยังไม่มี Registration Point ที่ enabled และผูกกับ Event นี้',
      `/admin/events/${event._id}/registration-points`,
      legacyPointCount > 0
        ? 'สร้าง point ใหม่ใน Event นี้ หรือรัน npm run migrate:registration-points หลังตั้ง current event ถูกต้อง'
        : 'เพิ่ม point เช่น Main Gate / Staff Desk แล้วเปิด enabled'
    ));
  }
  const kioskReadyPoints = enabledPoints.filter((point) => point.type === 'kiosk' || point.kioskPolicy?.allowKioskMode === true);
  if (kioskReadyPoints.length === 0) {
    items.push(issue('warn', 'KIOSK_POINT_MISSING', 'ยังไม่มี point ที่เปิด Kiosk mode', `/admin/events/${event._id}/registration-points`, 'ตั้ง type=kiosk หรือ kioskPolicy.allowKioskMode=true ถ้าจะใช้ kiosk'));
  }
  const eventStaffCount = eventOperators.filter((operator) => (
    (Array.isArray(operator.role) ? operator.role : []).some((role) => EVENT_STAFF_ROLES.includes(role))
  )).length;
  const eventOperatorCount = eventOperators.length;
  const operatorAssignedPointIds = new Set();
  eventOperators.forEach((operator) => {
    (Array.isArray(operator.registrationPoints) ? operator.registrationPoints : [])
      .forEach((pointId) => operatorAssignedPointIds.add(String(pointId)));
  });
  const staffLinkedPointCount = enabledPoints.filter((point) => (
    (Array.isArray(point.allowedStaff) && point.allowedStaff.length > 0)
    || operatorAssignedPointIds.has(String(point._id))
  )).length;
  if (eventOperatorCount === 0) {
    items.push(issue('warn', 'EVENT_OPERATOR_MISSING', 'ยังไม่มี staff/kiosk/event manager ที่ผูก eventIds กับ Event นี้', '/admin', 'เพิ่ม operator แล้วกำหนด eventIds ให้รวม Event นี้'));
  }
  if (enabledPoints.length > 0 && staffLinkedPointCount === 0) {
    items.push(issue('warn', 'POINT_OPERATOR_MISSING', 'Registration Point ยังไม่ได้กำหนด allowedStaff หรือ operator.registrationPoints', `/admin/events/${event._id}/registration-points`, 'เพิ่ม allowedStaff หรือกำหนด registrationPoints ในหน้า Admin ให้ staff/kiosk'));
  }
  if (features.packages === true && activePackages === 0) {
    items.push(issue('fail', 'PACKAGE_MISSING', 'เปิด packages แล้วแต่ยังไม่มี Package active ใน Event นี้', `/admin/events/${event._id}/packages`, 'เพิ่ม package active หรือปิด feature packages'));
  }
  if (legacyParticipantPointCount > 0) {
    items.push(issue('warn', 'PARTICIPANT_POINT_BACKFILL_PENDING', 'มี participant เก่าที่ registeredPointId ยังว่าง', 'backend migration', 'รัน npm run migrate:participant-points เพื่อ backfill point id/name'));
  }

  const counts = {
    effectiveFields: effectiveFields.length,
    eventFields: eventFieldCount,
    legacyFields: legacyFieldCount,
    enabledRegistrationPoints: enabledPoints.length,
    legacyEnabledRegistrationPoints: legacyPointCount,
    kioskReadyPoints: kioskReadyPoints.length,
    eventStaff: eventStaffCount,
    eventOperators: eventOperatorCount,
    staffLinkedRegistrationPoints: staffLinkedPointCount,
    activePackages,
    legacyParticipantPointCount,
  };

  return {
    ok: !items.some((item) => item.level === 'fail'),
    event: {
      id: String(event._id),
      name: event.name,
      slug: event.slug,
      eventYear: normalizeEventYear(event.eventYear),
      status: event.status,
    },
    counts,
    items,
  };
}

function printPlain(result) {
  console.log('Event Registration Readiness');
  if (result.event) {
    console.log(`Event: ${result.event.name} / ${result.event.eventYear} / ${result.event.id}`);
    console.log(`Slug: ${result.event.slug || '-'}`);
    console.log(`Status: ${result.event.status}`);
  }
  console.log(`Result: ${result.ok ? 'READY' : 'NOT READY'}`);
  console.log('');
  console.log('Counts:');
  Object.entries(result.counts || {}).forEach(([key, value]) => console.log(`- ${key}: ${value}`));
  console.log('');
  if (!result.items.length) {
    console.log('No missing setup detected.');
    return;
  }
  console.log('Action Items:');
  result.items.forEach((item) => {
    console.log(`- [${item.level.toUpperCase()}] ${item.code}: ${item.message}`);
    console.log(`  Where: ${item.where}`);
    if (item.fix) console.log(`  Fix: ${item.fix}`);
  });
}

module.exports = auditEventRegistrationReadiness;

if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const args = parseArgs();
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');

  const disconnectAll = async (code) => {
    await Promise.allSettled([
      mongoose.disconnect(),
      closeSQL(),
    ]);
    process.exit(code);
  };

  connectMongoForMigration(mongoUri)
    .then(async () => {
      if (boolEnv('SQL_EVENT_REGISTRATION_PRIMARY', false)) await connectSQL();
    })
    .then(() => auditEventRegistrationReadiness(args))
    .then((result) => {
      if (args.json) console.log(JSON.stringify(result, null, 2));
      else printPlain(result);
      return disconnectAll(result.ok ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      disconnectAll(1);
    });
}

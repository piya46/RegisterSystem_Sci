const SystemSetting = require('../models/SystemSetting');
const mongoose = require('mongoose');
const Event = require('../models/event');
const { isPublicEventStatus, isRegistrationOpenStatus } = require('./eventLayout');
const { canAccessEvent } = require('./permissions');

const ONSITE_REGISTRATION_OPEN_STATUSES = new Set(['registration_open', 'event_day', 'active']);

function defaultEventYear() {
  return String(new Date().getFullYear());
}

function normalizeEventYear(value) {
  const normalized = String(value || '').trim();
  return normalized || defaultEventYear();
}

function isAllEventYears(value) {
  return ['all', '*'].includes(String(value || '').trim().toLowerCase());
}

async function getCurrentEventYear() {
  const setting = await SystemSetting.findOne().select('currentEventYear');
  return normalizeEventYear(setting?.currentEventYear);
}

async function getCurrentEventContext() {
  const setting = await SystemSetting.findOne()
    .select('currentEventYear currentEventId currentEventSeriesId defaultOrganizationId eventLinkingMode');
  return {
    eventYear: normalizeEventYear(setting?.currentEventYear),
    eventId: setting?.currentEventId || null,
    seriesId: setting?.currentEventSeriesId || null,
    organizationId: setting?.defaultOrganizationId || null,
    linkingMode: setting?.eventLinkingMode || 'series-linked',
  };
}

function identityError(message = 'ข้อมูลกิจกรรมในคำขอไม่สอดคล้องกัน') {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function uniqueIdentityValue(values, { normalize = (value) => String(value).trim() } = {}) {
  const normalized = values
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(normalize)
    .filter(Boolean);
  const unique = [...new Set(normalized)];
  if (unique.length > 1) throw identityError();
  return unique[0] || null;
}

function requestedEventIdentity(req = {}) {
  return {
    eventId: uniqueIdentityValue([
      req.params?.eventId,
      req.query?.eventId,
      req.body?.eventId,
    ]),
    eventSlug: uniqueIdentityValue([
      req.params?.eventSlug,
      req.params?.slug,
      req.query?.eventSlug,
      req.body?.eventSlug,
    ], { normalize: (value) => String(value).trim().toLowerCase() }),
    eventYear: uniqueIdentityValue([
      req.params?.eventYear,
      req.query?.eventYear,
      req.body?.eventYear,
    ]),
  };
}

function assertEventMatchesRequestedIdentity(event, identity = {}) {
  if (!event) return;
  if (identity.eventId && String(event._id) !== String(identity.eventId)) throw identityError();
  if (identity.eventSlug && String(event.slug || '').trim().toLowerCase() !== identity.eventSlug) throw identityError();
  if (identity.eventYear && normalizeEventYear(event.eventYear) !== normalizeEventYear(identity.eventYear)) {
    throw identityError('ปีของกิจกรรมไม่ตรงกับกิจกรรมที่ระบุ');
  }
}

function assertEventRegistrationOpen(event, now = new Date()) {
  const config = event?.config || {};
  const startsAt = config.preRegStartDate ? new Date(config.preRegStartDate) : null;
  const endsAt = config.preRegEndDate ? new Date(config.preRegEndDate) : null;
  if (config.maintenanceMode === true) {
    const error = new Error('ระบบกำลังปิดปรับปรุงชั่วคราว');
    error.statusCode = 403;
    throw error;
  }
  if (config.enabledFeatures?.registration === false || config.enableRegister === false || !isRegistrationOpenStatus(event?.status)) {
    const error = new Error('กิจกรรมนี้ยังไม่เปิดรับลงทะเบียน');
    error.statusCode = 403;
    throw error;
  }
  if (startsAt && now < startsAt) {
    const error = new Error('ยังไม่ถึงเวลาเปิดรับลงทะเบียน');
    error.statusCode = 403;
    throw error;
  }
  if (endsAt && now > endsAt) {
    const error = new Error('หมดเวลาลงทะเบียนล่วงหน้าแล้ว');
    error.statusCode = 403;
    throw error;
  }
}

function assertEventOnsiteRegistrationOpen(event, now = new Date()) {
  const config = event?.config || {};
  const startsAt = config.kioskStartDate ? new Date(config.kioskStartDate) : null;
  const endsAt = config.kioskEndDate ? new Date(config.kioskEndDate) : null;
  if (!event) {
    const error = new Error('ไม่พบกิจกรรมสำหรับลงทะเบียนหน้างาน');
    error.statusCode = 404;
    throw error;
  }
  if (config.maintenanceMode === true) {
    const error = new Error('ระบบกำลังปิดปรับปรุงชั่วคราว');
    error.statusCode = 403;
    throw error;
  }
  if (config.enabledFeatures?.registration === false || config.enableRegister === false) {
    const error = new Error('กิจกรรมนี้ปิดรับลงทะเบียน');
    error.statusCode = 403;
    throw error;
  }
  if (!ONSITE_REGISTRATION_OPEN_STATUSES.has(event.status)) {
    const error = new Error('กิจกรรมนี้ยังไม่เปิดระบบลงทะเบียนหน้างาน');
    error.statusCode = 403;
    throw error;
  }
  if (startsAt && !Number.isNaN(startsAt.getTime()) && now < startsAt) {
    const error = new Error(`ยังไม่ถึงเวลาเปิดระบบลงทะเบียนหน้างาน (${startsAt.toLocaleString('th-TH')})`);
    error.statusCode = 403;
    throw error;
  }
  if (endsAt && !Number.isNaN(endsAt.getTime()) && now > endsAt) {
    const error = new Error('หมดเวลาลงทะเบียนหน้างานแล้ว');
    error.statusCode = 403;
    throw error;
  }
}

async function getEventContextFromRequest(req, options = {}) {
  const { requireAccess = true, requireEventIdentity = false, requirePublic = false, requireRegistrationOpen = false } = options;
  const identity = requestedEventIdentity(req);
  const { eventId, eventSlug, eventYear: requestedEventYear } = identity;
  const hasRequestedEvent = Boolean(eventId || eventSlug);
  let event = null;

  if (eventId) {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      const error = new Error('รหัสกิจกรรมไม่ถูกต้อง');
      error.statusCode = 400;
      throw error;
    }
    event = await Event.findById(eventId);
  } else if (eventSlug) {
    event = await Event.findOne({ slug: String(eventSlug).trim().toLowerCase() });
  }

  if (event) assertEventMatchesRequestedIdentity(event, identity);

  if (!event) {
    if (hasRequestedEvent) {
      const error = new Error('ไม่พบกิจกรรมที่ระบุ');
      error.statusCode = 404;
      throw error;
    }
    if (requireEventIdentity) {
      const error = new Error('กรุณาเลือกกิจกรรมก่อนใช้งานหน้านี้');
      error.statusCode = 400;
      throw error;
    }
    if (requestedEventYear) {
      return {
        eventYear: normalizeEventYear(requestedEventYear),
        eventId: null,
        seriesId: null,
        organizationId: null,
        linkingMode: 'series-linked',
      };
    }
    return getCurrentEventContext();
  }

  if (req.user && requireAccess && !canAccessEvent(req.user, event)) {
    const error = new Error('คุณไม่มีสิทธิ์เข้าถึงกิจกรรมนี้');
    error.statusCode = 403;
    throw error;
  }

  if (requirePublic && !isPublicEventStatus(event.status)) {
    const error = new Error('กิจกรรมนี้ยังไม่เปิดเผยแพร่');
    error.statusCode = 404;
    throw error;
  }

  if (requireRegistrationOpen) assertEventRegistrationOpen(event);

  return {
    eventYear: normalizeEventYear(event.eventYear),
    eventId: event._id,
    seriesId: event.seriesId,
    organizationId: event.organizationId,
    linkingMode: event.linkingMode || 'series-linked',
    event,
  };
}

function eventYearFromRequest(req) {
  const value = requestedEventIdentity(req).eventYear;
  if (isAllEventYears(value)) return null;
  return value;
}

async function eventYearOrCurrentFromRequest(req) {
  const requested = eventYearFromRequest(req);
  if (requested) return normalizeEventYear(requested);
  return getCurrentEventYear();
}

function applyEventYearFilter(filter, eventYear) {
  if (isAllEventYears(eventYear)) return filter;
  const normalized = eventYear ? normalizeEventYear(eventYear) : null;
  if (normalized) filter.eventYear = normalized;
  return filter;
}

async function eventScopeFromRequest(req, baseFilter = {}, options = {}) {
  const { requireAccess = true, requireEventIdentity = false, requirePublic = false } = options;
  const identity = requestedEventIdentity(req);
  const { eventId, eventSlug, eventYear: requestedEventYear } = identity;
  let event = null;

  if (eventId) {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      const error = new Error('รหัสกิจกรรมไม่ถูกต้อง');
      error.statusCode = 400;
      throw error;
    }
    event = await Event.findById(eventId).select('slug eventYear status organizationId seriesId config');
  } else if (eventSlug) {
    event = await Event.findOne({ slug: String(eventSlug).trim().toLowerCase() }).select('slug eventYear status organizationId seriesId config');
  }

  if (eventId || eventSlug) {
    if (!event) {
      const error = new Error('ไม่พบกิจกรรมที่ระบุ');
      error.statusCode = 404;
      throw error;
    }
    assertEventMatchesRequestedIdentity(event, identity);
    if (req.user && requireAccess && !canAccessEvent(req.user, event)) {
      const error = new Error('คุณไม่มีสิทธิ์เข้าถึงกิจกรรมนี้');
      error.statusCode = 403;
      throw error;
    }
    if (requirePublic && !isPublicEventStatus(event.status)) {
      const error = new Error('กิจกรรมนี้ยังไม่เปิดเผยแพร่');
      error.statusCode = 404;
      throw error;
    }
    return {
      filter: { ...baseFilter, eventId: event._id },
      eventId: event._id,
      eventYear: normalizeEventYear(event.eventYear),
      event,
    };
  }

  if (requireEventIdentity) {
    const error = new Error('กรุณาเลือกกิจกรรมก่อนใช้งานหน้านี้');
    error.statusCode = 400;
    throw error;
  }

  const eventYear = requestedEventYear
    ? normalizeEventYear(requestedEventYear)
    : await eventYearOrCurrentFromRequest(req);
  return {
    filter: applyEventYearFilter({ ...baseFilter }, eventYear),
    eventId: null,
    eventYear,
  };
}

module.exports = {
  applyEventYearFilter,
  assertEventMatchesRequestedIdentity,
  assertEventOnsiteRegistrationOpen,
  assertEventRegistrationOpen,
  defaultEventYear,
  eventScopeFromRequest,
  eventYearFromRequest,
  eventYearOrCurrentFromRequest,
  getCurrentEventContext,
  getCurrentEventYear,
  getEventContextFromRequest,
  normalizeEventYear,
  requestedEventIdentity,
};

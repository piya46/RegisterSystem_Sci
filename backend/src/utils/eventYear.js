const SystemSetting = require('../models/SystemSetting');
const mongoose = require('mongoose');
const Event = require('../models/event');
const { isPublicEventStatus, isRegistrationOpenStatus } = require('./eventLayout');

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

function requestedEventIdentity(req) {
  return {
    eventId: req.query?.eventId || req.body?.eventId || req.params?.eventId || null,
    eventSlug: req.query?.eventSlug || req.body?.eventSlug || req.params?.eventSlug || req.params?.slug || null,
  };
}

async function getEventContextFromRequest(req, options = {}) {
  const { requirePublic = false, requireRegistrationOpen = false } = options;
  const { eventId, eventSlug } = requestedEventIdentity(req);
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

  if (!event) {
    if (hasRequestedEvent) {
      const error = new Error('ไม่พบกิจกรรมที่ระบุ');
      error.statusCode = 404;
      throw error;
    }
    return getCurrentEventContext();
  }

  if (requirePublic && !isPublicEventStatus(event.status)) {
    const error = new Error('กิจกรรมนี้ยังไม่เปิดเผยแพร่');
    error.statusCode = 404;
    throw error;
  }

  if (requireRegistrationOpen) {
    const now = new Date();
    const config = event.config || {};
    const startsAt = config.preRegStartDate ? new Date(config.preRegStartDate) : null;
    const endsAt = config.preRegEndDate ? new Date(config.preRegEndDate) : null;
    if (config.maintenanceMode === true) {
      const error = new Error('ระบบกำลังปิดปรับปรุงชั่วคราว');
      error.statusCode = 403;
      throw error;
    }
    if (config.enableRegister === false || !isRegistrationOpenStatus(event.status)) {
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
  const value = req.query?.eventYear || req.body?.eventYear || null;
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
  const { requirePublic = false } = options;
  const { eventId } = requestedEventIdentity(req);
  if (eventId) {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      const error = new Error('รหัสกิจกรรมไม่ถูกต้อง');
      error.statusCode = 400;
      throw error;
    }
    const event = await Event.findById(eventId).select('eventYear status');
    if (!event) {
      const error = new Error('ไม่พบกิจกรรมที่ระบุ');
      error.statusCode = 404;
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
    };
  }

  const eventYear = await eventYearOrCurrentFromRequest(req);
  return {
    filter: applyEventYearFilter({ ...baseFilter }, eventYear),
    eventId: null,
    eventYear,
  };
}

module.exports = {
  applyEventYearFilter,
  defaultEventYear,
  eventScopeFromRequest,
  eventYearFromRequest,
  eventYearOrCurrentFromRequest,
  getCurrentEventContext,
  getCurrentEventYear,
  getEventContextFromRequest,
  normalizeEventYear,
};

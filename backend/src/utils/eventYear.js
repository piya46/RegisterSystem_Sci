const SystemSetting = require('../models/SystemSetting');

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

module.exports = {
  applyEventYearFilter,
  defaultEventYear,
  eventYearFromRequest,
  eventYearOrCurrentFromRequest,
  getCurrentEventContext,
  getCurrentEventYear,
  normalizeEventYear,
};

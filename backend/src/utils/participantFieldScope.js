const ParticipantField = require('../models/participantField');
const { normalizeEventYear } = require('./eventYear');
const {
  listParticipantFields,
  sqlEventRegistrationPrimaryEnabled,
} = require('../sql/eventRegistrationRepository');

function eventRefsFromContext(context = {}) {
  return {
    organizationId: context.organizationId || null,
    seriesId: context.seriesId || null,
    eventId: context.eventId || null,
    eventYear: normalizeEventYear(context.eventYear || ''),
  };
}

function legacyFieldClause() {
  return {
    $or: [
      { eventId: null },
      { eventId: { $exists: false } },
    ],
  };
}

function scopedFieldFilter(context, { enabledOnly = false, includeLegacy = true } = {}) {
  const base = {};
  if (enabledOnly) base.enabled = true;

  if (context?.eventId) {
    const clauses = [{ eventId: context.eventId }];
    if (includeLegacy) clauses.push(...legacyFieldClause().$or);
    return { ...base, $or: clauses };
  }

  if (context?.eventYear) {
    const clauses = [{ eventYear: normalizeEventYear(context.eventYear) }];
    if (includeLegacy) clauses.push(...legacyFieldClause().$or);
    return { ...base, $or: clauses };
  }

  return { ...base, ...legacyFieldClause() };
}

function isScopedToContext(field, context) {
  if (!context) return false;
  if (context.eventId && field.eventId) return String(field.eventId) === String(context.eventId);
  if (context.eventYear && field.eventYear) return normalizeEventYear(field.eventYear) === normalizeEventYear(context.eventYear);
  return false;
}

function mergeEffectiveFields(fields, context) {
  const byName = new Map();
  const hasScope = Boolean(context?.eventId || context?.eventYear);
  fields.forEach((field) => {
    const key = field.name;
    if (!key) return;
    const current = byName.get(key);
    const scoped = isScopedToContext(field, context);
    if (!current || scoped || !isScopedToContext(current, context)) {
      byName.set(key, {
        ...field,
        inherited: hasScope ? !scoped : false,
      });
    }
  });
  return [...byName.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

async function listEffectiveParticipantFields(context, { enabledOnly = false } = {}) {
  if (sqlEventRegistrationPrimaryEnabled(context)) {
    return listParticipantFields(context, { enabledOnly });
  }
  const fields = await ParticipantField.find(scopedFieldFilter(context, { enabledOnly: false, includeLegacy: true }))
    .sort({ order: 1, createdAt: 1 })
    .lean();
  const merged = mergeEffectiveFields(fields, context);
  return enabledOnly ? merged.filter((field) => field.enabled === true) : merged;
}

module.exports = {
  eventRefsFromContext,
  listEffectiveParticipantFields,
  scopedFieldFilter,
};

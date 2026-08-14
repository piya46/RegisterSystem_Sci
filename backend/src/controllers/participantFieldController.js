const ParticipantField = require('../models/participantField');
const { serverError, pickAllowed } = require('../utils/httpResponses');
const { getEventContextFromRequest } = require('../utils/eventYear');
const { isAdminLike } = require('../utils/permissions');
const {
  eventRefsFromContext,
  listEffectiveParticipantFields,
} = require('../utils/participantFieldScope');
const sqlEventRegistration = require('../sql/eventRegistrationRepository');

const FIELD_FIELDS = ['name', 'label', 'type', 'required', 'options', 'order', 'enabled'];

function hasRequestedEvent(req) {
  return Boolean(req.query?.eventId || req.query?.eventSlug || req.body?.eventId || req.body?.eventSlug);
}

async function contextFromRequest(req, { requireAccess = true } = {}) {
  if (!hasRequestedEvent(req)) return null;
  return getEventContextFromRequest(req, {
    requireEventIdentity: false,
    requireAccess,
    requirePublic: !req.user,
  });
}

function sanitizeFieldPayload(body) {
  const payload = pickAllowed(body, FIELD_FIELDS);
  if (payload.name !== undefined) payload.name = String(payload.name || '').trim();
  if (payload.label !== undefined) payload.label = String(payload.label || '').trim();
  if (payload.options !== undefined) {
    payload.options = (Array.isArray(payload.options) ? payload.options : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
  return payload;
}

function fieldBelongsToContext(field, context) {
  if (!field) return false;
  if (!context?.eventId) return !field.eventId;
  return Boolean(field.eventId) && String(field.eventId) === String(context.eventId);
}

exports.createField = async (req, res) => {
  try {
    const context = await contextFromRequest(req, { requireAccess: true });
    if (!context && !isAdminLike(req.user)) {
      return res.status(403).json({ error: 'Global participant fields require admin access' });
    }
    const eventRefs = context ? eventRefsFromContext(context) : {};
    const payload = sanitizeFieldPayload(req.body);
    if (!payload.name || !payload.label) return res.status(400).json({ error: 'Name and label are required' });

    if (sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(context)) {
      const field = await sqlEventRegistration.createParticipantField(context, payload);
      return res.json(field);
    }

    const duplicateFilter = eventRefs.eventId
      ? { eventId: eventRefs.eventId, name: payload.name }
      : { $or: [{ eventId: null }, { eventId: { $exists: false } }], name: payload.name };
    const exists = await ParticipantField.findOne(duplicateFilter).lean();
    if (exists) return res.status(400).json({ error: 'Field name exists for this event' });

    const field = await ParticipantField.create({ ...eventRefs, ...payload });
    res.json(field);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Field name exists for this event' });
    serverError(res, err);
  }
};

exports.listFields = async (req, res) => {
  try {
    const context = await contextFromRequest(req, { requireAccess: Boolean(req.user) });
    const fields = await listEffectiveParticipantFields(context, { enabledOnly: req.query.enabledOnly === 'true' });
    res.json(fields);
  } catch (err) {
    serverError(res, err);
  }
};

exports.updateField = async (req, res) => {
  try {
    const context = await contextFromRequest(req, { requireAccess: true });
    if (!context && !isAdminLike(req.user)) {
      return res.status(403).json({ error: 'Global participant fields require admin access' });
    }
    if (sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(context)) {
      const field = await sqlEventRegistration.updateParticipantField(req.params.id, context, sanitizeFieldPayload(req.body));
      if (!field) return res.status(404).json({ error: 'Field not found' });
      return res.json(field);
    }
    const field = await ParticipantField.findById(req.params.id);
    if (!field) return res.status(404).json({ error: 'Field not found' });
    if (!fieldBelongsToContext(field, context)) {
      return res.status(403).json({ error: 'Participant field does not belong to this event' });
    }

    const updates = sanitizeFieldPayload(req.body);
    if (updates.name) {
      const duplicateFilter = field.eventId
        ? { _id: { $ne: field._id }, eventId: field.eventId, name: updates.name }
        : { _id: { $ne: field._id }, $or: [{ eventId: null }, { eventId: { $exists: false } }], name: updates.name };
      const exists = await ParticipantField.findOne(duplicateFilter).lean();
      if (exists) return res.status(400).json({ error: 'Field name exists for this event' });
    }

    Object.assign(field, updates);
    await field.save();
    res.json(field);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Field name exists for this event' });
    serverError(res, err);
  }
};

exports.deleteField = async (req, res) => {
  try {
    const context = await contextFromRequest(req, { requireAccess: true });
    if (!context && !isAdminLike(req.user)) {
      return res.status(403).json({ error: 'Global participant fields require admin access' });
    }
    if (sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(context)) {
      const field = await sqlEventRegistration.deleteParticipantField(req.params.id, context);
      if (!field) return res.status(404).json({ error: 'Field not found' });
      return res.json({ message: 'Field disabled', field });
    }
    const field = await ParticipantField.findById(req.params.id);
    if (!field) return res.status(404).json({ error: 'Field not found' });
    if (!fieldBelongsToContext(field, context)) {
      return res.status(403).json({ error: 'Participant field does not belong to this event' });
    }
    await field.deleteOne();
    res.json({ message: 'Field deleted' });
  } catch (err) {
    serverError(res, err);
  }
};

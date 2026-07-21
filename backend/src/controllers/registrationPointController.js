const RegistrationPoint = require('../models/registrationPoint');
const auditLog = require('../helpers/auditLog');
const isAdmin = require('../helpers/isAdmin');
const { serverError } = require('../utils/httpResponses');
const { getEventContextFromRequest, normalizeEventYear } = require('../utils/eventYear');

const DEFAULT_KIOSK_POLICY = {
  allowStaffMode: true,
  allowKioskMode: false,
  requireCamera: true,
  requireFullscreen: false,
  idleTimeoutSeconds: 120,
  successResetSeconds: 8,
};

function hasRequestedEvent(req) {
  return Boolean(req.query?.eventId || req.query?.eventSlug || req.body?.eventId || req.body?.eventSlug);
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeIdList(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function sanitizePolicy(policy = {}) {
  return {
    allowStaffMode: policy.allowStaffMode !== undefined ? policy.allowStaffMode === true : DEFAULT_KIOSK_POLICY.allowStaffMode,
    allowKioskMode: policy.allowKioskMode !== undefined ? policy.allowKioskMode === true : DEFAULT_KIOSK_POLICY.allowKioskMode,
    requireCamera: policy.requireCamera !== undefined ? policy.requireCamera === true : DEFAULT_KIOSK_POLICY.requireCamera,
    requireFullscreen: policy.requireFullscreen === true,
    idleTimeoutSeconds: clampNumber(policy.idleTimeoutSeconds, 15, 3600, DEFAULT_KIOSK_POLICY.idleTimeoutSeconds),
    successResetSeconds: clampNumber(policy.successResetSeconds, 1, 120, DEFAULT_KIOSK_POLICY.successResetSeconds),
  };
}

function eventRefsFromContext(context = {}) {
  return {
    organizationId: context.organizationId || null,
    seriesId: context.seriesId || null,
    eventId: context.eventId || null,
    eventYear: normalizeEventYear(context.eventYear || ''),
  };
}

function scopedPointFilter(context, { enabledOnly = false, includeLegacy = true } = {}) {
  const base = {};
  if (enabledOnly) base.enabled = true;

  if (context?.eventId) {
    const eventClauses = [{ eventId: context.eventId }];
    if (includeLegacy) {
      eventClauses.push({ eventId: null }, { eventId: { $exists: false } });
    }
    return { ...base, $or: eventClauses };
  }

  if (context?.eventYear) {
    const yearClauses = [{ eventYear: normalizeEventYear(context.eventYear) }];
    if (includeLegacy) {
      yearClauses.push({ eventYear: '' }, { eventYear: { $exists: false } });
    }
    return { ...base, $or: yearClauses };
  }

  if (includeLegacy) return { ...base, $or: [{ eventId: null }, { eventId: { $exists: false } }] };
  return base;
}

async function contextFromRequest(req, { requireEventIdentity = false, requireAccess = true } = {}) {
  if (!requireEventIdentity && !hasRequestedEvent(req)) return null;
  return getEventContextFromRequest(req, { requireEventIdentity, requireAccess });
}

function exposePublicPoint(point) {
  return {
    _id: point._id,
    id: point._id,
    name: point.name,
    description: point.description || '',
    type: point.type,
    enabled: point.enabled,
    eventId: point.eventId || null,
    eventYear: point.eventYear || '',
    kioskPolicy: point.kioskPolicy || DEFAULT_KIOSK_POLICY,
    requiresDeviceBinding: Array.isArray(point.deviceIds) && point.deviceIds.length > 0,
  };
}

function pointBelongsToContext(point, context) {
  if (!context?.eventId || !point?.eventId) return true;
  return String(point.eventId) === String(context.eventId);
}

exports.listAll = async (req, res) => {
  try {
    const context = await contextFromRequest(req, { requireEventIdentity: false, requireAccess: true });
    const filter = context ? scopedPointFilter(context, { includeLegacy: true }) : {};
    let points = await RegistrationPoint.find(filter)
      .populate('eventId', 'name eventYear')
      .sort({ eventYear: -1, name: 1 })
      .lean();

    const roles = Array.isArray(req.user?.role) ? req.user.role : [];
    if (!isAdmin(req.user) && roles.includes('staff')) {
      const allowed = new Set(normalizeIdList(req.user.registrationPoints));
      points = points.filter((point) => allowed.has(String(point._id)));
    }

    res.json(points);
  } catch (err) {
    serverError(res, err);
  }
};

exports.listEnabled = async (req, res) => {
  try {
    const context = await contextFromRequest(req, { requireEventIdentity: false, requireAccess: false });
    const filter = context
      ? scopedPointFilter(context, { enabledOnly: true, includeLegacy: true })
      : scopedPointFilter(null, { enabledOnly: true, includeLegacy: true });

    const points = await RegistrationPoint.find(filter)
      .sort({ type: 1, name: 1 })
      .lean();
    res.json(points.map(exposePublicPoint));
  } catch (err) {
    serverError(res, err);
  }
};

exports.create = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only!' });

    const context = await contextFromRequest(req, { requireEventIdentity: false, requireAccess: true });
    const eventRefs = context ? eventRefsFromContext(context) : {};
    const name = String(req.body.name || '').trim();
    if (name.length < 2) return res.status(400).json({ error: 'Point name is required.' });

    const duplicateFilter = eventRefs.eventId
      ? { eventId: eventRefs.eventId, name }
      : { $or: [{ eventId: null }, { eventId: { $exists: false } }], name };
    const exists = await RegistrationPoint.findOne(duplicateFilter).lean();
    if (exists) return res.status(400).json({ error: 'Name already exists for this event.' });

    const point = await RegistrationPoint.create({
      ...eventRefs,
      name,
      description: String(req.body.description || '').trim(),
      type: req.body.type || 'onsite',
      enabled: req.body.enabled !== false,
      allowedStaff: normalizeIdList(req.body.allowedStaff),
      deviceIds: normalizeIdList(req.body.deviceIds),
      kioskPolicy: sanitizePolicy(req.body.kioskPolicy),
    });

    auditLog && auditLog({ req, action: 'CREATE_REGISTRATION_POINT', detail: `name=${name}, eventId=${point.eventId || ''}` });
    res.json(point);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Name already exists for this event.' });
    serverError(res, err);
  }
};

exports.update = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only!' });

    const { id } = req.params;
    const point = await RegistrationPoint.findById(id);
    if (!point) return res.status(404).json({ error: 'Not found' });

    const context = await contextFromRequest(req, { requireEventIdentity: false, requireAccess: true });
    if (context && !pointBelongsToContext(point, context)) {
      return res.status(403).json({ error: 'Registration point does not belong to this event.' });
    }

    const name = String(req.body.name || point.name || '').trim();
    if (name.length < 2) return res.status(400).json({ error: 'Point name is required.' });

    const duplicateFilter = point.eventId
      ? { _id: { $ne: point._id }, eventId: point.eventId, name }
      : { _id: { $ne: point._id }, $or: [{ eventId: null }, { eventId: { $exists: false } }], name };
    const exists = await RegistrationPoint.findOne(duplicateFilter).lean();
    if (exists) return res.status(400).json({ error: 'Name already exists for this event.' });

    point.name = name;
    point.description = String(req.body.description || '').trim();
    if (req.body.type) point.type = req.body.type;
    if (req.body.enabled !== undefined) point.enabled = req.body.enabled === true;
    if (req.body.allowedStaff !== undefined) point.allowedStaff = normalizeIdList(req.body.allowedStaff);
    if (req.body.deviceIds !== undefined) point.deviceIds = normalizeIdList(req.body.deviceIds);
    if (req.body.kioskPolicy !== undefined) point.kioskPolicy = sanitizePolicy(req.body.kioskPolicy);

    await point.save();
    auditLog && auditLog({ req, action: 'UPDATE_REGISTRATION_POINT', detail: `id=${id}` });
    res.json(point);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Name already exists for this event.' });
    serverError(res, err);
  }
};

exports.softDelete = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only!' });

    const { id } = req.params;
    const point = await RegistrationPoint.findByIdAndUpdate(id, { enabled: false }, { new: true });
    if (!point) return res.status(404).json({ error: 'Not found' });
    auditLog && auditLog({ req, action: 'DELETE_REGISTRATION_POINT', detail: `id=${id}` });
    res.json({ message: 'Disabled registration point', point });
  } catch (err) {
    serverError(res, err);
  }
};

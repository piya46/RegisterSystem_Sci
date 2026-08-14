const ParticipantField = require('../models/participantField');
const Participant = require('../models/participant');
const mongoose = require('mongoose');
const RegistrationPoint = require('../models/registrationPoint');
const ScopedRegistrationSession = require('../models/scopedRegistrationSession');
const { v4: uuidv4 } = require('uuid');
const canRegisterAtPoint = require('../helpers/canRegisterAtPoint');
const auditLog = require('../helpers/auditLog');
const { auditSensitiveAccess } = require('../helpers/sensitiveAuditLog');
const { sendTicketMail } = require('../utils/sendTicketMail');
const verifyTurnstile = require('../utils/verifyTurnstile'); 
const { serverError } = require('../utils/httpResponses');
const {
  encryptValue,
  participantBlindIndexes,
  participantFieldMatch,
  participantSearchTokens,
  participantSearchTokensForQuery,
  protectParticipantFields,
  revealParticipantObject,
} = require('../utils/fieldEncryption');
const {
  assertEventOnsiteRegistrationOpen,
  assertEventRegistrationOpen,
  eventScopeFromRequest,
  getEventContextFromRequest,
  normalizeEventYear,
} = require('../utils/eventYear');
const { hasPermission } = require('../utils/permissions');
const { REGISTRATION_TYPES, registrationTypeFromRequest } = require('../utils/registrationTypes');
const { listEffectiveParticipantFields } = require('../utils/participantFieldScope');
const { boolEnv } = require('../utils/cloudCostGuardrail');
const { hashIdempotencyKey, normalizeIdempotencyKey, requestFingerprint } = require('../utils/idempotency');
const {
  participantOperationalResponse,
  participantRegistrationResponse,
} = require('../utils/participantResponse');
const { revokeParticipantSessions } = require('../utils/participantTokens');
const sqlEventRegistration = require('../sql/eventRegistrationRepository');

function contextRefsForYear(context, eventYear) {
  if (normalizeEventYear(context?.eventYear) !== normalizeEventYear(eventYear)) return {};
  return {
    organizationId: context.organizationId,
    seriesId: context.seriesId,
    eventId: context.eventId,
  };
}

function participantEventFilter(context, eventYear) {
  if (context?.eventId) return { eventId: context.eventId };
  return { eventYear: normalizeEventYear(eventYear) };
}

function bindScopedEventContext(req, res) {
  const isScopedRegistration = ['kiosk_device', 'self_register_session'].includes(req.auth?.scope);
  if (!isScopedRegistration) return true;

  const scopedEventId = req.auth?.eventId ? String(req.auth.eventId) : '';
  const scopedEventYear = req.auth?.eventYear ? normalizeEventYear(req.auth.eventYear) : '';
  if (!scopedEventId) {
    res.status(403).json({ error: 'Scoped registration token is missing event context.' });
    return false;
  }
  if (req.body.eventId && String(req.body.eventId) !== scopedEventId) {
    res.status(403).json({ error: 'Scoped registration token is invalid for this event.' });
    return false;
  }
  if (req.body.eventYear && scopedEventYear && normalizeEventYear(req.body.eventYear) !== scopedEventYear) {
    res.status(403).json({ error: 'Scoped registration token is invalid for this event year.' });
    return false;
  }

  req.body.eventId = scopedEventId;
  if (scopedEventYear) req.body.eventYear = scopedEventYear;
  return true;
}

async function assertRegistrationPointUsable(req, res, pointId, eventContext, { isScopedRegistration = false, isKioskDevice = false } = {}) {
  if (sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(eventContext)) {
    const point = await sqlEventRegistration.findRegistrationPointById(pointId, eventContext);
    if (!point || point.enabled !== true) {
      res.status(400).json({ error: 'จุดลงทะเบียนนี้ปิดใช้งานหรือไม่พบในระบบ' });
      return null;
    }
    if (isKioskDevice && point.type !== 'kiosk' && point.kioskPolicy?.allowKioskMode !== true) {
      res.status(403).json({ error: 'จุดลงทะเบียนนี้ยังไม่ได้เปิดใช้งาน Kiosk mode' });
      return null;
    }
    if (!isScopedRegistration) {
      const allowedByPoint = Array.isArray(point.allowedStaff)
        && point.allowedStaff.some((staffId) => String(staffId) === String(req.user?._id));
      if (!canRegisterAtPoint(req.user, pointId) && !allowedByPoint) {
        res.status(403).json({ error: 'You do not have permission to use this registration point.' });
        return null;
      }
    }
    return point;
  }

  const point = await RegistrationPoint.findById(pointId).lean();
  if (!point || point.enabled !== true) {
    res.status(400).json({ error: 'จุดลงทะเบียนนี้ปิดใช้งานหรือไม่พบในระบบ' });
    return null;
  }
  if (eventContext?.eventId && (!point.eventId || String(point.eventId) !== String(eventContext.eventId))) {
    res.status(403).json({ error: 'จุดลงทะเบียนนี้ไม่ได้อยู่ในกิจกรรมที่เลือก' });
    return null;
  }
  if (isKioskDevice && point.type !== 'kiosk' && point.kioskPolicy?.allowKioskMode !== true) {
    res.status(403).json({ error: 'จุดลงทะเบียนนี้ยังไม่ได้เปิดใช้งาน Kiosk mode' });
    return null;
  }
  if (!isScopedRegistration) {
    const allowedByPoint = Array.isArray(point.allowedStaff)
      && point.allowedStaff.some((staffId) => String(staffId) === String(req.user?._id));
    if (!canRegisterAtPoint(req.user, pointId) && !allowedByPoint) {
      res.status(403).json({ error: 'You do not have permission to use this registration point.' });
      return null;
    }
  }
  return point;
}

async function consumeSelfRegisterSession(req, res) {
  if (req.auth?.scope !== 'self_register_session') return null;
  const jti = String(req.auth?.jti || '').trim();
  if (!jti) {
    res.status(403).json({ error: 'Self-register session นี้ไม่รองรับการป้องกัน replay กรุณาสแกน QR Code ใหม่' });
    return false;
  }

  const consumed = await ScopedRegistrationSession.findOneAndUpdate(
    {
      jti,
      scope: 'self_register_session',
      eventId: req.auth.eventId,
      pointId: req.kioskPoint,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
  if (!consumed) {
    res.status(409).json({ error: 'Self-register session นี้ถูกใช้แล้วหรือหมดอายุ กรุณาสแกน QR Code ใหม่' });
    return false;
  }
  return consumed;
}

function checkAdmin(req, res, permission = 'participant:manage') {
  if (!hasPermission(req.user, permission)) {
    auditLog && auditLog({ req, action: 'UNAUTHORIZED_ACCESS_PARTICIPANT', detail: 'Not admin', status: 403 });
    res.status(403).json({ error: 'Admin only!' });
    return false;
  }
  return true;
}

function operationalParticipant(participant) {
  return participantOperationalResponse(revealParticipantObject(participant));
}

function validateBuddhistAcademicYear(value) {
  if (value === undefined || value === null || String(value).trim() === '') return '';
  const yearVal = Number.parseInt(value, 10);
  if (!Number.isFinite(yearVal) || !/^\d{4}$/.test(String(value).trim())) {
    return 'กรุณากรอกปีการศึกษาเป็น พ.ศ. 4 หลัก';
  }
  if (yearVal < 2400) return 'กรุณากรอกปีการศึกษาเป็น พ.ศ. (เช่น 2530)';
  if (yearVal >= 2565) return 'นิสิตปัจจุบัน (รหัส 65 เป็นต้นไป) ยังไม่สามารถลงทะเบียนได้';
  return '';
}

async function findParticipantByRegistrationIdempotency(eventId, keyHash) {
  if (!eventId || !keyHash) return null;
  return Participant.findOne({ eventId, registrationIdempotencyKeyHash: keyHash })
    .select('+registrationIdempotencyFingerprint');
}

async function findRegistrationReplay(eventContext, keyHash) {
  if (sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(eventContext)) {
    return sqlEventRegistration.findParticipantByRegistrationIdempotency(eventContext, keyHash);
  }
  return findParticipantByRegistrationIdempotency(eventContext.eventId, keyHash);
}

async function findDuplicateRegistration(eventContext, eventYear, userFields) {
  if (sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(eventContext)) {
    return sqlEventRegistration.findDuplicateParticipant(eventContext, userFields);
  }
  const duplicateIdentityFilters = [
    userFields.email ? participantFieldMatch('email', userFields.email) : null,
    userFields.phone ? participantFieldMatch('phone', userFields.phone) : null,
  ].filter(Boolean);
  if (duplicateIdentityFilters.length === 0) return null;
  return Participant.findOne({
    $and: [
      { isDeleted: false, ...participantEventFilter(eventContext, eventYear) },
      { $or: duplicateIdentityFilters },
    ],
  }).select('_id');
}

function assertRegistrationFingerprint(participant, fingerprint) {
  if (participant.registrationIdempotencyFingerprint === fingerprint) return;
  const error = new Error('Idempotency-Key นี้ถูกใช้กับข้อมูลลงทะเบียนอื่นแล้ว');
  error.code = 'IDEMPOTENCY_KEY_REUSED';
  error.statusCode = 409;
  throw error;
}

function respondParticipantReplay(req, res, participant) {
  if (participant.isDeleted || participant.isRevoked) {
    return res.status(409).json({ error: 'รายการของ Idempotency-Key นี้ไม่สามารถนำกลับมาใช้ได้' });
  }
  auditLog({
    req,
    action: 'PARTICIPANT_REGISTRATION_IDEMPOTENCY_REPLAY',
    detail: `participantId=${participant._id}`,
  });
  res.setHeader('Idempotency-Replayed', 'true');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(participantRegistrationResponse(participant));
}

exports.createParticipant = async (req, res) => {
  let replayState = null;
  try {
    const eventContext = await getEventContextFromRequest(req, { requireEventIdentity: true, requirePublic: true });

    const fieldsDef = await listEffectiveParticipantFields(eventContext, { enabledOnly: true });
    const allowedFields = fieldsDef.map(f => f.name);
    const requiredFields = fieldsDef.filter(f => f.required).map(f => f.name);

    const followers = Math.max(0, Number.parseInt(req.body.followers || 0, 10) || 0);
    const consent = req.body.consent;
    const specialAssistance = req.body.specialAssistance || "";

    const userFields = {};
    for (const f of allowedFields) {
      if (req.body[f] !== undefined) userFields[f] = req.body[f];
    }
    
    const isPackageSelected = req.body.isPackage === true || req.body.isPackage === 'true';
    if (isPackageSelected) {
      if (!userFields.usr_add || !userFields.usr_add_post || userFields.usr_add === '-' || userFields.usr_add_post === '-') {
        return res.status(400).json({ error: 'กรุณาระบุที่อยู่และรหัสไปรษณีย์ เนื่องจากท่านได้เลือกรับการสนับสนุนแบบ Package' });
      }
    }

    for (const f of requiredFields) {
      if (!userFields[f] && !['usr_add', 'usr_add_post'].includes(f)) {
        return res.status(400).json({ error: `Field ${f} is required` });
      }
    }

    const dateYearError = validateBuddhistAcademicYear(userFields.date_year);
    if (dateYearError) return res.status(400).json({ error: dateYearError });

    const eventYear = normalizeEventYear(eventContext.eventYear);
    const idempotencyKey = normalizeIdempotencyKey(req.get('Idempotency-Key'), {
      required: boolEnv('PARTICIPANT_REGISTRATION_IDEMPOTENCY_REQUIRED', process.env.NODE_ENV === 'production'),
    });
    const idempotencyKeyHash = idempotencyKey
      ? hashIdempotencyKey(`participant-registration:${eventContext.eventId}`, idempotencyKey)
      : null;
    const idempotencyFingerprint = idempotencyKeyHash
      ? requestFingerprint({
        fields: userFields,
        followers,
        consent: consent || null,
        specialAssistance,
        isPackage: isPackageSelected,
        organizationId: String(eventContext.organizationId || ''),
        seriesId: String(eventContext.seriesId || ''),
        eventId: String(eventContext.eventId || ''),
        eventYear,
        registrationType: REGISTRATION_TYPES.ONLINE,
      })
      : null;
    replayState = {
      eventId: eventContext.eventId,
      keyHash: idempotencyKeyHash,
      fingerprint: idempotencyFingerprint,
    };

    const existingParticipant = await findRegistrationReplay(eventContext, idempotencyKeyHash);
    if (existingParticipant) {
      assertRegistrationFingerprint(existingParticipant, idempotencyFingerprint);
      return respondParticipantReplay(req, res, existingParticipant);
    }

    if (eventContext.event) assertEventRegistrationOpen(eventContext.event);

    const isHuman = await verifyTurnstile(req.body.cfToken, req.ip, { expectedAction: 'register' });
    if (!isHuman && process.env.NODE_ENV === 'production') {
      auditLog({ req, action: 'REGISTER_BOT_BLOCK', detail: 'Turnstile verification failed', status: 400 });
      return res.status(400).json({ error: 'ไม่ผ่านการตรวจสอบความปลอดภัย (Turnstile Failed). กรุณาลองใหม่อีกครั้ง' });
    }

    if (userFields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(userFields.email).trim())) {
      return res.status(400).json({ error: 'Email format is invalid.' });
    }
    if (userFields.phone) {
      const phoneRegex = /^0[689]\d{8}$/;
      if (!phoneRegex.test(userFields.phone)) return res.status(400).json({ error: 'Phone number format is invalid.' });
    }

    const duplicateParticipant = await findDuplicateRegistration(eventContext, eventYear, userFields);
    if (duplicateParticipant) {
      return res.status(409).json({ error: 'อีเมลหรือเบอร์โทรนี้ลงทะเบียนในกิจกรรมแล้ว' });
    }

    const qrCode = uuidv4();

    const participant = sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(eventContext)
      ? await sqlEventRegistration.createParticipant(eventContext, {
        plainFields: userFields,
        fields: protectParticipantFields(userFields),
        secureIndex: participantBlindIndexes(userFields),
        secureSearch: participantSearchTokens(userFields),
        eventYear,
        qrCode,
        registeredBy: req.user?._id || null,
        registeredPointName: 'Online',
        registrationType: REGISTRATION_TYPES.ONLINE,
        followers,
        consent,
        specialAssistance: encryptValue(specialAssistance),
        registrationIdempotencyKeyHash: idempotencyKeyHash,
        registrationIdempotencyFingerprint: idempotencyFingerprint,
      })
      : await Participant.create({
        fields: protectParticipantFields(userFields),
        secureIndex: participantBlindIndexes(userFields),
        secureSearch: participantSearchTokens(userFields),
        ...contextRefsForYear(eventContext, eventYear),
        eventYear,
        qrCode,
        registeredBy: req.user?._id || null,
        registeredPoint: 'Online',
        registeredPointName: 'Online',
        registrationType: REGISTRATION_TYPES.ONLINE,
        followers,
        consent,
        specialAssistance: encryptValue(specialAssistance),
        registrationIdempotencyKeyHash: idempotencyKeyHash,
        registrationIdempotencyFingerprint: idempotencyFingerprint,
      });

    if (userFields.email) {
      try {
        await sendTicketMail(userFields.email, {
          qrCode: participant.qrCode,
          fields: userFields,
        }, { event: eventContext.event });
      } catch (err) {
        auditLog && auditLog({ req, action: 'SEND_TICKET_EMAIL_FAIL', detail: `participantId=${participant._id}`, status: 500, error: err.message });
      }
    }

    auditLog && auditLog({ req, action: 'CREATE_PARTICIPANT', detail: `participantId=${participant._id}` });
    res.setHeader('Idempotency-Replayed', 'false');
    res.setHeader('Cache-Control', 'no-store');
    res.json(participantRegistrationResponse(participant));
  } catch (err) {
    if (replayState?.keyHash) {
      try {
        const existingParticipant = await findRegistrationReplay(
          { eventId: replayState.eventId },
          replayState.keyHash
        );
        if (existingParticipant) {
          assertRegistrationFingerprint(existingParticipant, replayState.fingerprint);
          return respondParticipantReplay(req, res, existingParticipant);
        }
      } catch (replayError) {
        if (replayError.statusCode) {
          return res.status(replayError.statusCode).json({ error: replayError.message });
        }
      }
    }
    auditLog && auditLog({ req, action: 'CREATE_PARTICIPANT_ERROR', detail: err.message, status: err.statusCode || 500 });
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    serverError(res, err);
  }
};

exports.createParticipantByStaff = async (req, res) => {
  try {
    const { registrationPoint } = req.body;
    
    const roles = Array.isArray(req.user?.role) ? req.user.role : [];
    const isScopedKioskDevice = req.auth?.scope === 'kiosk_device';
    const isKioskOperator = roles.includes('kiosk');
    const isKioskDevice = isScopedKioskDevice || isKioskOperator;
    const isSelfRegisterSession = req.auth?.scope === 'self_register_session';
    const isScopedRegistration = isScopedKioskDevice || isSelfRegisterSession;
    
    // Scoped tokens are bound to one point. Kiosk role sessions use normal point permissions.
    const tokenPoint = req.kioskPoint;

    if (isScopedRegistration && (!tokenPoint || String(tokenPoint) !== String(registrationPoint))) {
      return res.status(403).json({ error: 'Kiosk link is invalid for this registration point.' });
    }
    if (!bindScopedEventContext(req, res)) return;
    const eventContext = await getEventContextFromRequest(req, { requireEventIdentity: true, requireAccess: !isScopedRegistration });
    if (eventContext.event) assertEventOnsiteRegistrationOpen(eventContext.event);
    const eventYear = normalizeEventYear(eventContext.eventYear);
    const registrationPointDoc = await assertRegistrationPointUsable(req, res, registrationPoint, eventContext, { isScopedRegistration, isKioskDevice });
    if (!registrationPointDoc) return;

    const fieldsDef = await listEffectiveParticipantFields(eventContext, { enabledOnly: true });
    const allowedFields = fieldsDef.map(f => f.name);
    const requiredFields = fieldsDef.filter(f => f.required).map(f => f.name);
    const followers = Math.max(0, Number.parseInt(req.body.followers || 0, 10) || 0);
    const consent = req.body.consent;
    const specialAssistance = req.body.specialAssistance || "";

    const userFields = {};
    for (const f of allowedFields) {
      if (req.body[f] !== undefined) userFields[f] = req.body[f];
    }
    for (const f of requiredFields) {
      if (!userFields[f]) return res.status(400).json({ error: `Field '${f}' is required.` });
    }
    const dateYearError = validateBuddhistAcademicYear(userFields.date_year);
    if (dateYearError) return res.status(400).json({ error: dateYearError });

    if (userFields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(userFields.email).trim())) {
      return res.status(400).json({ error: 'Email format is invalid.' });
    }
    if (userFields.phone) {
      const phoneRegex = /^0[689]\d{8}$/;
      if (!phoneRegex.test(userFields.phone)) return res.status(400).json({ error: 'Phone number format is invalid.' });
    }
    const duplicateParticipant = await findDuplicateRegistration(eventContext, eventYear, userFields);
    if (duplicateParticipant) {
      return res.status(409).json({ error: 'อีเมลหรือเบอร์โทรนี้ลงทะเบียนในกิจกรรมแล้ว' });
    }

    const consumedSession = await consumeSelfRegisterSession(req, res);
    if (consumedSession === false) return;

    const qrCode = uuidv4();
    const participant = sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(eventContext)
      ? await sqlEventRegistration.createParticipant(eventContext, {
        plainFields: userFields,
        fields: protectParticipantFields(userFields),
        secureIndex: participantBlindIndexes(userFields),
        secureSearch: participantSearchTokens(userFields),
        eventYear,
        status: 'checkedIn',
        checkedInAt: new Date(),
        registeredBy: req.user._id,
        qrCode,
        registeredPointId: registrationPointDoc._id,
        registeredPointName: registrationPointDoc.name,
        registrationType: registrationTypeFromRequest(req),
        followers,
        consent,
        specialAssistance: encryptValue(specialAssistance),
      })
      : await Participant.create({
        fields: protectParticipantFields(userFields),
        secureIndex: participantBlindIndexes(userFields),
        secureSearch: participantSearchTokens(userFields),
        ...contextRefsForYear(eventContext, eventYear),
        eventYear,
        status: 'checkedIn',
        checkedInAt: new Date(),
        registeredBy: req.user._id,
        qrCode,
        registeredPoint: String(registrationPointDoc._id),
        registeredPointId: registrationPointDoc._id,
        registeredPointName: registrationPointDoc.name,
        registrationType: registrationTypeFromRequest(req),
        followers,
        consent,
        specialAssistance: encryptValue(specialAssistance)
      });

    if (consumedSession && !sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(eventContext)) {
      await ScopedRegistrationSession.updateOne(
        { _id: consumedSession._id },
        { $set: { participantId: participant._id } }
      );
    }

    const safeParticipant = operationalParticipant(participant);
    res.json({
      _id: participant._id,
      fields: safeParticipant.fields,
      status: participant.status,
      checkedInAt: participant.checkedInAt,
      registeredPoint: participant.registeredPoint,
      registeredPointId: participant.registeredPointId,
      registeredPointName: participant.registeredPointName,
      registrationType: participant.registrationType
    });
  } catch (err) {
    serverError(res, err);
  }
};

exports.registerOnsite = async (req, res) => {
  try {
    const {
      cfToken,
      consent,
      followers,
      registrationPoint,
      eventYear: _requestedEventYear,
      specialAssistance,
      ...fields
    } = req.body;
    
    // ตรวจสอบ Turnstile (หากอยู่ใน Production)
    const isValid = await verifyTurnstile(cfToken, req.ip, { expectedAction: 'kiosk_register' });
    if (!isValid && process.env.NODE_ENV === 'production') {
      return res.status(400).json({ error: 'Security check failed. Please try again.' });
    }

    if (!bindScopedEventContext(req, res)) return;
    const isScopedRegistration = ['kiosk_device', 'self_register_session'].includes(req.auth?.scope);
    const eventContext = await getEventContextFromRequest(req, { requireEventIdentity: true, requireAccess: !isScopedRegistration });
    if (eventContext.event) assertEventOnsiteRegistrationOpen(eventContext.event);
    const eventYear = normalizeEventYear(eventContext.eventYear);
    const fieldsDef = await listEffectiveParticipantFields(eventContext, { enabledOnly: true });
    const allowedFields = fieldsDef.map(f => f.name);
    const filteredFields = {};
    for (const name of allowedFields) {
      if (fields[name] !== undefined) filteredFields[name] = fields[name];
    }

    if (!filteredFields.name || !filteredFields.phone || !filteredFields.email) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (ชื่อ, อีเมล, เบอร์โทรศัพท์)' });
    }
    const dateYearError = validateBuddhistAcademicYear(filteredFields.date_year);
    if (dateYearError) return res.status(400).json({ error: dateYearError });
    if (filteredFields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(filteredFields.email).trim())) {
      return res.status(400).json({ error: 'Email format is invalid.' });
    }
    if (filteredFields.phone && !/^0[689]\d{8}$/.test(filteredFields.phone)) {
      return res.status(400).json({ error: 'Phone number format is invalid.' });
    }

    // ตรวจสอบข้อมูลซ้ำ
    const existing = await findDuplicateRegistration(eventContext, eventYear, filteredFields);
    if (existing) return res.status(400).json({ error: 'อีเมลหรือเบอร์โทรนี้ลงทะเบียนในระบบแล้ว' });

    const actualPoint = req.kioskPoint || registrationPoint;
    if (!actualPoint) return res.status(400).json({ error: 'กรุณาระบุจุดลงทะเบียน' });

    const registrationPointDoc = await assertRegistrationPointUsable(req, res, actualPoint, eventContext, {
      isScopedRegistration,
      isKioskDevice: req.auth?.scope === 'kiosk_device',
    });
    if (!registrationPointDoc) return;

    const tags = req.registrationMethod === 'Self-Service (QR)'
      ? ['Walk-in', 'Self-Service']
      : ['Walk-in', 'Staff-Assisted'];
    const participant = sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(eventContext)
      ? await sqlEventRegistration.createParticipant(eventContext, {
        plainFields: filteredFields,
        fields: protectParticipantFields(filteredFields),
        secureIndex: participantBlindIndexes(filteredFields),
        secureSearch: participantSearchTokens(filteredFields),
        eventYear,
        status: 'checkedIn',
        checkedInAt: new Date(),
        registeredPointId: registrationPointDoc._id,
        registeredPointName: registrationPointDoc.name,
        registrationType: registrationTypeFromRequest(req),
        followers: parseInt(followers, 10) || 0,
        consent: consent === 'agreed' ? 'agreed' : 'disagreed',
        specialAssistance: encryptValue(specialAssistance || ''),
        qrCode: `ON-${uuidv4()}`,
        registeredBy: req.user ? req.user._id : null,
        tags,
      })
      : await Participant.create({
        fields: protectParticipantFields(filteredFields),
        secureIndex: participantBlindIndexes(filteredFields),
        secureSearch: participantSearchTokens(filteredFields),
        ...contextRefsForYear(eventContext, eventYear),
        eventYear,
        status: 'checkedIn',
        checkedInAt: new Date(),
        registeredPoint: String(registrationPointDoc._id),
        registeredPointId: registrationPointDoc._id,
        registeredPointName: registrationPointDoc.name,
        registrationType: registrationTypeFromRequest(req),
        followers: parseInt(followers, 10) || 0,
        consent: consent === 'agreed' ? 'agreed' : 'disagreed',
        specialAssistance: encryptValue(specialAssistance || ''),
        qrCode: `ON-${uuidv4()}`,
        registeredBy: req.user ? req.user._id : null,
        tags,
      });

    // บันทึก Log การกระทำ
    if (req.user && req.user._id) {
       auditLog({ req, action: 'CREATE_PARTICIPANT_ONSITE', detail: `Method: ${req.registrationMethod} participantId=${participant._id}` });
    }

    res.status(201).json({ message: 'ลงทะเบียนหน้างานสำเร็จ', participant: operationalParticipant(participant) });
  } catch (err) {
    serverError(res, err);
  }
};

exports.listParticipants = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return;
    const eventScope = await eventScopeFromRequest(req, { isDeleted: false }, { requireEventIdentity: true });
    const { eventYear, filter } = eventScope;
    if (sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(eventScope)) {
      const participants = await sqlEventRegistration.listParticipants(eventScope);
      await auditSensitiveAccess({
        req,
        action: 'SENSITIVE_DECRYPT_PARTICIPANTS_LIST_SQL',
        purpose: 'admin_participant_list',
        resource: 'event_registrations',
        eventYear,
        recordCount: participants.length,
        fields: ['participant.fields', 'participant.specialAssistance'],
      });
      return res.json(participants.map(operationalParticipant));
    }
    const participants = await Participant.find(filter).sort({ createdAt: -1 }).select('+secureIndex');
    const safeParticipants = participants.map(operationalParticipant);
    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_DECRYPT_PARTICIPANTS_LIST',
      purpose: 'admin_participant_list',
      resource: 'participants',
      eventYear,
      recordCount: safeParticipants.length,
      fields: ['participant.fields', 'participant.specialAssistance'],
    });
    res.json(safeParticipants);
  } catch (err) { serverError(res, err); }
};

exports.updateParticipant = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return;
    if (!mongoose.Types.ObjectId.isValid(req.params.id) && !/^\d+$/.test(String(req.params.id))) {
      return res.status(400).json({ error: 'Participant ID is invalid' });
    }
    const eventScope = await eventScopeFromRequest(
      req,
      { _id: req.params.id, isDeleted: false },
      { requireEventIdentity: true }
    );
    if (sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(eventScope)) {
      const participant = await sqlEventRegistration.findParticipantById(req.params.id, eventScope);
      if (!participant || participant.isDeleted) return res.status(404).json({ error: 'Participant not found' });
      const fieldsDef = await listEffectiveParticipantFields({
        eventId: participant.eventId,
        eventYear: participant.eventYear,
        organizationId: participant.organizationId,
        seriesId: participant.seriesId,
      }, { enabledOnly: true });
      const allowedFields = fieldsDef.map(f => f.name);
      const plainFields = { ...(participant.fields || {}) };
      const inputFields = req.body.fields || req.body;
      for (const f of allowedFields) if (inputFields[f] !== undefined) plainFields[f] = inputFields[f];
      const updates = {
        plainFields,
        fields: protectParticipantFields(plainFields),
        secureIndex: participantBlindIndexes(plainFields),
        secureSearch: participantSearchTokens(plainFields),
      };
      if (req.body.followers !== undefined) updates.followers = Math.min(100, Math.max(0, Number.parseInt(req.body.followers, 10) || 0));
      if (req.body.consent !== undefined) {
        if (!['agreed', 'disagreed', null].includes(req.body.consent)) {
          return res.status(400).json({ error: 'Consent value is invalid' });
        }
        updates.consent = req.body.consent;
      }
      if (req.body.specialAssistance !== undefined) updates.specialAssistance = encryptValue(String(req.body.specialAssistance || '').slice(0, 2000));
      if (req.body.tags !== undefined && Array.isArray(req.body.tags)) {
        updates.tags = [...new Set(req.body.tags
          .map((tag) => String(tag || '').trim().slice(0, 50))
          .filter(Boolean))].slice(0, 20);
      }
      const updated = await sqlEventRegistration.updateParticipant(req.params.id, eventScope, updates);
      return res.json(operationalParticipant(updated));
    }
    const participant = await Participant.findOne(eventScope.filter);
    if (!participant || participant.isDeleted) return res.status(404).json({ error: 'Participant not found' });
    const fieldsDef = await listEffectiveParticipantFields({
      eventId: participant.eventId,
      eventYear: participant.eventYear,
      organizationId: participant.organizationId,
      seriesId: participant.seriesId,
    }, { enabledOnly: true });
    const allowedFields = fieldsDef.map(f => f.name);

    if (req.body.followers !== undefined) {
      participant.followers = Math.min(100, Math.max(0, Number.parseInt(req.body.followers, 10) || 0));
    }
    if (req.body.consent !== undefined) {
      if (!['agreed', 'disagreed', null].includes(req.body.consent)) {
        return res.status(400).json({ error: 'Consent value is invalid' });
      }
      participant.consent = req.body.consent;
    }
    if (req.body.specialAssistance !== undefined) {
      participant.specialAssistance = encryptValue(String(req.body.specialAssistance || '').slice(0, 2000));
    }
    
    // [เพิ่ม] บันทึก Tags ถ้ามีการส่งมา
    if (req.body.tags !== undefined && Array.isArray(req.body.tags)) {
      participant.tags = [...new Set(req.body.tags
        .map((tag) => String(tag || '').trim().slice(0, 50))
        .filter(Boolean))].slice(0, 20);
    }

    const inputFields = req.body.fields || req.body;
    const plainParticipant = revealParticipantObject(participant);
    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_DECRYPT_PARTICIPANT_UPDATE',
      purpose: 'admin_update_merge_existing_fields',
      resource: 'participants',
      eventYear: participant.eventYear,
      recordCount: 1,
      fields: ['participant.fields', 'participant.specialAssistance'],
      extra: { participantId: String(participant._id) },
    });
    const plainFields = plainParticipant.fields || {};
    for (const f of allowedFields) { if (inputFields[f] !== undefined) plainFields[f] = inputFields[f]; }
    participant.fields = protectParticipantFields(plainFields);
    participant.secureIndex = participantBlindIndexes(plainFields);
    participant.secureSearch = participantSearchTokens(plainFields);
    participant.markModified('fields'); participant.markModified('secureIndex'); participant.markModified('secureSearch'); participant.updatedAt = new Date();
    await participant.save();
    res.json(operationalParticipant(participant));
  } catch (err) { serverError(res, err); }
};

exports.deleteParticipant = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return;
    if (!mongoose.Types.ObjectId.isValid(req.params.id) && !/^\d+$/.test(String(req.params.id))) {
      return res.status(400).json({ error: 'Participant ID is invalid' });
    }
    const eventScope = await eventScopeFromRequest(
      req,
      { _id: req.params.id, isDeleted: false },
      { requireEventIdentity: true }
    );
    if (sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(eventScope)) {
      const participant = await sqlEventRegistration.findParticipantById(req.params.id, eventScope);
      if (!participant || participant.isDeleted) return res.status(404).json({ error: 'Participant not found' });
      await sqlEventRegistration.softDeleteParticipant(req.params.id, eventScope);
      auditLog({ req, action: 'DELETE_PARTICIPANT_SQL', detail: `eventId=${eventScope.eventId}; participantId=${req.params.id}` });
      return res.json({ message: 'Participant deleted (soft)' });
    }
    const participant = await Participant.findOne(eventScope.filter);
    if (!participant || participant.isDeleted) return res.status(404).json({ error: 'Participant not found' });
    participant.isDeleted = true;
    participant.isRevoked = true;
    participant.participantTokenVersion = Number(participant.participantTokenVersion || 0) + 1;
    await participant.save();
    await revokeParticipantSessions(participant._id, { reason: 'participant_deleted' });
    auditLog({ req, action: 'DELETE_PARTICIPANT', detail: `eventId=${eventScope.eventId}; participantId=${participant._id}` });
    res.json({ message: 'Participant deleted (soft)' });
  } catch (err) { serverError(res, err); }
};

exports.checkinByQr = async (req, res) => {
  try {
    const { qrCode, registrationPoint } = req.body;
    const followers = req.body.followers != null ? Math.max(0, Number.parseInt(req.body.followers, 10) || 0) : undefined;
    if (!qrCode) return res.status(400).json({ error: 'qrCode is required.' });
    if (!registrationPoint) return res.status(400).json({ error: 'registrationPoint is required.' });
    
    const roles = Array.isArray(req.user?.role) ? req.user.role : [];
    const isScopedKioskDevice = req.auth?.scope === 'kiosk_device';
    const isKioskOperator = roles.includes('kiosk');
    const isKioskDevice = isScopedKioskDevice || isKioskOperator;
    const tokenPoint = req.kioskPoint;
    if (isScopedKioskDevice && (!tokenPoint || String(tokenPoint) !== String(registrationPoint))) {
      return res.status(403).json({ error: 'Kiosk link is invalid for this registration point.' });
    }
    if (!bindScopedEventContext(req, res)) return;
    const eventScope = await eventScopeFromRequest(req, { qrCode, isDeleted: false }, { requireEventIdentity: true, requireAccess: !isScopedKioskDevice });
    if (eventScope.event) assertEventOnsiteRegistrationOpen(eventScope.event);
    const { eventYear, filter } = eventScope;
    const registrationPointDoc = await assertRegistrationPointUsable(req, res, registrationPoint, eventScope, { isScopedRegistration: isScopedKioskDevice, isKioskDevice });
    if (!registrationPointDoc) return;
    if (sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(eventScope)) {
      const participant = await sqlEventRegistration.findParticipantByQr(eventScope, qrCode);
      if (!participant) return res.status(404).json({ error: 'Ticket not found' });
      if (participant.status === 'checkedIn') return res.status(400).json({ error: 'Already checked in.' });
      const checkedIn = await sqlEventRegistration.checkinParticipantByQr(eventScope, qrCode, {
        registrationPointId: isScopedKioskDevice ? tokenPoint : registrationPoint,
        registeredBy: req.user._id,
        followers,
        sourceScope: registrationTypeFromRequest(req),
      });
      await auditSensitiveAccess({
        req,
        action: 'SENSITIVE_DECRYPT_CHECKIN_RESULT_SQL',
        purpose: 'staff_checkin_response',
        resource: 'event_registrations',
        eventYear,
        recordCount: 1,
        fields: ['participant.fields'],
        extra: { participantId: String(checkedIn._id) },
      });
      return res.json({
        message: 'Check-in successful',
        participant: {
          _id: checkedIn._id,
          fields: checkedIn.fields,
          checkedInAt: checkedIn.checkedInAt,
          registeredPoint: checkedIn.registeredPoint,
          registeredPointId: checkedIn.registeredPointId,
          registeredPointName: checkedIn.registeredPointName,
          registeredBy: req.user.username,
          registrationType: checkedIn.registrationType,
          followers: checkedIn.followers,
          tags: checkedIn.tags,
        },
      });
    }
    const participant = await Participant.findOne(filter);
    if (!participant) return res.status(404).json({ error: 'Ticket not found' });
    if (participant.status === 'checkedIn') return res.status(400).json({ error: 'Already checked in.' });

    const actualRegistrationPoint = isScopedKioskDevice ? tokenPoint : registrationPoint;
    if (followers !== undefined) participant.followers = followers;
    participant.status = 'checkedIn';
    participant.checkedInAt = new Date();
    participant.registeredBy = req.user._id;
    participant.registeredPoint = String(actualRegistrationPoint);
    participant.registeredPointId = registrationPointDoc._id;
    participant.registeredPointName = registrationPointDoc.name;
    await participant.save();
    const safeParticipant = revealParticipantObject(participant);
    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_DECRYPT_CHECKIN_RESULT',
      purpose: 'staff_checkin_response',
      resource: 'participants',
      eventYear,
      recordCount: 1,
      fields: ['participant.fields'],
      extra: { participantId: String(participant._id) },
    });
res.json({ 
        message: 'Check-in successful', 
        participant: { 
            _id: participant._id, 
            fields: safeParticipant.fields,
            checkedInAt: participant.checkedInAt, 
            registeredPoint: participant.registeredPoint, 
            registeredPointId: participant.registeredPointId,
            registeredPointName: participant.registeredPointName,
            registeredBy: req.user.username, 
            registrationType: participant.registrationType, 
            followers: participant.followers,
            tags: participant.tags // ✅ เพิ่มตรงนี้เพื่อให้ส่งคืน Tag กลับไปด้วย
        } 
    });
  } catch (err) { serverError(res, err); }
};

exports.resendTicket = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone is required.' });
    const phoneRegex = /^0[689]\d{8}$/;
    if (!phoneRegex.test(phone)) return res.status(400).json({ error: 'Phone number format is invalid.' });

    const isHuman = await verifyTurnstile(req.body.cfToken, req.ip, { expectedAction: 'resend_ticket' });
    if (!isHuman && process.env.NODE_ENV === 'production') {
      return res.status(400).json({ error: 'ไม่ผ่านการตรวจสอบความปลอดภัย กรุณาลองใหม่อีกครั้ง' });
    }

    const eventScope = await eventScopeFromRequest(req, { isDeleted: false }, {
      requireEventIdentity: true,
      requireAccess: false,
      requirePublic: true,
    });
    const { eventYear } = eventScope;
    const genericResponse = { success: true, message: 'หากพบข้อมูลในระบบ ระบบจะส่ง E-Ticket ไปยังอีเมลที่ลงทะเบียนไว้' };
    res.setHeader('Cache-Control', 'no-store');
    if (sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(eventScope)) {
      const participants = await sqlEventRegistration.listParticipants(eventScope);
      const participant = participants.find((item) => String(item.fields?.phone || '') === String(phone));
      if (!participant) return res.json(genericResponse);
      await auditSensitiveAccess({
        req,
        action: 'SENSITIVE_DECRYPT_RESEND_TICKET_SQL',
        purpose: 'public_resend_ticket_email_lookup',
        resource: 'event_registrations',
        eventYear,
        recordCount: 1,
        fields: ['participant.fields.email'],
        extra: { participantId: String(participant._id) },
      });
      const email = participant.fields?.email;
      if (email) {
        try {
          await sendTicketMail(email, participant, { event: eventScope.event });
        } catch (err) {
          auditLog && auditLog({ req, action: 'RESEND_TICKET_FAIL_SQL', detail: `participantId=${participant._id}`, status: 500, error: err.message });
        }
      }
      return res.json(genericResponse);
    }
    const participant = await Participant.findOne({
      $and: [
        eventScope.filter,
        participantFieldMatch('phone', phone),
      ],
    }).select('+secureIndex');
    if (!participant) return res.json(genericResponse);
    const safeParticipant = revealParticipantObject(participant);
    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_DECRYPT_RESEND_TICKET',
      purpose: 'public_resend_ticket_email_lookup',
      resource: 'participants',
      eventYear,
      recordCount: 1,
      fields: ['participant.fields.email'],
      extra: { participantId: String(participant._id) },
    });
    const email = safeParticipant.fields.email;
    if (email) {
      try {
        await sendTicketMail(email, safeParticipant, { event: eventScope.event });
      } catch (err) {
        auditLog && auditLog({ req, action: 'RESEND_TICKET_FAIL', detail: `participantId=${participant._id}`, status: 500, error: err.message });
      }
    }
    return res.json(genericResponse);
  } catch (error) {
    return serverError(res, error);
  }
};

exports.resendTicketByStaff = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return;
    if (!mongoose.Types.ObjectId.isValid(req.params.id) && !/^\d+$/.test(String(req.params.id))) {
      return res.status(400).json({ error: 'Participant ID is invalid' });
    }
    const eventScope = await eventScopeFromRequest(
      req,
      { _id: req.params.id, isDeleted: false },
      { requireEventIdentity: true }
    );
    if (sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(eventScope)) {
      const participant = await sqlEventRegistration.findParticipantById(req.params.id, eventScope);
      if (!participant) return res.status(404).json({ error: 'Participant not found in this Event' });
      const email = participant.fields?.email;
      if (!email) return res.status(409).json({ sent: false, message: 'ผู้เข้าร่วมไม่มีอีเมลสำหรับรับ E-Ticket' });
      await auditSensitiveAccess({
        req,
        action: 'SENSITIVE_DECRYPT_STAFF_RESEND_TICKET_SQL',
        purpose: 'staff_resend_ticket',
        resource: 'event_registrations',
        eventYear: eventScope.eventYear,
        recordCount: 1,
        fields: ['participant.fields.email'],
        extra: { participantId: String(participant._id) },
      });
      await sendTicketMail(email, participant, { event: eventScope.event });
      auditLog({
        req,
        action: 'STAFF_RESEND_TICKET_SQL',
        detail: `eventId=${eventScope.eventId}; participantId=${participant._id}`,
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ sent: true, message: 'ส่ง E-Ticket สำเร็จ' });
    }
    const participant = await Participant.findOne(eventScope.filter).select('+secureIndex');
    if (!participant) return res.status(404).json({ error: 'Participant not found in this Event' });

    const safeParticipant = revealParticipantObject(participant);
    const email = safeParticipant.fields?.email;
    if (!email) return res.status(409).json({ sent: false, message: 'ผู้เข้าร่วมไม่มีอีเมลสำหรับรับ E-Ticket' });

    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_DECRYPT_STAFF_RESEND_TICKET',
      purpose: 'staff_resend_ticket',
      resource: 'participants',
      eventYear: eventScope.eventYear,
      recordCount: 1,
      fields: ['participant.fields.email'],
      extra: { participantId: String(participant._id) },
    });
    await sendTicketMail(email, safeParticipant, { event: eventScope.event });
    auditLog({
      req,
      action: 'STAFF_RESEND_TICKET',
      detail: `eventId=${eventScope.eventId}; participantId=${participant._id}`,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ sent: true, message: 'ส่ง E-Ticket สำเร็จ' });
  } catch (error) {
    auditLog({ req, action: 'STAFF_RESEND_TICKET_FAIL', detail: 'Ticket delivery failed', status: error.statusCode || 500 });
    return serverError(res, error);
  }
};

exports.searchParticipants = async (req, res) => {
  try {
    const { phone, name, email, qrCode, q } = req.query;
    const eventScope = await eventScopeFromRequest(req, { isDeleted: false }, { requireEventIdentity: true });
    const { eventYear } = eventScope;
    if (sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(eventScope)) {
      const participants = await sqlEventRegistration.listParticipants(eventScope);
      const normalized = {
        phone: phone ? String(phone).trim() : '',
        email: email ? String(email).trim().toLowerCase() : '',
        name: name ? String(name).trim().toLowerCase() : '',
        qrCode: qrCode ? String(qrCode).trim() : '',
        q: q ? String(q).trim().toLowerCase() : '',
      };
      const results = participants.filter((participant) => {
        const f = participant.fields || {};
        const displayName = String(f.name || f.fullName || f.fullname || '').toLowerCase();
        const haystack = [displayName, f.phone, f.email, participant.qrCode]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (normalized.q && !haystack.includes(normalized.q)) return false;
        if (normalized.name && !displayName.includes(normalized.name)) return false;
        if (normalized.phone && String(f.phone || '') !== normalized.phone) return false;
        if (normalized.email && String(f.email || '').toLowerCase() !== normalized.email) return false;
        if (normalized.qrCode && String(participant.qrCode || '') !== normalized.qrCode) return false;
        return true;
      }).map(operationalParticipant);
      await auditSensitiveAccess({
        req,
        action: 'SENSITIVE_DECRYPT_PARTICIPANTS_SEARCH_SQL',
        purpose: 'staff_admin_search',
        resource: 'event_registrations',
        eventYear,
        recordCount: results.length,
        fields: ['participant.fields'],
        extra: { searchMode: q ? 'q' : 'filtered' },
      });
      return res.json(results);
    }
    let filter = eventScope.filter;
    if (q) {
      const secureSearchTokens = participantSearchTokensForQuery(q);
      const directResults = await Participant.find({
        $and: [
          filter,
          {
            $or: [
              { 'fields.name': { $regex: q, $options: 'i' } },
              participantFieldMatch('phone', q),
              participantFieldMatch('email', q),
              ...(secureSearchTokens.length ? [{ secureSearch: { $in: secureSearchTokens } }] : []),
              { qrCode: q },
            ],
          },
        ],
      }).select('+secureIndex +secureSearch');
      const normalizedQ = String(q).trim().toLowerCase();
      const scanned = directResults.length ? [] : await Participant.find(filter).limit(500).select('+secureIndex +secureSearch');
      const merged = new Map();
      [...directResults, ...scanned].forEach((participant) => {
        const safe = operationalParticipant(participant);
        const f = safe.fields || {};
        const haystack = [f.name, f.fullName, f.fullname, f.phone, f.email, safe.qrCode]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (haystack.includes(normalizedQ)) merged.set(String(safe._id), safe);
      });
      const results = [...merged.values()];
      await auditSensitiveAccess({
        req,
        action: 'SENSITIVE_DECRYPT_PARTICIPANTS_SEARCH',
        purpose: 'staff_admin_search',
        resource: 'participants',
        eventYear,
        recordCount: results.length,
        fields: ['participant.fields'],
        extra: { searchMode: 'q' },
      });
      return res.json(results);
    }
    if (name) {
      const normalizedName = String(name).trim().toLowerCase();
      const secureSearchTokens = participantSearchTokensForQuery(name);
      const indexed = secureSearchTokens.length
        ? await Participant.find({ ...filter, secureSearch: { $in: secureSearchTokens } }).select('+secureIndex +secureSearch')
        : [];
      const scanned = indexed.length ? indexed : await Participant.find(filter).limit(1000).select('+secureIndex +secureSearch');
      const matches = scanned.map(operationalParticipant).filter((participant) => {
        const f = participant.fields || {};
        const displayName = String(f.name || f.fullName || f.fullname || '').toLowerCase();
        if (!displayName.includes(normalizedName)) return false;
        if (phone && String(f.phone || '') !== String(phone)) return false;
        if (email && String(f.email || '') !== String(email)) return false;
        if (qrCode && String(participant.qrCode || '') !== String(qrCode)) return false;
        return true;
      });
      await auditSensitiveAccess({
        req,
        action: 'SENSITIVE_DECRYPT_PARTICIPANTS_SEARCH',
        purpose: 'staff_admin_search',
        resource: 'participants',
        eventYear,
        recordCount: matches.length,
        fields: ['participant.fields'],
        extra: { searchMode: 'name_scan' },
      });
      return res.json(matches);
    }

    const and = [filter];
    if (phone) and.push(participantFieldMatch('phone', phone));
    if (email) and.push(participantFieldMatch('email', email));
    if (qrCode) filter['qrCode'] = qrCode;
    if (and.length > 1) filter = { $and: and };
    const results = await Participant.find(filter).select('+secureIndex');
    const safeResults = results.map(operationalParticipant);
    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_DECRYPT_PARTICIPANTS_SEARCH',
      purpose: 'staff_admin_search',
      resource: 'participants',
      eventYear,
      recordCount: safeResults.length,
      fields: ['participant.fields'],
      extra: { searchMode: 'exact' },
    });
    return res.json(safeResults);
  } catch (err) {
    return serverError(res, err);
  }
};

exports.exportParticipants = async (req, res) => {
  try {
    if (!checkAdmin(req, res, 'participant:export')) return;
    const { status } = req.query;
    const eventScope = await eventScopeFromRequest(req, { isDeleted: false }, { requireEventIdentity: true });
    const { eventYear } = eventScope;
    const find = eventScope.filter;
    if (status) find.status = status;

    const participants = sqlEventRegistration.sqlEventRegistrationPrimaryEnabled(eventScope)
      ? (await sqlEventRegistration.listParticipants(eventScope, { status })).map(operationalParticipant)
      : (await Participant.find(find).maxTimeMS(30000).populate('registeredBy', 'username fullName email').select('+secureIndex')).map(operationalParticipant);
    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_EXPORT_PARTICIPANTS_CSV',
      purpose: 'admin_csv_export',
      resource: 'participants',
      eventYear,
      recordCount: participants.length,
      fields: ['name', 'phone', 'email', 'address', 'specialAssistance', 'qrCode'],
      extra: { status: status || 'all' },
    });
    const headers = [
      'No.', 'Name', 'Phone', 'Email', 'Department', 'Address', 'ZipCode', 'Status',
      'RegisteredAt', 'CheckedInAt', 'RegistrationPoint', 'RegistrationType',
      'Followers', 'Consent', 'SpecialAssistance', 'Tags', 'QR Code', 'RegisteredBy',
    ];
    const escapeCsv = (value) => {
      if (value == null) return '';
      return `"${String(value).replace(/\r?\n|\r/g, ' ').replace(/"/g, '""')}"`;
    };
    const formatDate = (value) => {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().replace('T', ' ').slice(0, 19);
    };

    const rows = participants.map((p, idx) => {
      const f = p.fields || {};
      return [
        idx + 1,
        f.name || f.fullName || f.fullname || '',
        f.phone || '',
        f.email || '',
        f.department || f.faculty || '',
        f.usr_add || '-',
        f.usr_add_post || '-',
        p.status || 'registered',
        formatDate(p.createdAt),
        formatDate(p.checkedInAt),
        p.registeredPointName || p.registeredPoint?.name || p.registeredPoint?.pointName || p.registeredPoint || '',
        p.registrationType || '',
        Number.isFinite(p.followers) ? p.followers : 0,
        p.consent || '-',
        p.specialAssistance || '-',
        p.tags ? p.tags.join(', ') : '-',
        p.qrCode || '',
        (p.registeredBy && (p.registeredBy.fullName || p.registeredBy.username || p.registeredBy.email)) || (typeof p.registeredBy === 'string' ? p.registeredBy : '') || '',
      ];
    });

    const csv = [
      headers.map(escapeCsv).join(','),
      ...rows.map((row) => row.map(escapeCsv).join(',')),
    ].join('\r\n');
    const now = new Date();
    const fileName = `participants-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('X-Total-Count', participants.length);
    res.setHeader('X-Export-Status', 'completed');
    res.send(`\uFEFF${csv}`);
  } catch (err) { serverError(res, err); }
};

exports.restorePrizeRight = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return;
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Participant ID is invalid' });
    }
    const eventScope = await eventScopeFromRequest(
      req,
      { _id: req.params.id, isDeleted: false },
      { requireEventIdentity: true }
    );
    const participant = await Participant.findOneAndUpdate(
      eventScope.filter,
      { $set: { isForfeited: false }, $unset: { prizeId: 1, prizeWonAt: 1 } },
      { new: true }
    );
    if (!participant) return res.status(404).json({ error: 'ไม่พบผู้เข้าร่วม' });
    res.json({ message: 'คืนสิทธิ์จับรางวัลสำเร็จ', participant: operationalParticipant(participant) });
  } catch (err) {
    serverError(res, err);
  }
};

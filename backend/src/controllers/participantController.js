const ParticipantField = require('../models/participantField');
const Participant = require('../models/participant');
const mongoose = require('mongoose');
const SystemSetting = require('../models/SystemSetting'); 
const RegistrationPoint = require('../models/registrationPoint');
const { v4: uuidv4 } = require('uuid');
const canRegisterAtPoint = require('../helpers/canRegisterAtPoint');
const { isParticipantCheckedIn } = require('../helpers/checkInStatusService');
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
  const point = await RegistrationPoint.findById(pointId).lean();
  if (!point || point.enabled !== true) {
    res.status(400).json({ error: 'จุดลงทะเบียนนี้ปิดใช้งานหรือไม่พบในระบบ' });
    return null;
  }
  if (point.eventId && eventContext?.eventId && String(point.eventId) !== String(eventContext.eventId)) {
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

async function findParticipantByRegistrationIdempotency(eventId, keyHash) {
  if (!eventId || !keyHash) return null;
  return Participant.findOne({ eventId, registrationIdempotencyKeyHash: keyHash })
    .select('+registrationIdempotencyFingerprint');
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
    if (!eventContext.event) {
      const setting = await SystemSetting.findOne();
      if (setting) {
        if (!setting.enableRegister) return res.status(403).json({ error: 'ระบบปิดรับการลงทะเบียนชั่วคราว' });
        const now = new Date();
        if (setting.preRegStartDate && now < new Date(setting.preRegStartDate)) return res.status(403).json({ error: 'ยังไม่ถึงเวลาเปิดรับลงทะเบียน' });
        if (setting.preRegEndDate && now > new Date(setting.preRegEndDate)) return res.status(403).json({ error: 'หมดเวลาลงทะเบียนล่วงหน้าแล้ว' });
      }
    }

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

    if (userFields.date_year) {
      const yearVal = parseInt(userFields.date_year, 10);
      if (!isNaN(yearVal) && yearVal < 2400) return res.status(400).json({ error: 'กรุณากรอกปีการศึกษาเป็น พ.ศ. (เช่น 2569)' });
    }

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

    const existingParticipant = await findParticipantByRegistrationIdempotency(
      eventContext.eventId,
      idempotencyKeyHash
    );
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

    const duplicateIdentityFilters = [
      userFields.email ? participantFieldMatch('email', userFields.email) : null,
      userFields.phone ? participantFieldMatch('phone', userFields.phone) : null,
    ].filter(Boolean);
    if (duplicateIdentityFilters.length > 0) {
      const duplicateParticipant = await Participant.findOne({
        $and: [
          { eventId: eventContext.eventId, isDeleted: false },
          { $or: duplicateIdentityFilters },
        ],
      }).select('_id');
      if (duplicateParticipant) {
        return res.status(409).json({ error: 'อีเมลหรือเบอร์โทรนี้ลงทะเบียนในกิจกรรมแล้ว' });
      }
    }

    const qrCode = uuidv4();

    const participant = await Participant.create({
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
        const existingParticipant = await findParticipantByRegistrationIdempotency(
          replayState.eventId,
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
    const setting = await SystemSetting.findOne();
    if (setting) {
      const now = new Date();
      if (setting.kioskStartDate && now < new Date(setting.kioskStartDate)) return res.status(403).json({ error: 'ยังไม่ถึงเวลาเปิดระบบลงทะเบียนหน้างาน (Kiosk)' });
      if (setting.kioskEndDate && now > new Date(setting.kioskEndDate)) return res.status(403).json({ error: 'หมดเวลาลงทะเบียนหน้างานแล้ว (Kiosk)' });
    }

    const { registrationPoint } = req.body;
    
    // // [แก้ไข] อนุญาตถ้าเป็น Kiosk Shared Token หรือถ้าเป็นคนให้เช็คสิทธิ์ปกติ
    // const isKioskDevice = req.user.role?.includes('kiosk_device') || req.user.role?.includes('kiosk');
    // if (!isKioskDevice && !canRegisterAtPoint(req.user, registrationPoint)) {
    //   return res.status(403).json({ error: 'You do not have permission to register at this point.' });
    // }
    // // ถ้าเป็น Token ของ Kiosk ให้บังคับเช็คว่า Point ตรงกันไหม (ป้องกันเอา Link ไปใช้ผิดจุด)
    // if (isKioskDevice && req.kioskPoint !== registrationPoint) {
    //   return res.status(403).json({ error: 'Kiosk link is invalid for this registration point.' });
    // }
    const isKioskDevice = req.auth?.scope === 'kiosk_device' || req.user.role?.includes('kiosk');
    const isSelfRegisterSession = req.auth?.scope === 'self_register_session';
    const isScopedRegistration = isKioskDevice || isSelfRegisterSession;
    
    // 🌟 1. ดึงค่า Point จาก Token รองรับทั้ง req.kioskPoint และ req.user.kioskPoint
    const tokenPoint = req.kioskPoint || req.user?.kioskPoint;

    // 🌟 2. แปลงให้เป็น String ก่อนเปรียบเทียบ เพื่อป้องกันปัญหาเรื่องประเภทตัวแปร (ObjectId vs String)
    if (isScopedRegistration && (!tokenPoint || String(tokenPoint) !== String(registrationPoint))) {
      return res.status(403).json({ error: 'Kiosk link is invalid for this registration point.' });
    }
    if (!bindScopedEventContext(req, res)) return;
    const eventContext = await getEventContextFromRequest(req, { requireEventIdentity: true, requireAccess: !isScopedRegistration });
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

    if (userFields.phone) {
      const phoneRegex = /^0[689]\d{8}$/;
      if (!phoneRegex.test(userFields.phone)) return res.status(400).json({ error: 'Phone number format is invalid.' });
      const checkedIn = await isParticipantCheckedIn({ field: 'phone', value: userFields.phone, eventId: eventContext.eventId, eventYear });
      if (checkedIn) return res.status(400).json({ error: 'ท่านได้ทำการลงทะเบียน/เช็คอิน ไปแล้ว' });
    }

    const qrCode = uuidv4();
    const participant = await Participant.create({
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

    // ตรวจสอบข้อมูลซ้ำ
    const existing = await Participant.findOne({
      $and: [
        { isDeleted: false, ...participantEventFilter(eventContext, eventYear) },
        {
          $or: [
            participantFieldMatch('email', filteredFields.email),
            participantFieldMatch('phone', filteredFields.phone),
          ],
        },
      ],
    });
    if (existing) return res.status(400).json({ error: 'อีเมลหรือเบอร์โทรนี้ลงทะเบียนในระบบแล้ว' });

    const actualPoint = req.kioskPoint || registrationPoint;
    if (!actualPoint) return res.status(400).json({ error: 'กรุณาระบุจุดลงทะเบียน' });

    const registrationPointDoc = await assertRegistrationPointUsable(req, res, actualPoint, eventContext, {
      isScopedRegistration,
      isKioskDevice: req.auth?.scope === 'kiosk_device',
    });
    if (!registrationPointDoc) return;

    const participant = await Participant.create({
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
      
      // 🌟 บันทึกสตาฟผู้ดูแล (ดึงจาก Token ที่ใช้ลงทะเบียน)
      registeredBy: req.user ? req.user._id : null,
      
      // 🌟 ใส่ Tag เพื่อให้แอดมินเช็คได้ว่าเป็นงาน Self Service
      tags: req.registrationMethod === 'Self-Service (QR)' 
            ? ['Walk-in', 'Self-Service'] 
            : ['Walk-in', 'Staff-Assisted']
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
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Participant ID is invalid' });
    }
    const eventScope = await eventScopeFromRequest(
      req,
      { _id: req.params.id, isDeleted: false },
      { requireEventIdentity: true }
    );
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
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Participant ID is invalid' });
    }
    const eventScope = await eventScopeFromRequest(
      req,
      { _id: req.params.id, isDeleted: false },
      { requireEventIdentity: true }
    );
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
    
    // Scoped kiosk tokens are bound to a single registration point.
    const isKioskDevice = req.auth?.scope === 'kiosk_device' || req.user.role?.includes('kiosk');
    const tokenPoint = req.kioskPoint || req.user?.kioskPoint;
    if (isKioskDevice && (!tokenPoint || String(tokenPoint) !== String(registrationPoint))) {
      return res.status(403).json({ error: 'Kiosk link is invalid for this registration point.' });
    }
    if (!bindScopedEventContext(req, res)) return;
    const eventScope = await eventScopeFromRequest(req, { qrCode, isDeleted: false }, { requireEventIdentity: true, requireAccess: !isKioskDevice });
    const { eventYear, filter } = eventScope;
    const registrationPointDoc = await assertRegistrationPointUsable(req, res, registrationPoint, eventScope, { isScopedRegistration: isKioskDevice, isKioskDevice });
    if (!registrationPointDoc) return;
    const participant = await Participant.findOne(filter);
    if (!participant) return res.status(404).json({ error: 'Ticket not found' });
    if (participant.status === 'checkedIn') return res.status(400).json({ error: 'Already checked in.' });

    const actualRegistrationPoint = isKioskDevice ? tokenPoint : registrationPoint;
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
    const participant = await Participant.findOne({
      $and: [
        eventScope.filter,
        participantFieldMatch('phone', phone),
      ],
    }).select('+secureIndex');
    const genericResponse = { success: true, message: 'หากพบข้อมูลในระบบ ระบบจะส่ง E-Ticket ไปยังอีเมลที่ลงทะเบียนไว้' };
    res.setHeader('Cache-Control', 'no-store');
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
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Participant ID is invalid' });
    }
    const eventScope = await eventScopeFromRequest(
      req,
      { _id: req.params.id, isDeleted: false },
      { requireEventIdentity: true }
    );
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

    const participants = (await Participant.find(find).maxTimeMS(30000).populate('registeredBy', 'username fullName email').select('+secureIndex')).map(operationalParticipant);
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

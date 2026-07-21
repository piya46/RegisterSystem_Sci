// backend/src/controllers/publicController.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Participant = require('../models/participant');
const Admin = require('../models/admin');
const RegistrationPoint = require('../models/registrationPoint');
const Event = require('../models/event');
const SystemSetting = require('../models/SystemSetting');
const RegistrationReuseChallenge = require('../models/registrationReuseChallenge');
const canRegisterAtPoint = require('../helpers/canRegisterAtPoint');
const auditLog = require('../helpers/auditLog');
const { auditSensitiveAccess } = require('../helpers/sensitiveAuditLog');
const { serverError } = require('../utils/httpResponses');
const {
  assertEventRegistrationOpen,
  eventScopeFromRequest,
  getEventContextFromRequest,
  normalizeEventYear,
} = require('../utils/eventYear');
const { decryptValue, participantFieldMatch, revealParticipantObject } = require('../utils/fieldEncryption');
const { generateOTP, generateRef, hashOTP, verifyOTP } = require('../utils/otp');
const sendMail = require('../utils/sendMail');
const { normalizeCertificateVerificationId } = require('../utils/certificateVerification');
const { ensureCertificateVerificationId } = require('../services/certificateVerificationService');
const verifyTurnstile = require('../utils/verifyTurnstile');
const {
  bucketTimestamp,
  coarsenCategoryCounts,
  maskDisplayName,
} = require('../utils/publicPrivacy');

const TOKEN_ISSUER = 'psevent';
const MAX_SELF_REGISTER_WINDOW_MS = 24 * 60 * 60 * 1000;
function boundedNumberEnv(name, fallback, minimum, maximum) {
  const parsed = Number(process.env[name]);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.trunc(Math.min(Math.max(value, minimum), maximum));
}
const PUBLIC_CACHE_TTL_MS = boundedNumberEnv('PUBLIC_CACHE_TTL_MS', 30000, 1000, 300000);
const PUBLIC_REPORT_MAX_ROWS = boundedNumberEnv('PUBLIC_REPORT_MAX_ROWS', 100, 1, 500);
const PUBLIC_AGGREGATE_MIN_GROUP_SIZE = boundedNumberEnv('PUBLIC_AGGREGATE_MIN_GROUP_SIZE', 3, 2, 20);
const publicCache = new Map();
const REUSE_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const REUSE_GENERIC_RESPONSE = {
  success: true,
  message: 'หากพบข้อมูลเดิม ระบบจะส่งรหัสยืนยันไปยังอีเมลที่ระบุ',
};

function emailHash(email) {
  const secret = process.env.SESSION_TOKEN_HASH_SECRET || process.env.JWT_SECRET;
  return crypto.createHmac('sha256', secret).update(String(email || '').trim().toLowerCase()).digest('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function cacheKey(name, { eventId = null, eventYear = '' } = {}) {
  return `${name}:${eventId ? String(eventId) : `year:${eventYear || 'unknown'}`}`;
}

function getCached(key) {
  const entry = publicCache.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    publicCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  publicCache.set(key, { value, expiresAt: Date.now() + PUBLIC_CACHE_TTL_MS });
}

function pointMatchesEvent(point, eventContext) {
  if (!eventContext?.eventId || !point?.eventId) return true;
  return String(point.eventId) === String(eventContext.eventId);
}

async function assertPointAccess(user, pointId, res, { eventContext = null, deviceId = '', mode = 'staff' } = {}) {
  const point = await RegistrationPoint.findById(pointId);
  if (!point || point.enabled !== true) {
    res.status(400).json({ error: 'ไม่พบจุดลงทะเบียน หรือจุดนี้ถูกปิดใช้งาน' });
    return false;
  }
  if (!pointMatchesEvent(point, eventContext)) {
    res.status(403).json({ error: 'จุดลงทะเบียนนี้ไม่ได้อยู่ในกิจกรรมที่เลือก' });
    return false;
  }
  if (mode === 'kiosk' && point.type !== 'kiosk' && point.kioskPolicy?.allowKioskMode !== true) {
    res.status(403).json({ error: 'จุดลงทะเบียนนี้ยังไม่ได้เปิดใช้งาน Kiosk mode' });
    return false;
  }
  if (Array.isArray(point.deviceIds) && point.deviceIds.length > 0 && !point.deviceIds.includes(String(deviceId || '').trim())) {
    res.status(403).json({ error: 'อุปกรณ์นี้ไม่ได้รับอนุญาตให้ใช้จุดลงทะเบียนนี้' });
    return false;
  }

  const allowedByPoint = Array.isArray(point.allowedStaff)
    && point.allowedStaff.some((staffId) => String(staffId) === String(user?._id));
  if (!canRegisterAtPoint(user, pointId) && !allowedByPoint) {
    res.status(403).json({ error: 'คุณไม่มีสิทธิ์สร้างลิงก์สำหรับจุดลงทะเบียนนี้' });
    return false;
  }

  return true;
}

async function eventForReuse(slug) {
  const event = await Event.findOne({ slug: String(slug || '').trim().toLowerCase() });
  if (!event) {
    const error = new Error('กิจกรรมนี้ยังไม่เปิดรับลงทะเบียน');
    error.statusCode = 404;
    throw error;
  }
  assertEventRegistrationOpen(event);
  if (event.config?.allowRegistrationReuse !== true) {
    const error = new Error('กิจกรรมนี้ยังไม่เปิดใช้การดึงข้อมูลลงทะเบียนเดิม');
    error.statusCode = 403;
    throw error;
  }
  return event;
}

async function sourceEventsForReuse(event) {
  const mode = event.config?.registrationReuseMode || event.linkingMode || 'series-linked';
  const manualIds = Array.isArray(event.config?.registrationReuseEventIds)
    ? event.config.registrationReuseEventIds
    : [];
  if (mode === 'manual-linked' && manualIds.length > 0) {
    return Event.find({ _id: { $in: manualIds } }).select('_id eventYear name');
  }
  if (event.linkingMode === 'manual-linked' && Array.isArray(event.linkedEventIds) && event.linkedEventIds.length > 0) {
    return Event.find({ _id: { $in: event.linkedEventIds } }).select('_id eventYear name');
  }
  return Event.find({
    seriesId: event.seriesId,
    _id: { $ne: event._id },
    eventYear: { $ne: event.eventYear },
  }).select('_id eventYear name').sort({ eventYear: -1 });
}

async function findReusableParticipant(event, email) {
  const sourceEvents = await sourceEventsForReuse(event);
  const sourceEventIds = sourceEvents.map((item) => item._id);
  if (sourceEventIds.length === 0) return { participant: null, sourceEvent: null };
  const participant = await Participant.findOne({
    $and: [
      { isDeleted: false },
      { eventId: { $in: sourceEventIds } },
      participantFieldMatch('email', email),
    ],
  }).sort({ registeredAt: -1 }).select('+secureIndex +secureSearch');
  const sourceEvent = participant?.eventId
    ? sourceEvents.find((item) => String(item._id) === String(participant.eventId))
    : null;
  return { participant, sourceEvent: sourceEvent || null };
}

exports.requestRegistrationReuseOtp = async (req, res) => {
  try {
    const event = await eventForReuse(req.params.slug);
    const email = normalizeEmail(req.body?.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุอีเมลให้ถูกต้อง' });
    }
    const isHuman = await verifyTurnstile(req.body?.cfToken, req.ip, { expectedAction: 'registration_reuse' });
    if (!isHuman && process.env.NODE_ENV === 'production') {
      return res.status(400).json({ success: false, message: 'ไม่ผ่านการตรวจสอบความปลอดภัย กรุณาลองใหม่อีกครั้ง' });
    }
    res.setHeader('Cache-Control', 'no-store');
    const { participant, sourceEvent } = await findReusableParticipant(event, email);
    if (!participant) {
      auditLog({ req, action: 'REGISTRATION_REUSE_OTP_REQUEST_NOT_FOUND', detail: `eventId=${event._id}`, status: 200 });
      return res.json({ ...REUSE_GENERIC_RESPONSE, challengeId: new mongoose.Types.ObjectId(), ref: generateRef() });
    }

    const otp = generateOTP();
    const ref = generateRef();
    const challenge = await RegistrationReuseChallenge.create({
      targetEventId: event._id,
      sourceEventId: sourceEvent?._id || null,
      participantId: participant._id,
      emailHash: emailHash(email),
      otpHash: hashOTP(otp),
      ref,
      expiresAt: new Date(Date.now() + REUSE_CHALLENGE_TTL_MS),
    });

    try {
      await sendMail(
        email,
        `รหัสยืนยันดึงข้อมูลลงทะเบียนเดิม (Ref: ${ref})`,
        `รหัส OTP ของคุณคือ ${otp} (Ref: ${ref}) ใช้ได้ 10 นาที`,
        `<p>รหัส OTP ของคุณคือ <strong>${otp}</strong></p><p>Ref: ${ref}</p><p>ใช้ได้ 10 นาที เพื่อยืนยันก่อนดึงข้อมูลลงทะเบียนเดิม</p>`
      );
      auditLog({ req, action: 'REGISTRATION_REUSE_OTP_REQUEST', detail: `eventId=${event._id}; challengeId=${challenge._id}` });
    } catch (mailError) {
      auditLog({ req, action: 'REGISTRATION_REUSE_OTP_MAIL_FAIL', detail: `eventId=${event._id}; challengeId=${challenge._id}; error=${mailError.message}`, status: 500 });
    }
    res.json({ ...REUSE_GENERIC_RESPONSE, challengeId: challenge._id, ref });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    serverError(res, err);
  }
};

exports.confirmRegistrationReuseOtp = async (req, res) => {
  try {
    const event = await eventForReuse(req.params.slug);
    const { challengeId, otp } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(challengeId) || !/^\d{8}$/.test(String(otp || ''))) {
      return res.status(400).json({ success: false, message: 'รหัสยืนยันหมดอายุหรือไม่ถูกต้อง' });
    }
    res.setHeader('Cache-Control', 'no-store');
    const now = new Date();
    const activeFilter = {
      _id: challengeId,
      targetEventId: event._id,
      usedAt: null,
      expiresAt: { $gt: now },
      attempts: { $lt: 5 },
    };
    const challenge = await RegistrationReuseChallenge.findOne(activeFilter);
    if (!challenge) {
      return res.status(400).json({ success: false, message: 'รหัสยืนยันหมดอายุหรือไม่ถูกต้อง' });
    }
    if (challenge.attempts >= 5) {
      return res.status(429).json({ success: false, message: 'กรอกรหัสผิดเกินจำนวนครั้งที่กำหนด กรุณาขอรหัสใหม่' });
    }
    if (!verifyOTP(otp, challenge.otpHash)) {
      const attempt = await RegistrationReuseChallenge.updateOne(activeFilter, { $inc: { attempts: 1 } });
      if (attempt.modifiedCount !== 1) {
        return res.status(400).json({ success: false, message: 'รหัสยืนยันหมดอายุหรือไม่ถูกต้อง' });
      }
      return res.status(400).json({ success: false, message: 'รหัส OTP ไม่ถูกต้อง' });
    }
    const consumedChallenge = await RegistrationReuseChallenge.findOneAndUpdate(
      activeFilter,
      { $set: { usedAt: now } },
      { new: true }
    );
    if (!consumedChallenge) {
      return res.status(400).json({ success: false, message: 'รหัสยืนยันหมดอายุหรือไม่ถูกต้อง' });
    }
    const participant = await Participant.findById(consumedChallenge.participantId).select('+secureIndex +secureSearch');
    if (!participant || participant.isDeleted) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลเดิมที่สามารถดึงมาใช้ได้' });
    }
    const safe = revealParticipantObject(participant);
    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_DECRYPT_REGISTRATION_REUSE',
      purpose: 'public_registration_reuse_prefill_after_otp',
      resource: 'participants',
      eventYear: event.eventYear,
      recordCount: 1,
      fields: ['participant.fields', 'participant.specialAssistance'],
      extra: { targetEventId: String(event._id), sourceParticipantId: String(participant._id) },
    });
    auditLog({ req, action: 'REGISTRATION_REUSE_OTP_CONFIRM', detail: `eventId=${event._id}; participantId=${participant._id}` });
    res.json({
      success: true,
      data: {
        fields: safe.fields || {},
        followers: safe.followers || 0,
        specialAssistance: safe.specialAssistance || '',
        sourceEventYear: participant.eventYear || '',
      },
    });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    serverError(res, err);
  }
};

exports.generateKioskToken = async (req, res) => {
  try {
    const { pointId, deviceId } = req.body;
    if (!pointId) return res.status(400).json({ error: 'ต้องระบุ Registration Point' });
    const eventContext = await getEventContextFromRequest(req, { requireEventIdentity: true });
    if (!(await assertPointAccess(req.user, pointId, res, { eventContext, deviceId, mode: 'kiosk' }))) return;
    const eventId = eventContext.eventId ? String(eventContext.eventId) : null;
    const eventYear = normalizeEventYear(eventContext.eventYear);

    const token = jwt.sign(
      { role: 'kiosk_device', pointId, eventId, eventYear, deviceId: deviceId || '', createdBy: req.user._id },
      process.env.JWT_SECRET,
      { expiresIn: '12h', audience: 'kiosk-device', issuer: TOKEN_ISSUER }
    );
    res.json({ token });
  } catch (err) { serverError(res, err); }
};

exports.verifyKioskToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'ไม่พบ Kiosk token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      audience: 'kiosk-device',
      issuer: TOKEN_ISSUER,
    });
    if (decoded.role !== 'kiosk_device' || !decoded.pointId) {
      return res.status(403).json({ success: false, message: 'Token ไม่ถูกต้องสำหรับ Kiosk' });
    }

    const point = await RegistrationPoint.findById(decoded.pointId).lean();
    if (!point || point.enabled !== true) {
      return res.status(403).json({ success: false, message: 'จุดลงทะเบียนนี้ถูกปิดใช้งานหรือไม่พบในระบบ' });
    }
    if (point.eventId && decoded.eventId && String(point.eventId) !== String(decoded.eventId)) {
      return res.status(403).json({ success: false, message: 'Kiosk token ไม่ตรงกับกิจกรรมของจุดลงทะเบียน' });
    }
    if (point.type !== 'kiosk' && point.kioskPolicy?.allowKioskMode !== true) {
      return res.status(403).json({ success: false, message: 'จุดลงทะเบียนนี้ยังไม่ได้เปิดใช้งาน Kiosk mode' });
    }
    if (Array.isArray(point.deviceIds) && point.deviceIds.length > 0 && !point.deviceIds.includes(String(decoded.deviceId || '').trim())) {
      return res.status(403).json({ success: false, message: 'อุปกรณ์นี้ไม่ได้รับอนุญาตให้ใช้ Kiosk token นี้' });
    }

    const settings = await SystemSetting.findOne().lean();
    const now = new Date();
    if (settings?.maintenanceMode === true) {
      return res.status(403).json({ success: false, message: 'ระบบกำลังปิดปรับปรุง' });
    }
    if (settings?.kioskStartDate && now < new Date(settings.kioskStartDate)) {
      return res.status(403).json({ success: false, message: `ยังไม่ถึงเวลาเปิด Kiosk (${new Date(settings.kioskStartDate).toLocaleString('th-TH')})` });
    }
    if (settings?.kioskEndDate && now > new Date(settings.kioskEndDate)) {
      return res.status(403).json({ success: false, message: 'หมดเวลาใช้งาน Kiosk แล้ว' });
    }

    res.json({
      success: true,
      data: {
        pointId: String(point._id),
        pointName: point.name,
        pointType: point.type,
        eventId: decoded.eventId || '',
        eventYear: decoded.eventYear || '',
        deviceId: decoded.deviceId || '',
        expiresAt: decoded.exp ? new Date(decoded.exp * 1000) : null,
        serverTime: now,
        kioskPolicy: point.kioskPolicy || {},
        warnings: point.type !== 'kiosk' && point.kioskPolicy?.allowKioskMode === true ? ['registration point allows kiosk mode by policy'] : [],
      }
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({ success: false, message: 'Kiosk token หมดอายุ กรุณาสร้างใหม่' });
    }
    if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
      return res.status(403).json({ success: false, message: 'Kiosk token ไม่ถูกต้อง' });
    }
    serverError(res, err);
  }
};

exports.getPublicReport = async (req, res) => {
  try {
    const eventScope = await eventScopeFromRequest(req, { isDeleted: false, status: 'checkedIn' }, { requireEventIdentity: true, requirePublic: true, requireAccess: false });
    const { eventId, eventYear, filter } = eventScope;
    const key = cacheKey('publicReport', { eventId, eventYear });
    const cached = getCached(key);
    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
    if (cached) return res.json(cached);

    const [totalCheckedIn, participantRows] = await Promise.all([
      Participant.countDocuments(filter),
      Participant.find(
        filter,
        'fields.name fields.fullName fields.fullname fields.department fields.dept registeredPoint registeredPointName checkedInAt'
      ).sort({ checkedInAt: -1 }).limit(PUBLIC_REPORT_MAX_ROWS).lean(),
    ]);
    const participants = participantRows
      .map(revealParticipantObject);
    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_DECRYPT_PUBLIC_REPORT_MASKED',
      purpose: 'public_masked_report',
      resource: 'participants',
      eventYear,
      recordCount: participants.length,
      fields: ['participant.fields.name'],
      extra: { masked: true },
    });

    const maskedData = participants.map(p => {
      const name = p.fields?.name || p.fields?.fullName || p.fields?.fullname || '';
      return {
        name: maskDisplayName(name),
        department: String(p.fields?.department || p.fields?.dept || '').slice(0, 80),
        point: String(p.registeredPointName || p.registeredPoint || '').slice(0, 80),
        checkedInAt: bucketTimestamp(p.checkedInAt, 15),
      };
    });

    const payload = { totalCheckedIn, displayedCount: maskedData.length, data: maskedData };
    setCached(key, payload);
    res.json(payload);
  } catch (err) { serverError(res, err); }
};

exports.getPublicDashboardStats = async (req, res) => {
  try {
    const eventScope = await eventScopeFromRequest(req, { isDeleted: false, status: 'checkedIn' }, { requireEventIdentity: true, requirePublic: true, requireAccess: false });
    const { eventId, eventYear, filter } = eventScope;
    const key = cacheKey('publicDashboard', { eventId, eventYear });
    const cached = getCached(key);
    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
    if (cached) return res.json(cached);

    const participants = (await Participant.find(
      filter,
      'fields.dept fields.date_year followers'
    ).lean()).map(revealParticipantObject);
    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_DECRYPT_PUBLIC_DASHBOARD',
      purpose: 'public_dashboard_stats',
      resource: 'participants',
      eventYear,
      recordCount: participants.length,
      fields: ['participant.fields.dept', 'participant.fields.date_year'],
      extra: { aggregateOnly: true },
    });

    let totalCheckedIn = participants.length;
    let totalFollowers = 0;
    let deptCount = {};
    let yearCount = {};

    participants.forEach(p => {
      totalFollowers += (p.followers || 0);
      const dept = p.fields?.dept || 'ไม่ระบุภาควิชา';
      deptCount[dept] = (deptCount[dept] || 0) + 1;
      const year = p.fields?.date_year || 'ไม่ระบุปีการศึกษา';
      yearCount[year] = (yearCount[year] || 0) + 1;
    });

    const payload = {
      totalCheckedIn,
      totalFollowers,
      totalAttendees: totalCheckedIn + totalFollowers,
      deptStats: coarsenCategoryCounts(deptCount, PUBLIC_AGGREGATE_MIN_GROUP_SIZE),
      yearStats: coarsenCategoryCounts(yearCount, PUBLIC_AGGREGATE_MIN_GROUP_SIZE),
      updatedAt: new Date()
    };
    setCached(key, payload);
    res.json(payload);
  } catch (err) {
    serverError(res, err);
  }
};

// 🌟 [เพิ่มใหม่] สร้าง Master Token (กำหนดเวลาได้) สำหรับ Staff เอาไปให้คนอื่นสแกน
exports.generateSelfRegisterLink = async (req, res) => {
  try {
    const { pointId, validFrom, validUntil, forStaffId } = req.body;
    if (!pointId || !validFrom || !validUntil) {
      return res.status(400).json({ error: 'กรุณาระบุจุดลงทะเบียน และเวลาเริ่มต้น-สิ้นสุด ให้ครบถ้วน' });
    }

    const eventContext = await getEventContextFromRequest(req, { requireEventIdentity: true });
    if (!(await assertPointAccess(req.user, pointId, res, { eventContext }))) return;
    const eventId = eventContext.eventId ? String(eventContext.eventId) : null;
    const eventYear = normalizeEventYear(eventContext.eventYear);

    const fromDate = new Date(validFrom);
    const untilDate = new Date(validUntil);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(untilDate.getTime())) {
      return res.status(400).json({ error: 'รูปแบบเวลาไม่ถูกต้อง' });
    }
    if (untilDate <= fromDate || untilDate <= new Date()) {
      return res.status(400).json({ error: 'ช่วงเวลา QR Code ไม่ถูกต้อง' });
    }
    if (untilDate.getTime() - fromDate.getTime() > MAX_SELF_REGISTER_WINDOW_MS) {
      return res.status(400).json({ error: 'QR Code ลงทะเบียนเองมีอายุได้สูงสุด 24 ชั่วโมง' });
    }

    // 🌟 ถ้าเป็น Admin และมีการส่ง forStaffId มา ให้ใช้ forStaffId แทน ID ของคนกดสร้าง
    const isAdmin = req.user.role && (Array.isArray(req.user.role) ? req.user.role.includes('admin') : req.user.role === 'admin');
    let targetStaff = req.user;

    if (isAdmin && forStaffId) {
      targetStaff = await Admin.findById(forStaffId);
      if (!targetStaff) return res.status(404).json({ error: 'ไม่พบเจ้าหน้าที่ที่ระบุ' });
      const roles = Array.isArray(targetStaff.role) ? targetStaff.role : [];
      if (!roles.includes('admin') && !roles.includes('staff')) {
        return res.status(400).json({ error: 'บัญชีเป้าหมายไม่มีสิทธิ์เจ้าหน้าที่' });
      }
      if (!canRegisterAtPoint(targetStaff, pointId)) {
        return res.status(403).json({ error: 'เจ้าหน้าที่ที่เลือกไม่มีสิทธิ์ประจำจุดลงทะเบียนนี้' });
      }
    }

    const payload = {
      role: 'self_register_master',
      pointId,
      eventId,
      eventYear,
      staffId: targetStaff._id,
      nbf: Math.floor(fromDate.getTime() / 1000),
      exp: Math.floor(untilDate.getTime() / 1000)
    };

    const masterToken = jwt.sign(payload, process.env.JWT_SECRET, {
      audience: 'self-register-master',
      issuer: TOKEN_ISSUER
    });
    res.json({ token: masterToken });
  } catch (err) {
    serverError(res, err);
  }
};

// 🌟 [เพิ่มใหม่] ผู้เข้าร่วมใช้ Master Token แลกเป็น Session 15 นาที
exports.requestShortSession = async (req, res) => {
  try {
    const { masterToken } = req.body;
    if (!masterToken) return res.status(400).json({ error: 'ไม่พบ Token ยืนยันตัวตน' });

    // ตรวจสอบความถูกต้องและเวลาของ Master Token
    const decoded = jwt.verify(masterToken, process.env.JWT_SECRET, {
      audience: 'self-register-master',
      issuer: TOKEN_ISSUER
    });

    if (decoded.role !== 'self_register_master') {
      return res.status(403).json({ error: 'Token ไม่ถูกต้องสำหรับโหมดนี้' });
    }

    // ออก Session ใหม่ให้อายุแค่ 15 นาที สำหรับกรอกข้อมูล 1 คน
    const shortToken = jwt.sign(
      {
        role: 'self_register_session',
        pointId: decoded.pointId,
        eventId: decoded.eventId || null,
        eventYear: decoded.eventYear || '',
        staffId: decoded.staffId,
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m', audience: 'self-register-session', issuer: TOKEN_ISSUER }
    );

    res.json({ shortToken, pointId: decoded.pointId, eventId: decoded.eventId || null, eventYear: decoded.eventYear || '' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'QR Code นี้หมดเวลาการใช้งานแล้ว' });
    }
    if (err.name === 'NotBeforeError') {
      return res.status(403).json({ error: 'ยังไม่ถึงเวลาเปิดให้ใช้งาน QR Code นี้' });
    }
    res.status(403).json({ error: 'QR Code ไม่ถูกต้อง หรือถูกยกเลิกแล้ว' });
  }
};

function certificateDisplayName(fields = {}) {
  const candidates = ['name', 'fullName', 'fullname', 'displayName'];
  for (const field of candidates) {
    if (fields[field] === undefined || fields[field] === null || fields[field] === '') continue;
    const value = decryptValue(fields[field]);
    if (value) return String(value).trim();
  }
  return '';
}

function certificateError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function allowLegacyCertificateParticipantId() {
  return process.env.ALLOW_LEGACY_CERTIFICATE_PARTICIPANT_ID === 'true';
}

async function loadCertificateParticipant(rawVerificationId) {
  const verificationId = normalizeCertificateVerificationId(rawVerificationId);
  let participant = null;

  if (verificationId) {
    participant = await Participant.findOne({ certificateVerificationId: verificationId })
      .select('+certificateVerificationId fields status qrCode eventId eventYear checkedInAt isRevoked isDeleted')
      .populate('eventId', 'name eventYear branding config.enabledFeatures.certificate');
  } else if (
    allowLegacyCertificateParticipantId()
    && mongoose.Types.ObjectId.isValid(String(rawVerificationId || ''))
  ) {
    participant = await Participant.findById(rawVerificationId)
      .select('+certificateVerificationId fields status qrCode eventId eventYear checkedInAt isRevoked isDeleted')
      .populate('eventId', 'name eventYear branding config.enabledFeatures.certificate');
  }

  if (!participant || participant.isDeleted) {
    throw certificateError('ไม่พบเอกสาร หรือรหัสตรวจสอบไม่ถูกต้อง', 404, 'CERTIFICATE_NOT_FOUND');
  }

  if (participant.isRevoked) {
    throw certificateError(
      'เอกสารฉบับนี้ถูกเพิกถอนโดยผู้ดูแลระบบแล้ว (Revoked Document)',
      403,
      'CERTIFICATE_REVOKED'
    );
  }

  if (participant.status !== 'checkedIn') {
    throw certificateError(
      'ผู้เข้าร่วมรายนี้ยังไม่ผ่านเงื่อนไขการออกเกียรติบัตร',
      400,
      'CERTIFICATE_NOT_ELIGIBLE'
    );
  }

  if (participant.eventId?.config?.enabledFeatures?.certificate === false) {
    throw certificateError(
      'กิจกรรมนี้ยังไม่ได้เปิดใช้งานเกียรติบัตร',
      403,
      'CERTIFICATE_DISABLED'
    );
  }

  return participant;
}

function certificatePayload(participant, { verificationId = null } = {}) {
  const payload = {
    name: certificateDisplayName(participant.fields || {}),
    eventName: participant.eventId?.name || 'Unknown Event',
    eventYear: participant.eventId?.eventYear || participant.eventYear || '',
    ticketCode: participant.qrCode,
    checkInTime: participant.checkedInAt,
    backgroundImageUrl: participant.eventId?.branding?.coverImageUrl || '',
  };
  if (verificationId) payload.verificationId = verificationId;
  return payload;
}

exports.verifyCertificate = async (req, res) => {
  try {
    const rawVerificationId = req.body?.verificationId || req.params?.verificationId;
    const participant = await loadCertificateParticipant(rawVerificationId);

    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_DECRYPT_CERTIFICATE_VERIFY',
      purpose: 'public_certificate_verification',
      resource: 'participants',
      eventYear: participant.eventYear || participant.eventId?.eventYear || '',
      recordCount: 1,
      fields: ['participant.fields.name'],
      extra: { participantId: String(participant._id), public: true },
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      status: 'valid',
      data: certificatePayload(participant),
    });
  } catch (err) {
    if (err.statusCode) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(err.statusCode).json({
        success: false,
        status: err.code === 'CERTIFICATE_REVOKED' ? 'revoked' : 'invalid',
        code: err.code || 'CERTIFICATE_INVALID',
        message: err.message,
      });
    }
    console.error('Verify Certificate Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

exports.getCertificatePayload = async (req, res) => {
  try {
    const rawVerificationId = req.body?.verificationId || req.params?.verificationId;
    const participant = await loadCertificateParticipant(rawVerificationId);
    const verificationId = await ensureCertificateVerificationId(participant);

    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_DECRYPT_CERTIFICATE_PAYLOAD',
      purpose: 'public_certificate_download_payload',
      resource: 'participants',
      eventYear: participant.eventYear || participant.eventId?.eventYear || '',
      recordCount: 1,
      fields: ['participant.fields.name'],
      extra: { participantId: String(participant._id), public: true },
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: certificatePayload(participant, { verificationId }) });
  } catch (err) {
    if (err.statusCode) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(err.statusCode).json({
        success: false,
        status: err.code === 'CERTIFICATE_REVOKED' ? 'revoked' : 'invalid',
        code: err.code || 'CERTIFICATE_INVALID',
        message: err.message,
      });
    }
    console.error('Certificate Payload Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

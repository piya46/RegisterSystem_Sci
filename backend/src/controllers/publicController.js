// backend/src/controllers/publicController.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Participant = require('../models/participant');
const Admin = require('../models/admin');
const RegistrationPoint = require('../models/registrationPoint');
const Event = require('../models/event');
const RegistrationReuseChallenge = require('../models/registrationReuseChallenge');
const canRegisterAtPoint = require('../helpers/canRegisterAtPoint');
const auditLog = require('../helpers/auditLog');
const { auditSensitiveAccess } = require('../helpers/sensitiveAuditLog');
const { serverError } = require('../utils/httpResponses');
const { eventScopeFromRequest } = require('../utils/eventYear');
const { participantFieldMatch, revealParticipantObject } = require('../utils/fieldEncryption');
const { generateOTP, generateRef, hashOTP, verifyOTP } = require('../utils/otp');
const sendMail = require('../utils/sendMail');

const TOKEN_ISSUER = 'psevent';
const MAX_SELF_REGISTER_WINDOW_MS = 24 * 60 * 60 * 1000;
const PUBLIC_CACHE_TTL_MS = Number(process.env.PUBLIC_CACHE_TTL_MS || 30000);
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

function cacheKey(req, name, eventYear) {
  return `${name}:${eventYear || 'current'}:${req.originalUrl || req.url}`;
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

async function assertPointAccess(user, pointId, res) {
  const point = await RegistrationPoint.findById(pointId);
  if (!point || point.enabled !== true) {
    res.status(400).json({ error: 'ไม่พบจุดลงทะเบียน หรือจุดนี้ถูกปิดใช้งาน' });
    return false;
  }

  if (!canRegisterAtPoint(user, pointId)) {
    res.status(403).json({ error: 'คุณไม่มีสิทธิ์สร้างลิงก์สำหรับจุดลงทะเบียนนี้' });
    return false;
  }

  return true;
}

async function eventForReuse(slug) {
  const event = await Event.findOne({ slug: String(slug || '').trim().toLowerCase() });
  if (!event || !['registration_open', 'active'].includes(event.status)) {
    const error = new Error('กิจกรรมนี้ยังไม่เปิดรับลงทะเบียน');
    error.statusCode = 404;
    throw error;
  }
  if (event.config?.maintenanceMode === true || event.config?.enableRegister === false) {
    const error = new Error('กิจกรรมนี้ยังไม่เปิดรับลงทะเบียน');
    error.statusCode = 403;
    throw error;
  }
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
    const challenge = await RegistrationReuseChallenge.findById(challengeId);
    if (!challenge || String(challenge.targetEventId) !== String(event._id) || challenge.usedAt || challenge.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'รหัสยืนยันหมดอายุหรือไม่ถูกต้อง' });
    }
    if (challenge.attempts >= 5) {
      return res.status(429).json({ success: false, message: 'กรอกรหัสผิดเกินจำนวนครั้งที่กำหนด กรุณาขอรหัสใหม่' });
    }
    if (!verifyOTP(otp, challenge.otpHash)) {
      challenge.attempts += 1;
      await challenge.save();
      return res.status(400).json({ success: false, message: 'รหัส OTP ไม่ถูกต้อง' });
    }
    const participant = await Participant.findById(challenge.participantId).select('+secureIndex +secureSearch');
    if (!participant || participant.isDeleted) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลเดิมที่สามารถดึงมาใช้ได้' });
    }
    challenge.usedAt = new Date();
    await challenge.save();
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
    const { pointId } = req.body;
    if (!pointId) return res.status(400).json({ error: 'ต้องระบุ Registration Point' });
    if (!(await assertPointAccess(req.user, pointId, res))) return;

    const token = jwt.sign(
      { role: 'kiosk_device', pointId, createdBy: req.user._id },
      process.env.JWT_SECRET,
      { expiresIn: '12h', audience: 'kiosk-device', issuer: TOKEN_ISSUER }
    );
    res.json({ token });
  } catch (err) { serverError(res, err); }
};

exports.getPublicReport = async (req, res) => {
  try {
    const eventScope = await eventScopeFromRequest(req, { isDeleted: false, status: 'checkedIn' }, { requireEventIdentity: true, requirePublic: true, requireAccess: false });
    const { eventYear, filter } = eventScope;
    const key = cacheKey(req, 'publicReport', eventYear);
    const cached = getCached(key);
    if (cached) return res.json(cached);

    const participants = (await Participant.find(filter, 'fields.name fields.fullName fields.fullname fields.department fields.dept registeredPoint checkedInAt tags').lean())
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
      let maskedName = name ? name.substring(0, 3) + '***' : 'Unknown';
      return {
        name: maskedName,
        department: p.fields?.department || p.fields?.dept || '',
        point: p.registeredPoint,
        checkedInAt: p.checkedInAt,
        tags: p.tags || []
      };
    });

    const payload = { totalCheckedIn: maskedData.length, data: maskedData };
    setCached(key, payload);
    res.json(payload);
  } catch (err) { serverError(res, err); }
};

exports.getPublicDashboardStats = async (req, res) => {
  try {
    const eventScope = await eventScopeFromRequest(req, { isDeleted: false, status: 'checkedIn' }, { requireEventIdentity: true, requirePublic: true, requireAccess: false });
    const { eventYear, filter } = eventScope;
    const key = cacheKey(req, 'publicDashboard', eventYear);
    const cached = getCached(key);
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
      deptStats: Object.keys(deptCount).map(k => ({ name: k, count: deptCount[k] })).sort((a, b) => b.count - a.count),
      yearStats: Object.keys(yearCount).map(k => ({ name: k, count: yearCount[k] })).sort((a, b) => b.count - a.count),
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

    if (!(await assertPointAccess(req.user, pointId, res))) return;

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
      { role: 'self_register_session', pointId: decoded.pointId, staffId: decoded.staffId },
      process.env.JWT_SECRET,
      { expiresIn: '15m', audience: 'self-register-session', issuer: TOKEN_ISSUER }
    );

    res.json({ shortToken, pointId: decoded.pointId });
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

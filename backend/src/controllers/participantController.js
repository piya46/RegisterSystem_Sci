const ParticipantField = require('../models/participantField');
const Participant = require('../models/participant');
const SystemSetting = require('../models/SystemSetting'); 
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
const { applyEventYearFilter, eventYearOrCurrentFromRequest, getCurrentEventYear, normalizeEventYear } = require('../utils/eventYear');

function checkAdmin(req, res) {
  if (!req.user?.role || !Array.isArray(req.user.role) || !req.user.role.includes('admin')) {
    auditLog && auditLog({ req, action: 'UNAUTHORIZED_ACCESS_PARTICIPANT', detail: 'Not admin', status: 403 });
    res.status(403).json({ error: 'Admin only!' });
    return false;
  }
  return true;
}

exports.createParticipant = async (req, res) => {
  /* โค้ดเดิมคงไว้ ไม่มีการเปลี่ยนแปลง */
  try {
    const setting = await SystemSetting.findOne();
    if (setting) {
      if (!setting.enableRegister) return res.status(403).json({ error: 'ระบบปิดรับการลงทะเบียนชั่วคราว' });
      const now = new Date();
      if (setting.preRegStartDate && now < new Date(setting.preRegStartDate)) return res.status(403).json({ error: 'ยังไม่ถึงเวลาเปิดรับลงทะเบียน' });
      if (setting.preRegEndDate && now > new Date(setting.preRegEndDate)) return res.status(403).json({ error: 'หมดเวลาลงทะเบียนล่วงหน้าแล้ว' });
    }

    const { cfToken } = req.body;
    const isHuman = await verifyTurnstile(cfToken, req.ip);
    
    if (!isHuman) {
      auditLog({ req, action: 'REGISTER_BOT_BLOCK', detail: 'Turnstile verification failed', status: 400 });
      return res.status(400).json({ error: 'ไม่ผ่านการตรวจสอบความปลอดภัย (Turnstile Failed). กรุณาลองใหม่อีกครั้ง' });
    }

    const fieldsDef = await ParticipantField.find({ enabled: true });
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

    const eventYear = normalizeEventYear(req.body.eventYear || await getCurrentEventYear());
    if (userFields.phone) {
      const phoneRegex = /^0[689]\d{8}$/;
      if (!phoneRegex.test(userFields.phone)) return res.status(400).json({ error: 'Phone number format is invalid.' });
      const checkedIn = await isParticipantCheckedIn({ field: 'phone', value: userFields.phone, eventYear });
      if (checkedIn) return res.status(400).json({ error: 'ท่านได้ทำการลงทะเบียนไปแล้ว' });
    }

    const qrCode = uuidv4();

    const participant = await Participant.create({
      fields: protectParticipantFields(userFields),
      secureIndex: participantBlindIndexes(userFields),
      secureSearch: participantSearchTokens(userFields),
      eventYear,
      qrCode,
      registeredBy: req.user?._id || null,
      registrationType: 'online',
      followers,
      consent, 
      specialAssistance: encryptValue(specialAssistance)
    });

    if (userFields.email) {
      try {
        await sendTicketMail(userFields.email, revealParticipantObject(participant));
      } catch (err) {
        auditLog && auditLog({ req, action: 'SEND_TICKET_EMAIL_FAIL', detail: `email=${userFields.email} error=${err.message}`, status: 500 });
      }
    }

    auditLog && auditLog({ req, action: 'CREATE_PARTICIPANT', detail: `participantId=${participant._id}` });
    res.json(revealParticipantObject(participant));
  } catch (err) {
    auditLog && auditLog({ req, action: 'CREATE_PARTICIPANT_ERROR', detail: err.message, status: 500 });
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

    if (!isScopedRegistration && !canRegisterAtPoint(req.user, registrationPoint)) {
      return res.status(403).json({ error: 'You do not have permission to register at this point.' });
    }
    
    // 🌟 2. แปลงให้เป็น String ก่อนเปรียบเทียบ เพื่อป้องกันปัญหาเรื่องประเภทตัวแปร (ObjectId vs String)
    if (isScopedRegistration && (!tokenPoint || String(tokenPoint) !== String(registrationPoint))) {
      return res.status(403).json({ error: 'Kiosk link is invalid for this registration point.' });
    }

    const fieldsDef = await ParticipantField.find({ enabled: true });
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

    const eventYear = normalizeEventYear(req.body.eventYear || await getCurrentEventYear());
    if (userFields.phone) {
      const phoneRegex = /^0[689]\d{8}$/;
      if (!phoneRegex.test(userFields.phone)) return res.status(400).json({ error: 'Phone number format is invalid.' });
      const checkedIn = await isParticipantCheckedIn({ field: 'phone', value: userFields.phone, eventYear });
      if (checkedIn) return res.status(400).json({ error: 'ท่านได้ทำการลงทะเบียน/เช็คอิน ไปแล้ว' });
    }

    const qrCode = uuidv4();
    const participant = await Participant.create({
      fields: protectParticipantFields(userFields),
      secureIndex: participantBlindIndexes(userFields),
      secureSearch: participantSearchTokens(userFields),
      eventYear,
      status: 'checkedIn',
      checkedInAt: new Date(),
      registeredBy: req.user._id,
      qrCode,
      registeredPoint: registrationPoint,
      registrationType: 'onsite',
      followers,
      consent,
      specialAssistance: encryptValue(specialAssistance)
    });

    const safeParticipant = revealParticipantObject(participant);
    res.json({ _id: participant._id, fields: safeParticipant.fields, status: participant.status, checkedInAt: participant.checkedInAt, registeredPoint: participant.registeredPoint, registrationType: participant.registrationType });
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
      eventYear: requestedEventYear,
      specialAssistance,
      ...fields
    } = req.body;
    
    // ตรวจสอบ Turnstile (หากอยู่ใน Production)
    const isValid = await verifyTurnstile(cfToken);
    if (!isValid && process.env.NODE_ENV === 'production') {
      return res.status(400).json({ error: 'Security check failed. Please try again.' });
    }

    if (!fields.name || !fields.phone || !fields.email) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (ชื่อ, อีเมล, เบอร์โทรศัพท์)' });
    }

    const eventYear = normalizeEventYear(requestedEventYear || await getCurrentEventYear());

    // ตรวจสอบข้อมูลซ้ำ
    const existing = await Participant.findOne({
      $and: [
        { isDeleted: false, eventYear },
        {
          $or: [
            participantFieldMatch('email', fields.email),
            participantFieldMatch('phone', fields.phone),
          ],
        },
      ],
    });
    if (existing) return res.status(400).json({ error: 'อีเมลหรือเบอร์โทรนี้ลงทะเบียนในระบบแล้ว' });

    const actualPoint = req.kioskPoint || registrationPoint;
    if (!actualPoint) return res.status(400).json({ error: 'กรุณาระบุจุดลงทะเบียน' });

    // ตรวจสอบสิทธิ์และสถานะของจุดลงทะเบียน
    const canReg = canRegisterAtPoint(req.user, actualPoint);
    if (!canReg) return res.status(400).json({ error: 'จุดลงทะเบียนนี้ปิดใช้งานหรือไม่พบในระบบ' });

    const participant = await Participant.create({
      fields: protectParticipantFields(fields),
      secureIndex: participantBlindIndexes(fields),
      secureSearch: participantSearchTokens(fields),
      eventYear,
      status: 'checkedIn',
      checkedInAt: new Date(),
      registeredPoint: actualPoint,
      registrationType: 'onsite',
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

    res.status(201).json({ message: 'ลงทะเบียนหน้างานสำเร็จ', participant: revealParticipantObject(participant) });
  } catch (err) {
    serverError(res, err);
  }
};

exports.listParticipants = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return;
    const eventYear = await eventYearOrCurrentFromRequest(req);
    const filter = applyEventYearFilter({ isDeleted: false }, eventYear);
    const participants = await Participant.find(filter).sort({ createdAt: -1 }).select('+secureIndex');
    const safeParticipants = participants.map(revealParticipantObject);
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
    const participant = await Participant.findById(req.params.id);
    if (!participant || participant.isDeleted) return res.status(404).json({ error: 'Participant not found' });
    const fieldsDef = await ParticipantField.find({ enabled: true });
    const allowedFields = fieldsDef.map(f => f.name);

    if (req.body.followers !== undefined) participant.followers = Math.max(0, Number.parseInt(req.body.followers, 10) || 0);
    if (req.body.consent !== undefined) participant.consent = req.body.consent;
    if (req.body.specialAssistance !== undefined) participant.specialAssistance = encryptValue(req.body.specialAssistance);
    
    // [เพิ่ม] บันทึก Tags ถ้ามีการส่งมา
    if (req.body.tags !== undefined && Array.isArray(req.body.tags)) {
      participant.tags = req.body.tags;
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
    if (req.body.eventYear !== undefined) participant.eventYear = normalizeEventYear(req.body.eventYear);

    participant.fields = protectParticipantFields(plainFields);
    participant.secureIndex = participantBlindIndexes(plainFields);
    participant.secureSearch = participantSearchTokens(plainFields);
    participant.markModified('fields'); participant.markModified('secureIndex'); participant.markModified('secureSearch'); participant.updatedAt = new Date();
    await participant.save();
    res.json(revealParticipantObject(participant));
  } catch (err) { serverError(res, err); }
};

exports.deleteParticipant = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return;
    const participant = await Participant.findById(req.params.id);
    if (!participant || participant.isDeleted) return res.status(404).json({ error: 'Participant not found' });
    participant.isDeleted = true;
    await participant.save();
    res.json({ message: 'Participant deleted (soft)' });
  } catch (err) { serverError(res, err); }
};

exports.checkinByQr = async (req, res) => {
  try {
    const { qrCode, registrationPoint } = req.body;
    const followers = req.body.followers != null ? Math.max(0, Number.parseInt(req.body.followers, 10) || 0) : undefined;
    if (!qrCode) return res.status(400).json({ error: 'qrCode is required.' });
    if (!registrationPoint) return res.status(400).json({ error: 'registrationPoint is required.' });
    
    // [แก้ไข] รองรับ Kiosk token
    const isKioskDevice = req.user.role?.includes('kiosk_device') || req.user.role?.includes('kiosk');
    if (!isKioskDevice && !canRegisterAtPoint(req.user, registrationPoint)) {
      return res.status(403).json({ error: 'You do not have permission to check-in at this point.' });
    }

    const eventYear = await eventYearOrCurrentFromRequest(req);
    const participant = await Participant.findOne(applyEventYearFilter({ qrCode, isDeleted: false }, eventYear));
    if (!participant) return res.status(404).json({ error: 'Ticket not found' });
    if (participant.status === 'checkedIn') return res.status(400).json({ error: 'Already checked in.' });

    if (followers !== undefined) participant.followers = followers;
    participant.status = 'checkedIn'; participant.checkedInAt = new Date(); participant.registeredBy = req.user._id; participant.registeredPoint = registrationPoint;
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
            registeredBy: req.user.username, 
            registrationType: participant.registrationType, 
            followers: participant.followers,
            tags: participant.tags // ✅ เพิ่มตรงนี้เพื่อให้ส่งคืน Tag กลับไปด้วย
        } 
    });
  } catch (err) { serverError(res, err); }
};

exports.resendTicket = async (req, res) => {
  // โค้ดเดิม
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone is required.' });
  const phoneRegex = /^0[689]\d{8}$/;
  if (!phoneRegex.test(phone)) return res.status(400).json({ error: 'Phone number format is invalid.' });
  const eventYear = await eventYearOrCurrentFromRequest(req);
  const participant = await Participant.findOne({
    $and: [
      applyEventYearFilter({ isDeleted: false }, eventYear),
      participantFieldMatch('phone', phone),
    ],
  }).select('+secureIndex');
  const genericResponse = { success: true, message: 'หากพบข้อมูลในระบบ ระบบจะส่ง E-Ticket ไปยังอีเมลที่ลงทะเบียนไว้' };
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
      await sendTicketMail(email, safeParticipant);
      return res.json(genericResponse);
    } catch (err) {
      auditLog && auditLog({ req, action: 'RESEND_TICKET_FAIL', detail: `phone=${phone} error=${err.message}`, status: 500 });
      return res.json(genericResponse);
    }
  } else { return res.json(genericResponse); }
};

exports.searchParticipants = async (req, res) => {
  try {
    const { phone, name, email, qrCode, q } = req.query;
    const eventYear = await eventYearOrCurrentFromRequest(req);
    let filter = applyEventYearFilter({ isDeleted: false }, eventYear);
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
        const safe = revealParticipantObject(participant);
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
      const matches = scanned.map(revealParticipantObject).filter((participant) => {
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
    const safeResults = results.map(revealParticipantObject);
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
    if (!checkAdmin(req, res)) return;
    const { status } = req.query;
    const eventYear = await eventYearOrCurrentFromRequest(req);
    const find = applyEventYearFilter({ isDeleted: false }, eventYear);
    if (status) find.status = status;

    const participants = (await Participant.find(find).populate('registeredBy', 'username fullName email').select('+secureIndex')).map(revealParticipantObject);
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
        p.registeredPoint?.name || p.registeredPoint?.pointName || p.registeredPoint || '',
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
    res.send(`\uFEFF${csv}`);
  } catch (err) { serverError(res, err); }
};

exports.restorePrizeRight = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return; 
    const participant = await Participant.findByIdAndUpdate(
      req.params.id, 
      { isForfeited: false }, 
      { new: true }
    );
    if (!participant) return res.status(404).json({ error: 'ไม่พบผู้เข้าร่วม' });
    res.json({ message: 'คืนสิทธิ์จับรางวัลสำเร็จ', participant });
  } catch (err) {
    serverError(res, err);
  }
};

const ParticipantField = require('../models/participantField');
const Participant = require('../models/participant');
const { v4: uuidv4 } = require('uuid');
const canRegisterAtPoint = require('../helpers/canRegisterAtPoint');
const { isParticipantCheckedIn } = require('../helpers/checkInStatusService');
const auditLog = require('../helpers/auditLog');
const sendTicketMail = require('../utils/sendTicketMail');
const verifyTurnstile = require('../utils/verifyTurnstile'); // ตรวจสอบว่าไฟล์นี้ถูกสร้างแล้ว

function checkAdmin(req, res) {
  if (!req.user?.role || !Array.isArray(req.user.role) || !req.user.role.includes('admin')) {
    auditLog && auditLog({
      req,
      action: 'UNAUTHORIZED_ACCESS_PARTICIPANT',
      detail: 'Not admin',
      status: 403
    });
    res.status(403).json({ error: 'Admin only!' });
    return false;
  }
  return true;
}

// === Public Pre-registration ===
exports.createParticipant = async (req, res) => {
  try {
    // 1. ตรวจสอบ Turnstile Token ก่อนทำอย่างอื่น
    const { cfToken } = req.body;
    // หมายเหตุ: ต้องแน่ใจว่าสร้างไฟล์ verifyTurnstile.js แล้ว
    // ถ้ายังไม่มี หรือยังไม่พร้อมใช้งาน ให้ comment บรรทัดข้างล่างนี้ชั่วคราว
    const isHuman = await verifyTurnstile(cfToken, req.ip);
    
    if (!isHuman) {
      auditLog({ req, action: 'REGISTER_BOT_BLOCK', detail: 'Turnstile verification failed', status: 400 });
      return res.status(400).json({ error: 'ไม่ผ่านการตรวจสอบความปลอดภัย (Turnstile Failed). กรุณาลองใหม่อีกครั้ง' });
    }

    const fieldsDef = await ParticipantField.find({ enabled: true });
    const allowedFields = fieldsDef.map(f => f.name);
    const requiredFields = fieldsDef.filter(f => f.required).map(f => f.name);

    // followers เป็นจำนวนเท่านั้น
    const followers = Math.max(0, Number.parseInt(req.body.followers || 0, 10) || 0);
    // [ใหม่] รับค่า consent
    const consent = req.body.consent;

    const userFields = {};
    for (const f of allowedFields) {
      if (req.body[f] !== undefined) userFields[f] = req.body[f];
    }
    for (const f of requiredFields) {
      if (!userFields[f]) return res.status(400).json({ error: `Field ${f} is required` });
    }

    // [ใหม่] Validation: ตรวจสอบปีการศึกษา (date_year) ต้องเป็น พ.ศ. (> 2400)
    if (userFields.date_year) {
      const yearVal = parseInt(userFields.date_year, 10);
      // ถ้าใส่มาเป็นตัวเลข แต่ค่าน้อยกว่า 2400 (เดาว่าเป็น ค.ศ.) ให้ reject
      if (!isNaN(yearVal) && yearVal < 2400) {
        return res.status(400).json({ error: 'กรุณากรอกปีการศึกษาเป็น พ.ศ. (เช่น 2569)' });
      }
    }

    // ตรวจสอบเบอร์โทร format และเช็คซ้ำ
    if (userFields.phone) {
      const phoneRegex = /^0[689]\d{8}$/;
      if (!phoneRegex.test(userFields.phone)) {
        return res.status(400).json({ error: 'Phone number format is invalid.' });
      }
      const checkedIn = await isParticipantCheckedIn({ field: 'phone', value: userFields.phone });
      if (checkedIn) {
        return res.status(400).json({ error: 'ท่านได้ทำการลงทะเบียนไปแล้ว' });
      }
    }

    const qrCode = uuidv4();

    const participant = await Participant.create({
      fields: userFields,
      qrCode,
      registeredBy: req.user?._id || null,
      registrationType: 'online',
      followers,
      consent // [ใหม่] บันทึกลงฐานข้อมูล
    });

    // ส่งอีเมล E-ticket ถ้ามีอีเมล
    if (userFields.email) {
      try {
        await sendTicketMail(userFields.email, participant);
      } catch (err) {
        auditLog && auditLog({
          req,
          action: 'SEND_TICKET_EMAIL_FAIL',
          detail: `email=${userFields.email} error=${err.message}`,
          status: 500
        });
      }
    }

    auditLog && auditLog({ req, action: 'CREATE_PARTICIPANT', detail: `participantId=${participant._id}` });
    res.json(participant);
  } catch (err) {
    auditLog && auditLog({ req, action: 'CREATE_PARTICIPANT_ERROR', detail: err.message, status: 500 });
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
};

// ... (ส่วนอื่นๆ ของไฟล์คงเดิม ไม่มีการเปลี่ยนแปลง) ...
// === Staff Onsite Registration + Instant Check-in ===
exports.createParticipantByStaff = async (req, res) => {
  try {
    const { registrationPoint } = req.body;
    if (!canRegisterAtPoint(req.user, registrationPoint)) {
      auditLog && auditLog({
        req,
        action: 'STAFF_CHECKIN_PARTICIPANT_FAIL',
        detail: `Unauthorized at point: ${registrationPoint}`,
        status: 403
      });
      return res.status(403).json({ error: 'You do not have permission to register at this point.' });
    }

    const fieldsDef = await ParticipantField.find({ enabled: true });
    const allowedFields = fieldsDef.map(f => f.name);
    const requiredFields = fieldsDef.filter(f => f.required).map(f => f.name);

    const followers = Math.max(0, Number.parseInt(req.body.followers || 0, 10) || 0);

    const userFields = {};
    for (const f of allowedFields) {
      if (req.body[f] !== undefined) userFields[f] = req.body[f];
    }
    for (const f of requiredFields) {
      if (!userFields[f]) {
        return res.status(400).json({ error: `Field '${f}' is required.` });
      }
    }

    // ตรวจสอบเบอร์โทร format และเช็คซ้ำ
    if (userFields.phone) {
      const phoneRegex = /^0[689]\d{8}$/;
      if (!phoneRegex.test(userFields.phone)) {
        return res.status(400).json({ error: 'Phone number format is invalid.' });
      }
      const checkedIn = await isParticipantCheckedIn({ field: 'phone', value: userFields.phone });
      if (checkedIn) {
        return res.status(400).json({ error: 'This phone number already checked in.' });
      }
    }

    const qrCode = uuidv4();
    const participant = await Participant.create({
      fields: userFields,
      status: 'checkedIn',
      checkedInAt: new Date(),
      registeredBy: req.user._id,
      qrCode,
      registeredPoint: registrationPoint,
      registrationType: 'onsite',
      followers
    });

    auditLog && auditLog({
      req,
      action: 'STAFF_CHECKIN_PARTICIPANT',
      detail: `registeredPoint=${registrationPoint}, by=${req.user.username}, participantId=${participant._id}`
    });

    return res.json({
      _id: participant._id,
      fields: participant.fields,
      status: participant.status,
      checkedInAt: participant.checkedInAt,
      registeredPoint: participant.registeredPoint,
      registrationType: participant.registrationType
    });
  } catch (err) {
    auditLog && auditLog({
      req,
      action: 'STAFF_CHECKIN_PARTICIPANT_ERROR',
      detail: err.message,
      status: 500
    });
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
};

// === Admin list ===
exports.listParticipants = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return;
    const participants = await Participant.find({ isDeleted: false }).sort({ createdAt: -1 });
    res.json(participants);
  } catch (err) {
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
};

// === Admin update ===
exports.updateParticipant = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return;

    const participant = await Participant.findById(req.params.id);
    if (!participant || participant.isDeleted) return res.status(404).json({ error: 'Participant not found' });

    const fieldsDef = await ParticipantField.find({ enabled: true });
    const allowedFields = fieldsDef.map(f => f.name);

    // รองรับอัปเดต followers (จำนวนเท่านั้น)
    if (req.body.followers !== undefined) {
      participant.followers = Math.max(0, Number.parseInt(req.body.followers, 10) || 0);
    }

    // รองรับการอัปเดต consent จากแอดมิน (ถ้าต้องการ)
    if (req.body.consent !== undefined) {
      participant.consent = req.body.consent;
    }

    // -- ใช้ req.body.fields --
    const inputFields = req.body.fields || req.body;
    for (const f of allowedFields) {
      if (inputFields[f] !== undefined) {
        participant.fields[f] = inputFields[f];
      }
    }

    participant.markModified('fields');
    participant.updatedAt = new Date();
    await participant.save();

    auditLog && auditLog({ req, action: 'UPDATE_PARTICIPANT', detail: `participantId=${participant._id}` });
    res.json(participant);
  } catch (err) {
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
};

// === Soft delete ===
exports.deleteParticipant = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return;

    const participant = await Participant.findById(req.params.id);
    if (!participant || participant.isDeleted) return res.status(404).json({ error: 'Participant not found' });

    participant.isDeleted = true;
    await participant.save();

    auditLog && auditLog({ req, action: 'DELETE_PARTICIPANT', detail: `participantId=${participant._id}` });
    res.json({ message: 'Participant deleted (soft)' });
  } catch (err) {
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
};

// === Check-in by QR ===
exports.checkinByQr = async (req, res) => {
  try {
    const { qrCode, registrationPoint } = req.body;
    const followers = req.body.followers != null
      ? Math.max(0, Number.parseInt(req.body.followers, 10) || 0)
      : undefined;

    if (!qrCode) return res.status(400).json({ error: 'qrCode is required.' });
    if (!registrationPoint) return res.status(400).json({ error: 'registrationPoint is required.' });

    // ตรวจสอบสิทธิ์
    if (!canRegisterAtPoint(req.user, registrationPoint)) {
      return res.status(403).json({ error: 'You do not have permission to check-in at this point.' });
    }

    // หา participant
    const participant = await Participant.findOne({ qrCode, isDeleted: false });
    if (!participant) return res.status(404).json({ error: 'Ticket not found' });

    // เช็คซ้ำ
    if (participant.status === 'checkedIn') {
      return res.status(400).json({ error: 'Already checked in.' });
    }

    // อัปเดต followers ถ้ามีส่งมา
    if (followers !== undefined) {
      participant.followers = followers;
    }

    // ทำการ checked-in
    participant.status = 'checkedIn';
    participant.checkedInAt = new Date();
    participant.registeredBy = req.user._id;
    participant.registeredPoint = registrationPoint;
    // ไม่ทับ registrationType

    await participant.save();

    // log...
    auditLog && auditLog({
      req,
      action: 'CHECKIN_BY_QR',
      detail: `participantId=${participant._id} by=${req.user.username} at=${registrationPoint}`
    });

    res.json({
      message: 'Check-in successful',
      participant: {
        _id: participant._id,
        fields: participant.fields,
        checkedInAt: participant.checkedInAt,
        registeredPoint: participant.registeredPoint,
        registeredBy: req.user.username,
        registrationType: participant.registrationType,
        followers: participant.followers
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
};

// === Resend ticket ===
exports.resendTicket = async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone is required.' });

  // หา participant (เฉพาะที่ไม่ได้ลบ)
  const participant = await Participant.findOne({ 'fields.phone': phone, isDeleted: false });
  if (!participant) {
    return res.status(404).json({ found: false, message: 'ไม่พบข้อมูลในระบบ' });
  }
  // ถ้ามี email ส่ง ticket ไปใหม่
  const email = participant.fields.email;
  if (email) {
    try {
      await sendTicketMail(email, participant);
      return res.json({ found: true, sent: true, message: 'ส่งอีเมลแล้ว' });
    } catch (err) {
      console.error('SENDGRID ERROR', err.response?.body || err);
      return res.status(500).json({ found: true, sent: false, message: 'พบข้อมูลแต่ส่งอีเมลไม่ได้', error: err.message });
    }
  } else {
    return res.json({ found: true, sent: false, message: 'พบข้อมูลในระบบแต่ไม่ได้กรอกอีเมล' });
  }
};

exports.searchParticipants = async (req, res) => {
  if (!checkAdmin(req, res)) return;

  const { phone, name, email, qrCode, q } = req.query;
  let filter = { isDeleted: false };

  if (q) {
    filter.$or = [
      { 'fields.name': { $regex: q, $options: 'i' } },
      { 'fields.phone': q },
      { 'fields.email': q },
      { qrCode: q }
    ];
  } else {
    if (phone) filter['fields.phone'] = phone;
    if (name) filter['fields.name'] = { $regex: name, $options: 'i' };
    if (email) filter['fields.email'] = email;
    if (qrCode) filter['qrCode'] = qrCode;
  }

  const results = await Participant.find(filter);
  res.json(results);
};

// === Export participants to Excel ===
exports.exportParticipants = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return;

    // เลือก filter ได้ตามต้องการผ่าน query (optional)
    const { status } = req.query;
    const find = { isDeleted: false };
    if (status) find.status = status;

    // เติม populate
    const participants = await Participant.find(find)
      .populate('registeredBy', 'username fullName email')
      .lean();

    // lazy import
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Participants');

    // หัวตาราง
    ws.columns = [
      { header: 'No.', key: 'no', width: 6 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Department', key: 'department', width: 24 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'RegisteredAt', key: 'registeredAt', width: 20 },
      { header: 'CheckedInAt', key: 'checkedInAt', width: 20 },
      { header: 'RegistrationPoint', key: 'registeredPoint', width: 26 },
      { header: 'RegistrationType', key: 'registrationType', width: 14 },
      { header: 'Followers', key: 'followers', width: 12 },
      { header: 'Consent', key: 'consent', width: 12 }, // [ใหม่] เพิ่ม Consent ใน Export
      { header: 'QR Code', key: 'qrCode', width: 38 },
      { header: 'RegisteredBy', key: 'registeredBy', width: 22 },
    ];

    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: 'A1', to: 'N1' }; // ปรับ Range autoFilter

    // เติมข้อมูล
    participants.forEach((p, idx) => {
      const f = p.fields || {};
      const name = f.name || f.fullName || f.fullname || '';
      const phone = f.phone || '';
      const email = f.email || '';
      const department = f.department || f.faculty || '';
      const statusText = p.status || 'registered';
      const registeredAt = p.createdAt ? new Date(p.createdAt) : null;
      const checkedInAt = p.checkedInAt ? new Date(p.checkedInAt) : null;
      const registeredPoint =
        p.registeredPoint?.name ||
        p.registeredPoint?.pointName ||
        p.registeredPoint ||
        '';
      const regType = p.registrationType || '';
      const followers = Number.isFinite(p.followers) ? p.followers : 0;
      const qrCode = p.qrCode || '';
      const consentText = p.consent || '-'; // [ใหม่]
      const regBy =
        (p.registeredBy && (p.registeredBy.fullName || p.registeredBy.username || p.registeredBy.email)) ||
        (typeof p.registeredBy === 'string' ? p.registeredBy : '') ||
        '';

      ws.addRow({
        no: idx + 1,
        name,
        phone,
        email,
        department,
        status: statusText,
        registeredAt,
        checkedInAt,
        registeredPoint,
        registrationType: regType,
        followers,
        consent: consentText, // [ใหม่]
        qrCode,
        registeredBy: regBy,
      });
    });

    const dateFmt = (c) => {
      if (!c.value) return;
      try {
        const d = new Date(c.value);
        if (!isNaN(d.getTime())) {
          c.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
            .toISOString()
            .replace('T', ' ')
            .slice(0, 19);
        }
      } catch {}
    };
    ws.getColumn('registeredAt').eachCell((c, i) => { if (i !== 1) dateFmt(c); });
    ws.getColumn('checkedInAt').eachCell((c, i) => { if (i !== 1) dateFmt(c); });

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const fileName = `participants-${y}${m}${d}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    auditLog && auditLog({
      req,
      action: 'EXPORT_PARTICIPANTS_ERROR',
      detail: err.message,
      status: 500
    });
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
};
const ParticipantField = require('../models/participantField');
const Participant = require('../models/participant');
const SystemSetting = require('../models/SystemSetting'); 
const { v4: uuidv4 } = require('uuid');
const canRegisterAtPoint = require('../helpers/canRegisterAtPoint');
const { isParticipantCheckedIn } = require('../helpers/checkInStatusService');
const auditLog = require('../helpers/auditLog');
const { sendTicketMail } = require('../utils/sendTicketMail');
const verifyTurnstile = require('../utils/verifyTurnstile'); 

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

    if (userFields.phone) {
      const phoneRegex = /^0[689]\d{8}$/;
      if (!phoneRegex.test(userFields.phone)) return res.status(400).json({ error: 'Phone number format is invalid.' });
      const checkedIn = await isParticipantCheckedIn({ field: 'phone', value: userFields.phone });
      if (checkedIn) return res.status(400).json({ error: 'ท่านได้ทำการลงทะเบียนไปแล้ว' });
    }

    const qrCode = uuidv4();

    const participant = await Participant.create({
      fields: userFields,
      qrCode,
      registeredBy: req.user?._id || null,
      registrationType: 'online',
      followers,
      consent, 
      specialAssistance 
    });

    if (userFields.email) {
      try {
        await sendTicketMail(userFields.email, participant);
      } catch (err) {
        auditLog && auditLog({ req, action: 'SEND_TICKET_EMAIL_FAIL', detail: `email=${userFields.email} error=${err.message}`, status: 500 });
      }
    }

    auditLog && auditLog({ req, action: 'CREATE_PARTICIPANT', detail: `participantId=${participant._id}` });
    res.json(participant);
  } catch (err) {
    auditLog && auditLog({ req, action: 'CREATE_PARTICIPANT_ERROR', detail: err.message, status: 500 });
    res.status(500).json({ error: 'Server error', detail: err.message });
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
    const isKioskDevice = req.user.role?.includes('kiosk_device') || req.user.role?.includes('kiosk');
    
    // 🌟 1. ดึงค่า Point จาก Token รองรับทั้ง req.kioskPoint และ req.user.kioskPoint
    const tokenPoint = req.kioskPoint || req.user?.kioskPoint;

    if (!isKioskDevice && !canRegisterAtPoint(req.user, registrationPoint)) {
      return res.status(403).json({ error: 'You do not have permission to register at this point.' });
    }
    
    // 🌟 2. แปลงให้เป็น String ก่อนเปรียบเทียบ เพื่อป้องกันปัญหาเรื่องประเภทตัวแปร (ObjectId vs String)
    if (isKioskDevice && tokenPoint && String(tokenPoint) !== String(registrationPoint)) {
      return res.status(403).json({ error: 'Kiosk link is invalid for this registration point.' });
    }

    const fieldsDef = await ParticipantField.find({ enabled: true });
    const allowedFields = fieldsDef.map(f => f.name);
    const requiredFields = fieldsDef.filter(f => f.required).map(f => f.name);
    const followers = Math.max(0, Number.parseInt(req.body.followers || 0, 10) || 0);
    const consent = req.body.consent;

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
      const checkedIn = await isParticipantCheckedIn({ field: 'phone', value: userFields.phone });
      if (checkedIn) return res.status(400).json({ error: 'ท่านได้ทำการลงทะเบียน/เช็คอิน ไปแล้ว' });
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
      followers,
      consent
    });

    res.json({ _id: participant._id, fields: participant.fields, status: participant.status, checkedInAt: participant.checkedInAt, registeredPoint: participant.registeredPoint, registrationType: participant.registrationType });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
};

exports.registerOnsite = async (req, res) => {
  try {
    const { cfToken, consent, followers, registrationPoint, ...fields } = req.body;
    
    // ตรวจสอบ Turnstile (หากอยู่ใน Production)
    const isValid = await verifyTurnstile(cfToken);
    if (!isValid && process.env.NODE_ENV === 'production') {
      return res.status(400).json({ error: 'Security check failed. Please try again.' });
    }

    if (!fields.name || !fields.phone || !fields.email) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (ชื่อ, อีเมล, เบอร์โทรศัพท์)' });
    }

    // ตรวจสอบข้อมูลซ้ำ
    const existing = await Participant.findOne({
      $or: [{ 'fields.email': fields.email }, { 'fields.phone': fields.phone }],
      isDeleted: false
    });
    if (existing) return res.status(400).json({ error: 'อีเมลหรือเบอร์โทรนี้ลงทะเบียนในระบบแล้ว' });

    const actualPoint = req.kioskPoint || registrationPoint;
    if (!actualPoint) return res.status(400).json({ error: 'กรุณาระบุจุดลงทะเบียน' });

    // ตรวจสอบสิทธิ์และสถานะของจุดลงทะเบียน
    const canReg = await canRegisterAtPoint(actualPoint);
    if (!canReg) return res.status(400).json({ error: 'จุดลงทะเบียนนี้ปิดใช้งานหรือไม่พบในระบบ' });

    const participant = await Participant.create({
      fields: fields,
      status: 'checkedIn',
      checkedInAt: new Date(),
      registeredPoint: actualPoint,
      registrationType: 'onsite',
      followers: parseInt(followers, 10) || 0,
      consent: consent === 'agreed' ? 'agreed' : 'disagreed',
      qrCode: `ON-${uuidv4()}`,
      
      // 🌟 บันทึกสตาฟผู้ดูแล (ดึงจาก Token ที่ใช้ลงทะเบียน)
      registeredBy: req.user ? req.user._id : null,
      
      // 🌟 ใส่ Tag เพื่อให้แอดมินเช็คได้ว่าเป็นงาน Self Service
      tags: req.registrationMethod === 'Self-Service (QR)' 
            ? ['Walk-in', 'Self-Service'] 
            : ['Walk-in', 'Staff-Assisted']
    });

    // อัปเดตสถิติจุดลงทะเบียน
    await checkInStatusService.updatePointStats(actualPoint, 1);

    // บันทึก Log การกระทำ
    if (req.user && req.user._id) {
       await auditLog(req.user._id, 'CREATE_PARTICIPANT_ONSITE', `Method: ${req.registrationMethod}`, participant._id);
    }

    res.status(201).json({ message: 'ลงทะเบียนหน้างานสำเร็จ', participant });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
};

exports.listParticipants = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return;
    const participants = await Participant.find({ isDeleted: false }).sort({ createdAt: -1 });
    res.json(participants);
  } catch (err) { res.status(500).json({ error: 'Server error', detail: err.message }); }
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
    if (req.body.specialAssistance !== undefined) participant.specialAssistance = req.body.specialAssistance;
    
    // [เพิ่ม] บันทึก Tags ถ้ามีการส่งมา
    if (req.body.tags !== undefined && Array.isArray(req.body.tags)) {
      participant.tags = req.body.tags;
    }

    const inputFields = req.body.fields || req.body;
    for (const f of allowedFields) { if (inputFields[f] !== undefined) participant.fields[f] = inputFields[f]; }

    participant.markModified('fields'); participant.updatedAt = new Date();
    await participant.save();
    res.json(participant);
  } catch (err) { res.status(500).json({ error: 'Server error', detail: err.message }); }
};

exports.deleteParticipant = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return;
    const participant = await Participant.findById(req.params.id);
    if (!participant || participant.isDeleted) return res.status(404).json({ error: 'Participant not found' });
    participant.isDeleted = true;
    await participant.save();
    res.json({ message: 'Participant deleted (soft)' });
  } catch (err) { res.status(500).json({ error: 'Server error', detail: err.message }); }
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

    const participant = await Participant.findOne({ qrCode, isDeleted: false });
    if (!participant) return res.status(404).json({ error: 'Ticket not found' });
    if (participant.status === 'checkedIn') return res.status(400).json({ error: 'Already checked in.' });

    if (followers !== undefined) participant.followers = followers;
    participant.status = 'checkedIn'; participant.checkedInAt = new Date(); participant.registeredBy = req.user._id; participant.registeredPoint = registrationPoint;
    await participant.save();
res.json({ 
        message: 'Check-in successful', 
        participant: { 
            _id: participant._id, 
            fields: participant.fields, // ข้อมูล fields จะถูกถอดรหัส (Decrypt) อัตโนมัติก่อนส่งกลับ
            checkedInAt: participant.checkedInAt, 
            registeredPoint: participant.registeredPoint, 
            registeredBy: req.user.username, 
            registrationType: participant.registrationType, 
            followers: participant.followers,
            tags: participant.tags // ✅ เพิ่มตรงนี้เพื่อให้ส่งคืน Tag กลับไปด้วย
        } 
    });  } catch (err) { res.status(500).json({ error: 'Server error', detail: err.message }); }
};

exports.resendTicket = async (req, res) => {
  // โค้ดเดิม
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone is required.' });
  const participant = await Participant.findOne({ 'fields.phone': phone, isDeleted: false });
  if (!participant) return res.status(404).json({ found: false, message: 'ไม่พบข้อมูลในระบบ' });
  const email = participant.fields.email;
  if (email) {
    try {
      await sendTicketMail(email, participant);
      return res.json({ found: true, sent: true, message: 'ส่งอีเมลแล้ว' });
    } catch (err) { return res.status(500).json({ found: true, sent: false, message: 'พบข้อมูลแต่ส่งอีเมลไม่ได้', error: err.message }); }
  } else { return res.json({ found: true, sent: false, message: 'พบข้อมูลในระบบแต่ไม่ได้กรอกอีเมล' }); }
};

exports.searchParticipants = async (req, res) => {
  // โค้ดเดิม
  const { phone, name, email, qrCode, q } = req.query;
  let filter = { isDeleted: false };
  if (q) { filter.$or = [ { 'fields.name': { $regex: q, $options: 'i' } }, { 'fields.phone': q }, { 'fields.email': q }, { qrCode: q } ]; } 
  else {
    if (phone) filter['fields.phone'] = phone;
    if (name) filter['fields.name'] = { $regex: name, $options: 'i' };
    if (email) filter['fields.email'] = email;
    if (qrCode) filter['qrCode'] = qrCode;
  }
  const results = await Participant.find(filter);
  res.json(results);
};

exports.exportParticipants = async (req, res) => {
  // โค้ดเดิม เพิ่ม Export Tag ถ้าต้องการ
  try {
    if (!checkAdmin(req, res)) return;
    const { status } = req.query;
    const find = { isDeleted: false };
    if (status) find.status = status;

    const participants = await Participant.find(find).populate('registeredBy', 'username fullName email').lean();
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Participants');

    ws.columns = [
      { header: 'No.', key: 'no', width: 6 }, { header: 'Name', key: 'name', width: 28 }, { header: 'Phone', key: 'phone', width: 16 }, { header: 'Email', key: 'email', width: 28 }, { header: 'Department', key: 'department', width: 24 }, { header: 'Address', key: 'address', width: 40 }, { header: 'ZipCode', key: 'zipcode', width: 15 }, { header: 'Status', key: 'status', width: 14 }, { header: 'RegisteredAt', key: 'registeredAt', width: 20 }, { header: 'CheckedInAt', key: 'checkedInAt', width: 20 }, { header: 'RegistrationPoint', key: 'registeredPoint', width: 26 }, { header: 'RegistrationType', key: 'registrationType', width: 14 }, { header: 'Followers', key: 'followers', width: 12 }, { header: 'Consent', key: 'consent', width: 12 }, { header: 'SpecialAssistance', key: 'specialAssistance', width: 20 }, { header: 'Tags', key: 'tags', width: 20 }, { header: 'QR Code', key: 'qrCode', width: 38 }, { header: 'RegisteredBy', key: 'registeredBy', width: 22 },
    ];
    ws.getRow(1).font = { bold: true }; ws.views = [{ state: 'frozen', ySplit: 1 }]; ws.autoFilter = { from: 'A1', to: 'Q1' };

    participants.forEach((p, idx) => {
      const f = p.fields || {};
      ws.addRow({
        no: idx + 1, name: f.name || f.fullName || f.fullname || '', phone: f.phone || '', email: f.email || '', department: f.department || f.faculty || '', address: f.usr_add || '-', zipcode: f.usr_add_post || '-', status: p.status || 'registered', registeredAt: p.createdAt ? new Date(p.createdAt) : null, checkedInAt: p.checkedInAt ? new Date(p.checkedInAt) : null, registeredPoint: p.registeredPoint?.name || p.registeredPoint?.pointName || p.registeredPoint || '', registrationType: p.registrationType || '', followers: Number.isFinite(p.followers) ? p.followers : 0, consent: p.consent || '-', specialAssistance: p.specialAssistance || '-', tags: p.tags ? p.tags.join(', ') : '-', qrCode: p.qrCode || '', registeredBy: (p.registeredBy && (p.registeredBy.fullName || p.registeredBy.username || p.registeredBy.email)) || (typeof p.registeredBy === 'string' ? p.registeredBy : '') || '',
      });
    });

    const dateFmt = (c) => { if (!c.value) return; try { const d = new Date(c.value); if (!isNaN(d.getTime())) c.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().replace('T', ' ').slice(0, 19); } catch {} };
    ws.getColumn('registeredAt').eachCell((c, i) => { if (i !== 1) dateFmt(c); }); ws.getColumn('checkedInAt').eachCell((c, i) => { if (i !== 1) dateFmt(c); });

    const now = new Date(); const fileName = `participants-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await wb.xlsx.write(res); res.end();
  } catch (err) { res.status(500).json({ error: 'Server error', detail: err.message }); }
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
    res.status(500).json({ error: 'Server error' });
  }
};
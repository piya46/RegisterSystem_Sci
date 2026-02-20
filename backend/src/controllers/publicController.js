// backend/src/controllers/publicController.js
const jwt = require('jsonwebtoken');
const Participant = require('../models/participant');

exports.generateKioskToken = async (req, res) => {
  try {
    const { pointId } = req.body;
    if (!pointId) return res.status(400).json({ error: 'ต้องระบุ Registration Point' });

    const token = jwt.sign(
      { role: 'kiosk_device', pointId, createdBy: req.user._id },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({ token });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.getPublicReport = async (req, res) => {
  try {
    const participants = await Participant.find({ isDeleted: false, status: 'checkedIn' }, 'fields.name fields.department registeredPoint checkedInAt tags').lean();

    const maskedData = participants.map(p => {
      let maskedName = p.fields?.name ? p.fields.name.substring(0, 3) + '***' : 'Unknown';
      return {
        name: maskedName,
        department: p.fields?.department || '',
        point: p.registeredPoint,
        checkedInAt: p.checkedInAt,
        tags: p.tags || []
      };
    });

    res.json({ totalCheckedIn: maskedData.length, data: maskedData });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.getPublicDashboardStats = async (req, res) => {
  try {
    const participants = await Participant.find(
      { isDeleted: false, status: 'checkedIn' },
      'fields.dept fields.date_year followers'
    ).lean();

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

    res.json({
      totalCheckedIn,
      totalFollowers,
      totalAttendees: totalCheckedIn + totalFollowers,
      deptStats: Object.keys(deptCount).map(k => ({ name: k, count: deptCount[k] })).sort((a, b) => b.count - a.count),
      yearStats: Object.keys(yearCount).map(k => ({ name: k, count: yearCount[k] })).sort((a, b) => b.count - a.count),
      updatedAt: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// 🌟 [เพิ่มใหม่] สร้าง Master Token (กำหนดเวลาได้) สำหรับ Staff เอาไปให้คนอื่นสแกน
exports.generateSelfRegisterLink = async (req, res) => {
  try {
    const { pointId, validFrom, validUntil, forStaffId } = req.body;
    if (!pointId || !validFrom || !validUntil) {
      return res.status(400).json({ error: 'กรุณาระบุจุดลงทะเบียน และเวลาเริ่มต้น-สิ้นสุด ให้ครบถ้วน' });
    }

    // 🌟 ถ้าเป็น Admin และมีการส่ง forStaffId มา ให้ใช้ forStaffId แทน ID ของคนกดสร้าง
    const isAdmin = req.user.role && (Array.isArray(req.user.role) ? req.user.role.includes('admin') : req.user.role === 'admin');
    const targetStaffId = (isAdmin && forStaffId) ? forStaffId : req.user._id;

    const payload = {
      role: 'self_register_master',
      pointId,
      staffId: targetStaffId,
      nbf: Math.floor(new Date(validFrom).getTime() / 1000), // Not Before (เวลาเริ่ม)
      exp: Math.floor(new Date(validUntil).getTime() / 1000) // Expiration (เวลาหมดอายุ)
    };

    const masterToken = jwt.sign(payload, process.env.JWT_SECRET);
    res.json({ token: masterToken });
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถสร้างลิงก์ได้', detail: err.message });
  }
};

// 🌟 [เพิ่มใหม่] ผู้เข้าร่วมใช้ Master Token แลกเป็น Session 15 นาที
exports.requestShortSession = async (req, res) => {
  try {
    const { masterToken } = req.body;
    if (!masterToken) return res.status(400).json({ error: 'ไม่พบ Token ยืนยันตัวตน' });

    // ตรวจสอบความถูกต้องและเวลาของ Master Token
    const decoded = jwt.verify(masterToken, process.env.JWT_SECRET);

    if (decoded.role !== 'self_register_master') {
      return res.status(403).json({ error: 'Token ไม่ถูกต้องสำหรับโหมดนี้' });
    }

    // ออก Session ใหม่ให้อายุแค่ 15 นาที สำหรับกรอกข้อมูล 1 คน
    const shortToken = jwt.sign(
      { role: 'self_register_session', pointId: decoded.pointId, staffId: decoded.staffId },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
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
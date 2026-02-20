// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const Admin = require('../models/admin');
const Session = require('../models/session');

module.exports = async function (req, res, next) {
  let token = req.cookies?.token;
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'ไม่ได้ส่ง Token หรือคุกกี้มาด้วย' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // 🌟 ปรับปรุงการรองรับ Token ของ Self Register Session
    if (payload.role === 'kiosk_device' || payload.role === 'self_register_session') {
      req.user = { 
        _id: payload.createdBy || payload.staffId, // อ้างอิง ID ของ Staff ผู้สร้าง QR
        role: ['kiosk'], // 🌟 เปลี่ยนเป็น 'kiosk' เพื่อให้ผ่าน requireKioskOrStaff middleware
        username: payload.role === 'self_register_session' ? 'Self_Service_Mobile' : 'Kiosk_Tablet' 
      };
      // 🌟 บันทึก Method ไว้ใช้ใน Controller
      req.registrationMethod = payload.role === 'self_register_session' ? 'Self-Service (QR)' : 'Kiosk';
      req.kioskPoint = payload.pointId;
      return next();
    }

    const session = await Session.findOne({ token });
    if (!session) {
      res.clearCookie('token'); 
      return res.status(401).json({ error: 'Session ไม่ถูกต้อง' });
    }

    if (session.revoked) {
      await Session.deleteOne({ token });
      res.clearCookie('token');
      return res.status(401).json({ error: 'Session ถูกยกเลิก' });
    }

    if (session.expiresAt && session.expiresAt < new Date()) {
      await Session.deleteOne({ token });
      res.clearCookie('token');
      return res.status(401).json({ error: 'Session หมดอายุ' });
    }

    const user = await Admin.findById(payload.id);
    if (!user) {
      await Session.deleteOne({ token });
      res.clearCookie('token');
      return res.status(401).json({ error: 'ไม่พบ User' });
    }

    req.user = user;
    req.registrationMethod = 'Staff On-site'; // ระบุวิธีลงทะเบียนปกติ
    req.session = session; 
    next();
  } catch (err) {
    res.clearCookie('token'); 
    res.status(401).json({ error: 'Token หมดอายุหรือไม่ถูกต้อง' });
  }
};
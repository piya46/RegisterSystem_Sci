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

    // [เพิ่ม] ดักจับ Token ของ Kiosk Mode (ไม่ต้องเช็ค Session ลงลึก)
    if (payload.role === 'kiosk_device') {
      req.user = { 
        _id: payload.createdBy, 
        role: ['kiosk_device'], 
        username: 'Kiosk_Shared' 
      };
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
    req.session = session; 
    next();
  } catch (err) {
    res.clearCookie('token'); 
    res.status(401).json({ error: 'Token หมดอายุหรือไม่ถูกต้อง' });
  }
};
const jwt = require('jsonwebtoken');
const Admin = require('../models/admin');
const Session = require('../models/session');

module.exports = async function (req, res, next) {
  // ✅ 1. พยายามดึง Token จาก Cookie เป็นหลัก ถ้าไม่มีค่อยดึงจาก Header
  let token = req.cookies?.token;
  
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'ไม่ได้ส่ง Token หรือคุกกี้มาด้วย' });
  }

  try {
    // เช็ค JWT
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // หา session
    const session = await Session.findOne({ token });
    if (!session) {
      res.clearCookie('token'); // เคลียร์คุกกี้ทิ้งถ้าหา session ไม่เจอ
      return res.status(401).json({ error: 'Session ไม่ถูกต้อง' });
    }

    // เช็คว่าถูก revoked ไหม
    if (session.revoked) {
      await Session.deleteOne({ token });
      res.clearCookie('token');
      return res.status(401).json({ error: 'Session ถูกยกเลิก' });
    }

    // เช็คว่า session หมดอายุ
    if (session.expiresAt && session.expiresAt < new Date()) {
      await Session.deleteOne({ token });
      res.clearCookie('token');
      return res.status(401).json({ error: 'Session หมดอายุ' });
    }

    // หา user
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
    await Session.deleteOne({ token });
    res.clearCookie('token'); // ✅ เคลียร์คุกกี้ถ้า JWT พังหรือหมดอายุ
    res.status(401).json({ error: 'Token หมดอายุหรือไม่ถูกต้อง' });
  }
};
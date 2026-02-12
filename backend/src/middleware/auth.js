const jwt = require('jsonwebtoken');
const Admin = require('../models/admin');
const Session = require('../models/session');

module.exports = async function (req, res, next) {
  // ✅ 1. ลองอ่านจาก Cookies ก่อน ถ้าไม่มีค่อยดู Header (เผื่อไว้)
  let token = req.cookies.token;
  
  if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.split(' ')[1];
      }
  }

  if (!token) return res.status(401).json({ error: 'ไม่ได้ส่ง Token มาด้วย (Unauthorized)' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const session = await Session.findOne({ token });
    if (!session) return res.status(401).json({ error: 'Session ไม่ถูกต้อง' });

    if (session.revoked) {
      await Session.deleteOne({ token });
      res.clearCookie('token'); // ลบ Cookie
      return res.status(401).json({ error: 'Session ถูกยกเลิก' });
    }

    if (session.expiresAt && session.expiresAt < new Date()) {
      await Session.deleteOne({ token });
      res.clearCookie('token'); // ลบ Cookie
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
    // ถ้า Token มีปัญหาให้ลบ Cookie ทิ้งเลย
    res.clearCookie('token');
    // await Session.deleteOne({ token }); // อาจจะหาไม่เจอถ้า token มั่ว
    res.status(401).json({ error: 'Token หมดอายุหรือไม่ถูกต้อง' });
  }
};
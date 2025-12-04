const jwt = require('jsonwebtoken');
const Admin = require('../models/admin');
const Session = require('../models/session');

module.exports = async function (req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'ไม่ได้ส่ง Token มาด้วย' });
  const token = authHeader.split(' ')[1];

  try {
    // เช็ค JWT
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // หา session
    const session = await Session.findOne({ token });
    if (!session) return res.status(401).json({ error: 'Session ไม่ถูกต้อง' });

    // เช็คว่าถูก revoked ไหม
    if (session.revoked) {
      await Session.deleteOne({ token });
      return res.status(401).json({ error: 'Session ถูกยกเลิก' });
    }

    // เช็คว่า session หมดอายุ
    if (session.expiresAt && session.expiresAt < new Date()) {
      await Session.deleteOne({ token });
      return res.status(401).json({ error: 'Session หมดอายุ' });
    }

    // หา user
    const user = await Admin.findById(payload.id);
    if (!user) {
      await Session.deleteOne({ token });
      return res.status(401).json({ error: 'ไม่พบ User' });
    }

    req.user = user;
    req.session = session; // เพิ่มสำหรับ controller ที่จะใช้ข้อมูล session
    next();
  } catch (err) {
    await Session.deleteOne({ token });
    res.status(401).json({ error: 'Token หมดอายุหรือไม่ถูกต้อง' });
  }
};




// const jwt = require('jsonwebtoken');
// const Admin = require('../models/admin');
// const Session = require('../models/session');

// module.exports = async function (req, res, next) {
//   const authHeader = req.headers.authorization;
//   if (!authHeader) return res.status(401).json({ error: 'No token provided' });
//   const token = authHeader.split(' ')[1];

//   try {
//     const payload = jwt.verify(token, process.env.JWT_SECRET);

//     // หา session
//     const session = await Session.findOne({ token });
//     if (!session) return res.status(401).json({ error: 'Session not found' });

//     // เพิ่มเช็ค revoked
//     if (session.revoked) {
//       await Session.deleteOne({ token }); // ลบออกเลย (หรือจะ keep log ไว้ก็ได้)
//       return res.status(401).json({ error: 'Session revoked' });
//     }

//     if (session.expiresAt && session.expiresAt < Date.now()) {
//       await Session.deleteOne({ token });
//       return res.status(401).json({ error: 'Session expired' });
//     }

//     const user = await Admin.findById(payload.id);
//     if (!user) {
//       await Session.deleteOne({ token });
//       return res.status(401).json({ error: 'User not found' });
//     }

//     req.user = user;
//     next();
//   } catch (err) {
//     await Session.deleteOne({ token });
//     res.status(401).json({ error: 'Invalid or expired token' });
//   }
// };



// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const Admin = require('../models/admin');
const Session = require('../models/session');
const { hashSessionToken } = require('../utils/sessionToken');

const TOKEN_ISSUER = 'psevent';

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

    if (payload.role === 'kiosk_device') {
      if (payload.aud !== 'kiosk-device' || payload.iss !== TOKEN_ISSUER || !payload.pointId) {
        return res.status(401).json({ error: 'Token scope ไม่ถูกต้อง' });
      }
      req.user = { 
        _id: payload.createdBy,
        role: ['kiosk'],
        username: 'Kiosk_Tablet'
      };
      req.auth = { type: 'scoped_token', scope: 'kiosk_device' };
      req.registrationMethod = 'Kiosk';
      req.kioskPoint = payload.pointId;
      return next();
    }

    if (payload.role === 'self_register_session') {
      if (payload.aud !== 'self-register-session' || payload.iss !== TOKEN_ISSUER || !payload.pointId || !payload.staffId) {
        return res.status(401).json({ error: 'Token scope ไม่ถูกต้อง' });
      }
      req.user = {
        _id: payload.staffId,
        role: ['self_register'],
        username: 'Self_Service_Mobile'
      };
      req.auth = { type: 'scoped_token', scope: 'self_register_session' };
      req.registrationMethod = 'Self-Service (QR)';
      req.kioskPoint = payload.pointId;
      return next();
    }

    const tokenHash = hashSessionToken(token);
    let session = await Session.findOne({ tokenHash }).select('+token +tokenHash');
    if (!session) {
      session = await Session.findOne({ token }).select('+token +tokenHash');
      if (session && !session.tokenHash) {
        await Session.updateOne(
          { _id: session._id },
          { $set: { tokenHash }, $unset: { token: 1 } }
        );
        session.tokenHash = tokenHash;
        session.token = undefined;
      }
    }
    if (!session) {
      res.clearCookie('token');
      return res.status(401).json({ error: 'Session ไม่ถูกต้อง' });
    }

    if (session.revoked) {
      await Session.deleteOne({ _id: session._id });
      res.clearCookie('token');
      return res.status(401).json({ error: 'Session ถูกยกเลิก' });
    }

    if (session.expiresAt && session.expiresAt < new Date()) {
      await Session.deleteOne({ _id: session._id });
      res.clearCookie('token');
      return res.status(401).json({ error: 'Session หมดอายุ' });
    }

    const user = await Admin.findById(payload.id);
    if (!user) {
      await Session.deleteOne({ _id: session._id });
      res.clearCookie('token');
      return res.status(401).json({ error: 'ไม่พบ User' });
    }

    req.user = user;
    req.auth = { type: 'admin_session', scope: 'user' };
    req.registrationMethod = 'Staff On-site'; // ระบุวิธีลงทะเบียนปกติ
    req.session = session; 
    next();
  } catch (err) {
    res.clearCookie('token');
    res.status(401).json({ error: 'Token หมดอายุหรือไม่ถูกต้อง' });
  }
};

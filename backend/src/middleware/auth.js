// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const Admin = require('../models/admin');
const { clearAuthCookie } = require('../utils/authCookie');
const { clearCsrfCookie } = require('../utils/csrf');
const { findSessionByToken } = require('../utils/sessionLookup');

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
      req.auth = {
        type: 'scoped_token',
        scope: 'kiosk_device',
        eventId: payload.eventId || null,
        eventYear: payload.eventYear || '',
      };
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
      req.auth = {
        type: 'scoped_token',
        scope: 'self_register_session',
        eventId: payload.eventId || null,
        eventYear: payload.eventYear || '',
        jti: payload.jti || '',
      };
      req.registrationMethod = 'Self-Service (QR)';
      req.kioskPoint = payload.pointId;
      return next();
    }

    const { session } = await findSessionByToken(token);
    if (!session) {
      clearAuthCookie(res);
      clearCsrfCookie(res);
      return res.status(401).json({ error: 'Session ไม่ถูกต้อง' });
    }

    if (session.revoked) {
      session.revoked = true;
      await session.save();
      clearAuthCookie(res);
      clearCsrfCookie(res);
      return res.status(401).json({ error: 'Session ถูกยกเลิก' });
    }

    const now = new Date();
    if (session.absoluteExpiresAt && session.absoluteExpiresAt < now) {
      session.revoked = true;
      await session.save();
      clearAuthCookie(res);
      clearCsrfCookie(res);
      return res.status(401).json({ error: 'Session หมดอายุสูงสุดแล้ว กรุณาเข้าสู่ระบบใหม่' });
    }

    if (session.expiresAt && session.expiresAt < now) {
      session.revoked = true;
      await session.save();
      clearAuthCookie(res);
      clearCsrfCookie(res);
      return res.status(401).json({ error: 'Session หมดอายุ' });
    }

    const user = await Admin.findById(payload.id);
    if (!user) {
      session.revoked = true;
      await session.save();
      clearAuthCookie(res);
      clearCsrfCookie(res);
      return res.status(401).json({ error: 'ไม่พบ User' });
    }

    req.user = user;
    req.auth = { type: 'admin_session', scope: 'user' };
    req.registrationMethod = 'Staff On-site'; // ระบุวิธีลงทะเบียนปกติ
    req.session = session; 
    next();
  } catch (err) {
    clearAuthCookie(res);
    clearCsrfCookie(res);
    res.status(401).json({ error: 'Token หมดอายุหรือไม่ถูกต้อง' });
  }
};

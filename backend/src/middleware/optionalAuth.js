const jwt = require('jsonwebtoken');
const Admin = require('../models/admin');
const { findSessionByToken } = require('../utils/sessionLookup');

module.exports = async function optionalAuth(req, res, next) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;
  const token = req.cookies?.token || bearer;

  if (!token) return next();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role === 'kiosk_device' || payload.role === 'self_register_session') return next();

    const { session } = await findSessionByToken(token);

    const now = new Date();
    if (
      !session ||
      session.revoked ||
      (session.absoluteExpiresAt && session.absoluteExpiresAt < now) ||
      (session.expiresAt && session.expiresAt < now)
    ) {
      return next();
    }

    const user = await Admin.findById(payload.id);
    if (!user) return next();

    req.user = user;
    req.auth = { type: 'admin_session', scope: 'user' };
    req.session = session;
    return next();
  } catch {
    return next();
  }
};

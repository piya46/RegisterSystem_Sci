const jwt = require('jsonwebtoken');
const Admin = require('../models/admin');
const Session = require('../models/session');
const { hashSessionToken } = require('../utils/sessionToken');

module.exports = async function optionalAuth(req, res, next) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;
  const token = req.cookies?.token || bearer;

  if (!token) return next();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role === 'kiosk_device' || payload.role === 'self_register_session') return next();

    const tokenHash = hashSessionToken(token);
    let session = await Session.findOne({ tokenHash }).select('+token +tokenHash');

    if (!session) {
      session = await Session.findOne({ token }).select('+token +tokenHash');
      if (session && !session.tokenHash) {
        await Session.updateOne(
          { _id: session._id },
          { $set: { tokenHash }, $unset: { token: 1 } }
        );
      }
    }

    if (!session || session.revoked || (session.expiresAt && session.expiresAt < new Date())) {
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

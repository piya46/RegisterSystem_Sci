const Session = require('../models/session');
const Admin = require('../models/admin');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const isAdmin = require('../helpers/isAdmin');
const auditLog = require('../helpers/auditLog');
const { hashSessionToken } = require('../utils/sessionToken');
const { authCookieOptions, clearAuthCookie } = require('../utils/authCookie');
const { clearCsrfCookie, setCsrfCookie } = require('../utils/csrf');
const { findSessionByToken } = require('../utils/sessionLookup');
const {
  createSessionTiming,
  sessionAbsoluteTimeoutMs,
  sessionPreviousTokenGraceMs,
} = require('../utils/sessionPolicy');


// Helper: เช็ค admin และ log ถ้าโดนบล็อก
function ensureAdmin(req, res, action = 'UNAUTHORIZED_ATTEMPT') {
  if (!isAdmin(req.user)) {
    logger.warn(`[Session][${req.user?.username || 'Unknown'}] ${action} - Blocked non-admin`);
    res.status(403).json({ error: 'Admin only!' });
    return false;
  }
  return true;
}

// GET /api/sessions?role=staff
exports.listSessions = async (req, res) => {
  if (!ensureAdmin(req, res, 'VIEW_SESSION_LIST')) return;
  const { role } = req.query;
  let query = {};
  if (role) {
    const admins = await Admin.find({ role: { $in: [role] } }, '_id');
    const userIds = admins.map(a => a._id);
    query.userId = { $in: userIds };
  }
  const sessions = await Session.find(query).populate('userId', 'username email fullName role');
  logger.info(`[Session][${req.user.username}] VIEW_SESSION_LIST - Query: ${role || 'all'} | Count=${sessions.length}`);
  res.json(sessions);
};

exports.getSessionByUserId = async (req, res) => {
  if (!ensureAdmin(req, res, 'VIEW_SESSION_BY_USER')) return;
  const session = await Session.find({ userId: req.params.userId }).populate('userId', 'username email fullName role');
  logger.info(`[Session][${req.user.username}] VIEW_SESSION_BY_USER - userId=${req.params.userId} found=${session.length}`);
  if (!session || session.length === 0) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(session);
};

exports.deleteSessionById = async (req, res) => {
  if (!ensureAdmin(req, res, 'DELETE_SESSION_BY_ID')) return;
  const { id } = req.params;
  const deleted = await Session.findByIdAndDelete(id);
  logger.info(`[Session][${req.user.username}] DELETE_SESSION_BY_ID - sessionId=${id} success=${!!deleted}`);
  if (!deleted) return res.status(404).json({ error: 'Session not found' });
  res.json({ message: 'Session deleted' });
};

exports.deleteSessionByUserId = async (req, res) => {
  if (!ensureAdmin(req, res, 'DELETE_SESSION_BY_USER')) return;
  const { userId } = req.params;
  const deleted = await Session.findOneAndDelete({ userId });
  logger.info(`[Session][${req.user.username}] DELETE_SESSION_BY_USER - userId=${userId} success=${!!deleted}`);
  if (!deleted) return res.status(404).json({ error: 'Session not found' });
  res.json({ message: 'Session deleted' });
  logger.info(`[SESSION][${req.user.username}] DELETE_SESSION userId=${req.params.userId}`);
};

exports.revokeSession = async (req, res) => {
  if (!ensureAdmin(req, res, 'REVOKE_SESSION')) return;
  const { id } = req.params;
  const session = await Session.findByIdAndUpdate(id, { revoked: true }, { new: true });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ message: 'Session revoked', session });
  logger.info(`[Session][${req.user.username}] REVOKE_SESSION - sessionId=${id}`);
  auditLog({ req, action: 'REVOKE_SESSION', detail: `sessionId=${id}` });
};

exports.revokeAllSessionByUser = async (req, res) => {
  if (!ensureAdmin(req, res, 'REVOKE_ALL_SESSION_BY_USER')) return;
  const { userId } = req.params;
  await Session.updateMany({ userId }, { revoked: true });
  res.json({ message: 'All sessions for this user have been revoked' });
  logger.info(`[Session][${req.user.username}] REVOKE_ALL_SESSION_BY_USER - userId=${userId}`);
  auditLog({ req, action: 'REVOKE_ALL_SESSION_BY_USER', detail: `userId=${userId}` });
};

exports.logout = async (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(400).json({ error: 'No token provided' });

  const { session, tokenHash } = await findSessionByToken(token);
  if (session) {
    session.revoked = true;
    await session.save();
  } else {
    await Session.findOneAndUpdate(
      { token },
      { $set: { revoked: true, tokenHash }, $unset: { token: 1 } }
    );
  }
  clearAuthCookie(res);
  clearCsrfCookie(res);
  logger.info(`[Session][${req.user?.username}] LOGOUT`);
  auditLog({ req, action: 'LOGOUT', detail: 'User logged out' });
  res.json({ message: 'Logged out' });
};

exports.refresh = async (req, res) => {
  if (req.auth?.type !== 'admin_session' || !req.session || !req.user) {
    return res.status(401).json({ error: 'Session refresh is only available for user sessions' });
  }

  const oldToken = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!oldToken) return res.status(401).json({ error: 'No token provided' });

  const now = new Date();
  const session = req.session;
  const absoluteExpiresAt = session.absoluteExpiresAt ||
    new Date(new Date(session.createdAt).getTime() + sessionAbsoluteTimeoutMs());

  if (absoluteExpiresAt <= now) {
    session.revoked = true;
    await session.save();
    clearAuthCookie(res);
    clearCsrfCookie(res);
    return res.status(401).json({ error: 'Session หมดอายุสูงสุดแล้ว กรุณาเข้าสู่ระบบใหม่' });
  }

  const timing = createSessionTiming(now, absoluteExpiresAt);
  const payload = { id: req.user._id, role: req.user.role };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: timing.jwtExpiresInSeconds });

  session.previousTokenHash = hashSessionToken(oldToken);
  session.previousTokenExpiresAt = new Date(now.getTime() + sessionPreviousTokenGraceMs());
  session.tokenHash = hashSessionToken(token);
  session.expiresAt = timing.expiresAt;
  session.absoluteExpiresAt = timing.absoluteExpiresAt;
  session.lastActivityAt = now;
  session.userAgent = req.headers['user-agent'];
  session.ip = req.ip;
  await session.save();

  res.cookie('token', token, authCookieOptions({ maxAge: timing.cookieMaxAgeMs }));
  const csrfToken = setCsrfCookie(res);
  logger.info(`[Session][${req.user.username}] REFRESH_SESSION expiresAt=${timing.expiresAt.toISOString()}`);
  res.json({
    success: true,
    csrfToken,
    session: {
      expiresAt: timing.expiresAt,
      absoluteExpiresAt: timing.absoluteExpiresAt,
      refreshThresholdMs: timing.refreshThresholdMs,
    },
  });
};

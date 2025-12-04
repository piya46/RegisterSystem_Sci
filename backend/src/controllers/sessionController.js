const Session = require('../models/session');
const Admin = require('../models/admin');
const logger = require('../utils/logger');
const isAdmin = require('../helpers/isAdmin');
const auditLog = require('../helpers/auditLog');


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

exports.deleteSessionByToken = async (req, res) => {
  if (!ensureAdmin(req, res, 'DELETE_SESSION_BY_TOKEN')) return;
  const { token } = req.params;
  const deleted = await Session.findOneAndDelete({ token });
  logger.info(`[Session][${req.user.username}] DELETE_SESSION_BY_TOKEN - token=${token} success=${!!deleted}`);
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
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(400).json({ error: 'No token provided' });

  await Session.findOneAndUpdate({ token }, { revoked: true });
  logger.info(`[Session][${req.user?.username}] LOGOUT - token=${token}`);
  auditLog({ req, action: 'LOGOUT', detail: `token=${token}` });
  res.json({ message: 'Logged out' });
};

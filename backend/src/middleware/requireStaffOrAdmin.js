const { isAdminLike } = require('../utils/permissions');

module.exports = function requireStaffOrAdmin(req, res, next) {
  const roles = Array.isArray(req.user?.role) ? req.user.role : [];
  const isScopedToken = req.auth?.type === 'scoped_token';

  if (!req.user || isScopedToken) {
    return res.status(401).json({ error: 'ต้องเข้าสู่ระบบด้วยบัญชีเจ้าหน้าที่' });
  }

  if (isAdminLike(req.user) || roles.includes('staff')) {
    return next();
  }

  return res.status(403).json({ error: 'Staff/Admin only!' });
};

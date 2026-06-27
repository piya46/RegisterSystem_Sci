const { isAdminLike } = require('../utils/permissions');

module.exports = function requireRegistrationActor(req, res, next) {
  const roles = Array.isArray(req.user?.role) ? req.user.role : [];
  const scope = req.auth?.scope;

  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  if (isAdminLike(req.user) || roles.includes('staff')) return next();
  if (scope === 'kiosk_device' || scope === 'self_register_session') return next();

  return res.status(403).json({ error: 'Registration session only!' });
};

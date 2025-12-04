module.exports = function (req, res, next) {
  if (!req.user || !Array.isArray(req.user.role)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.role.includes('kiosk') || req.user.role.includes('staff') || req.user.role.includes('admin')) return next();
  return res.status(403).json({ error: 'Staff/Kiosk only!' });
};
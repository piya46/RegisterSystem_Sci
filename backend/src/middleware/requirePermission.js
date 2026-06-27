const { hasPermission } = require('../utils/permissions');

module.exports = function requirePermission(permission) {
  return (req, res, next) => {
    if (req.user && req.auth?.type !== 'scoped_token' && hasPermission(req.user, permission)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้',
    });
  };
};

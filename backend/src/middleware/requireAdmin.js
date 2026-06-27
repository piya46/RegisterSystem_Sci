const { isAdminLike } = require('../utils/permissions');

module.exports = function (req, res, next) {
  if (
    req.user &&
    req.auth?.type !== 'scoped_token' &&
    isAdminLike(req.user)
  ) {
    next();
  } else {
    res.status(403).json({ error: `You don't have permission to do Action` });
  }
};

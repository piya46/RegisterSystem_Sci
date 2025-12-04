module.exports = function (req, res, next) {
  if (req.user && Array.isArray(req.user.role) && req.user.role.includes('admin')) {
    next();
  } else {
    res.status(403).json({ error: `You don't have permission to do Action` });
  }
};

const logger = require('../utils/logger');

module.exports = function requestLogger(req, res, next) {
  // ดักจับข้อมูลสำคัญ (เช่น method, url, user, ip)
  const user = req.user ? `${req.user.username} (${req.user._id})` : 'Anonymous';
  logger.info(`[API][${user}] ${req.method} ${req.originalUrl} - IP:${req.ip} - UA:${req.headers['user-agent'] || ''}`);
  next();
};

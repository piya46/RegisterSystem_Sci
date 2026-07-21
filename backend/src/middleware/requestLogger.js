const logger = require('../utils/logger');
const { safeRequestUrl } = require('../utils/logSanitization');

module.exports = function requestLogger(req, res, next) {
  // ดักจับข้อมูลสำคัญ (เช่น method, url, user, ip)
  const user = req.user ? `${req.user.username} (${req.user._id})` : 'Anonymous';
  logger.info(`[API][${user}] ${req.method} ${safeRequestUrl(req, { preferRoutePattern: false })} - IP:${req.ip} - UA:${req.headers['user-agent'] || ''}`);
  next();
};

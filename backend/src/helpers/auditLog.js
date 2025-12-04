const ApiLog = require('../models/apilog');

/**
 * Helper สำหรับบันทึก Audit Log
 * @param {Object} options
 *   - req: Express Request (ใช้บันทึก user, ip, agent, url)
 *   - action: ชื่อ action เช่น 'LOGIN', 'CREATE_ADMIN', 'DELETE_ADMIN', 'ERROR'
 *   - detail: (optional) รายละเอียดเพิ่มเติม
 *   - status: (optional) HTTP status code
 *   - error: (optional) error message หรือ stack
 */
module.exports = function auditLog({
  req,
  action,
  detail = '',
  status = 200,
  error = ''
}) {
  ApiLog.create({
    user: req.user ? req.user.username : 'Anonymous',
    userId: req.user ? String(req.user._id) : null,
    method: req.method,
    url: req.originalUrl,
    status,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    action,
    detail,
    error
  }).catch(err => {
    // ไม่ throw เพื่อกัน process หลักล่ม
    console.error('AuditLog error:', err);
  });
};

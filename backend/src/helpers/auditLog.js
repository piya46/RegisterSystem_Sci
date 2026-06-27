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
  req = null,
  action,
  detail = '',
  status = 200,
  error = '',
  user = 'System',
  userId = null,
  method = 'SYSTEM',
  url = '',
  strict = false
}) {
  const actor = req?.user || null;
  const write = ApiLog.create({
    user: actor ? actor.username : user,
    userId: actor ? String(actor._id) : userId,
    method: req?.method || method,
    url: req?.originalUrl || req?.path || url,
    status,
    ip: req?.ip || '',
    userAgent: req?.headers?.['user-agent'] || '',
    action,
    detail,
    error
  });

  if (strict) return write;

  return write.catch(err => {
    // ไม่ throw เพื่อกัน process หลักล่ม
    console.error('AuditLog error:', err);
  });
};

const auditLog = require('./auditLog');

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function auditSensitiveAccess({
  req = null,
  action,
  purpose,
  resource,
  eventYear,
  recordCount,
  fields = [],
  status = 200,
  error = '',
  extra = {},
}) {
  return auditLog({
    req,
    action,
    status,
    error,
    strict: ['true', '1', 'yes'].includes(String(process.env.SENSITIVE_AUDIT_STRICT || '').toLowerCase()),
    detail: safeJson({
      purpose,
      resource,
      eventYear: eventYear || null,
      recordCount: Number.isFinite(recordCount) ? recordCount : null,
      fields,
      ...extra,
    }),
  });
}

module.exports = {
  auditSensitiveAccess,
};

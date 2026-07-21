const crypto = require('crypto');

function normalizeIdempotencyKey(value, { required = false } = {}) {
  const key = String(value || '').trim();
  if (!key) {
    if (!required) return null;
    const error = new Error('กรุณาส่ง Idempotency-Key สำหรับรายการนี้');
    error.code = 'IDEMPOTENCY_KEY_REQUIRED';
    error.statusCode = 400;
    throw error;
  }
  if (key.length < 16 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    const error = new Error('รูปแบบ Idempotency-Key ไม่ถูกต้อง');
    error.code = 'IDEMPOTENCY_KEY_INVALID';
    error.statusCode = 400;
    throw error;
  }
  return key;
}

function stableStringify(value) {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashIdempotencyKey(namespace, key) {
  return crypto.createHash('sha256').update(`${namespace}:${key}`).digest('hex');
}

function requestFingerprint(payload) {
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

module.exports = {
  hashIdempotencyKey,
  normalizeIdempotencyKey,
  requestFingerprint,
  stableStringify,
};

const crypto = require('crypto');

function hashSessionToken(token) {
  const secret = process.env.SESSION_TOKEN_HASH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing session token hash secret');
  return crypto.createHmac('sha256', secret).update(String(token)).digest('hex');
}

module.exports = { hashSessionToken };

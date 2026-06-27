const crypto = require('crypto');
const { authCookieOptions } = require('./authCookie');

const CSRF_COOKIE_NAME = 'csrfToken';
const EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/google-login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password-otp',
  '/api/participants/public',
  '/api/participants/resend-ticket',
  '/api/public/request-short-session',
]);

function csrfSecret() {
  const secret = process.env.CSRF_SECRET || process.env.SESSION_TOKEN_HASH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing CSRF signing secret');
  return secret;
}

function signNonce(nonce) {
  return crypto.createHmac('sha256', csrfSecret()).update(nonce).digest('hex');
}

function generateCsrfToken() {
  const nonce = crypto.randomBytes(32).toString('base64url');
  return `${nonce}.${signNonce(nonce)}`;
}

function verifyCsrfToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [nonce, signature] = token.split('.');
  if (!nonce || !signature) return false;
  const expected = signNonce(nonce);
  const actual = String(signature);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function csrfCookieOptions(extra = {}) {
  return authCookieOptions({
    httpOnly: false,
    maxAge: 24 * 60 * 60 * 1000,
    ...extra,
  });
}

function setCsrfCookie(res) {
  const token = generateCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions());
  return token;
}

function clearCsrfCookie(res) {
  res.clearCookie(CSRF_COOKIE_NAME, csrfCookieOptions());
}

function csrfProtection(req, res, next) {
  const unsafeMethod = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (!unsafeMethod) return next();
  const fullPath = `${req.baseUrl || ''}${req.path || ''}`;
  if (EXEMPT_PATHS.has(fullPath)) return next();

  // Public unauthenticated submissions do not use the auth cookie.
  if (!req.cookies?.token) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.get('x-csrf-token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken || !verifyCsrfToken(cookieToken)) {
    return res.status(403).json({ error: 'CSRF token is invalid or missing' });
  }

  return next();
}

module.exports = {
  CSRF_COOKIE_NAME,
  clearCsrfCookie,
  csrfProtection,
  setCsrfCookie,
  verifyCsrfToken,
};

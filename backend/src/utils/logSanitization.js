const REDACTED = '[REDACTED]';
const SENSITIVE_QUERY_KEYS = new Set([
  'accesstoken',
  'authorization',
  'clientsecret',
  'code',
  'credential',
  'hash',
  'idtoken',
  'idempotencykey',
  'key',
  'nonce',
  'otp',
  'password',
  'refreshtoken',
  'secret',
  'sig',
  'signature',
  'state',
  'token',
  'verificationid',
]);

function isSensitiveQueryKey(key) {
  const normalized = String(key || '').replace(/[-_]/g, '').toLowerCase();
  return SENSITIVE_QUERY_KEYS.has(normalized)
    || /(token|secret|password|signature|credential|nonce|otp|hash)$/.test(normalized);
}

function sanitizePathSegments(pathname) {
  return String(pathname || '').replace(
    /(\/(?:certificate\/download|guest-wallet|payment-status|verify|certificate)\/)[^/?#]+/gi,
    `$1${REDACTED}`
  );
}

function sanitizeUrlForLogging(value) {
  const raw = String(value || '').slice(0, 4096);
  if (!raw) return '';

  const withoutFragment = raw.split('#', 1)[0];
  const queryIndex = withoutFragment.indexOf('?');
  const pathname = queryIndex >= 0 ? withoutFragment.slice(0, queryIndex) : withoutFragment;
  const query = queryIndex >= 0 ? withoutFragment.slice(queryIndex + 1) : '';
  const safePath = sanitizePathSegments(pathname);
  if (!query) return safePath.slice(0, 1024);

  const params = new URLSearchParams(query);
  for (const key of [...params.keys()]) {
    if (isSensitiveQueryKey(key)) params.set(key, REDACTED);
  }
  const safeQuery = params.toString();
  return `${safePath}${safeQuery ? `?${safeQuery}` : ''}`.slice(0, 1024);
}

function safeRequestUrl(req, { preferRoutePattern = true } = {}) {
  if (preferRoutePattern && typeof req?.route?.path === 'string') {
    return sanitizeUrlForLogging(`${req.baseUrl || ''}${req.route.path}`);
  }
  return sanitizeUrlForLogging(req?.originalUrl || req?.url || req?.path || '');
}

module.exports = {
  REDACTED,
  safeRequestUrl,
  sanitizeUrlForLogging,
};

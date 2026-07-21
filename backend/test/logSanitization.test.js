const test = require('node:test');
const assert = require('node:assert/strict');
const { safeRequestUrl, sanitizeUrlForLogging } = require('../src/utils/logSanitization');

test('log URL sanitizer removes certificate, guest, idempotency, OAuth, and signed URL secrets', () => {
  const secret = 'cert_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const safe = sanitizeUrlForLogging(
    `/api/public/verify/${secret}?code=oauth-code&state=oauth-state&signature=signed-value&eventId=event-1#fragment-token`
  );

  assert.equal(safe.includes(secret), false);
  assert.equal(safe.includes('oauth-code'), false);
  assert.equal(safe.includes('oauth-state'), false);
  assert.equal(safe.includes('signed-value'), false);
  assert.equal(safe.includes('fragment-token'), false);
  assert.equal(safe.includes('eventId=event-1'), true);

  assert.equal(
    sanitizeUrlForLogging('/guest-wallet/raw-guest-token').includes('raw-guest-token'),
    false
  );
  assert.equal(
    sanitizeUrlForLogging('/api/wallets/payment-status/raw-idempotency-key').includes('raw-idempotency-key'),
    false
  );
});

test('audit logging prefers the route pattern over concrete parameter values', () => {
  const safe = safeRequestUrl({
    baseUrl: '/api/public',
    route: { path: '/verify/:verificationId' },
    originalUrl: '/api/public/verify/cert-secret-value',
  });
  assert.equal(safe.includes('cert-secret-value'), false);
  assert.match(safe, /^\/api\/public\/verify\//);
});

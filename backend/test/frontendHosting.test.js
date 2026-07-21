const test = require('node:test');
const assert = require('node:assert/strict');

const {
  frontendDistPath,
  frontendHostingEnabled,
  isFrontendRoute,
} = require('../src/utils/frontendHosting');

test('frontend hosting is opt-in', () => {
  const previous = process.env.SERVE_FRONTEND;
  delete process.env.SERVE_FRONTEND;
  assert.equal(frontendHostingEnabled(), false);
  process.env.SERVE_FRONTEND = 'true';
  assert.equal(frontendHostingEnabled(), true);
  if (previous === undefined) delete process.env.SERVE_FRONTEND;
  else process.env.SERVE_FRONTEND = previous;
});

test('SPA fallback never captures API, health, or legacy upload routes', () => {
  assert.equal(isFrontendRoute('/'), true);
  assert.equal(isFrontendRoute('/events/demo/register'), true);
  assert.equal(isFrontendRoute('/api'), false);
  assert.equal(isFrontendRoute('/api/auth/me'), false);
  assert.equal(isFrontendRoute('/health/live'), false);
  assert.equal(isFrontendRoute('/health/ready'), false);
  assert.equal(isFrontendRoute('/uploads/file.png'), false);
});

test('frontend dist defaults to the repository frontend build', () => {
  const previous = process.env.FRONTEND_DIST_DIR;
  delete process.env.FRONTEND_DIST_DIR;
  assert.match(frontendDistPath(), /frontend\/dist$/);
  if (previous === undefined) delete process.env.FRONTEND_DIST_DIR;
  else process.env.FRONTEND_DIST_DIR = previous;
});

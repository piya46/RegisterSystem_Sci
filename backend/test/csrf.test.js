const test = require('node:test');
const assert = require('node:assert/strict');
const { csrfProtection } = require('../src/utils/csrf');

test('public slip upload remains usable when the browser also has an admin cookie', () => {
  const req = {
    method: 'POST',
    baseUrl: '/api',
    path: '/uploads/public',
    cookies: { token: 'unrelated-admin-session' },
    get: () => undefined,
  };
  let nextCalled = false;
  csrfProtection(req, {}, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

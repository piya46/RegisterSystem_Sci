const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertTurnstileConfiguration,
  validateTurnstileResponse,
} = require('../src/utils/verifyTurnstile');

test('Turnstile validation binds tokens to the expected action and hostname', () => {
  const validResponse = {
    success: true,
    action: 'register',
    hostname: 'events.example.com',
  };
  const options = {
    expectedAction: 'register',
    allowedHostnames: ['events.example.com'],
    requireHostname: true,
  };

  assert.equal(validateTurnstileResponse(validResponse, options).valid, true);
  assert.equal(validateTurnstileResponse(
    { ...validResponse, action: 'login' },
    options
  ).reason, 'action_mismatch');
  assert.equal(validateTurnstileResponse(
    { ...validResponse, hostname: 'attacker.example' },
    options
  ).reason, 'hostname_mismatch');
});

test('production-style Turnstile validation fails closed without a hostname allowlist', () => {
  const result = validateTurnstileResponse(
    { success: true, action: 'register', hostname: 'events.example.com' },
    { expectedAction: 'register', allowedHostnames: [], requireHostname: true }
  );
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'hostname_allowlist_missing');
});

test('production startup rejects incomplete Turnstile configuration', () => {
  assert.throws(
    () => assertTurnstileConfiguration({ production: true, secret: 'secret', allowedHostnames: [] }),
    /TURNSTILE_ALLOWED_HOSTNAMES/
  );
  assert.doesNotThrow(() => assertTurnstileConfiguration({
    production: true,
    secret: 'secret',
    allowedHostnames: ['events.example.com'],
  }));
});

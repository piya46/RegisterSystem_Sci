const test = require('node:test');
const assert = require('node:assert/strict');
const { assertSqlConfiguration } = require('../src/config/sql');

const ORIGINAL_ENV = { ...process.env };

function resetEnvironment() {
  for (const name of Object.keys(process.env)) {
    if (!(name in ORIGINAL_ENV)) delete process.env[name];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

test.afterEach(resetEnvironment);

test('SQL remains optional when disabled', () => {
  process.env.SQL_ENABLED = 'false';
  process.env.SQL_PRIMARY_STORE = 'false';
  assert.doesNotThrow(assertSqlConfiguration);
});

test('production SQL rejects an unencrypted connection by default', () => {
  process.env.NODE_ENV = 'production';
  process.env.SQL_ENABLED = 'true';
  process.env.SQL_PRIMARY_STORE = 'false';
  process.env.SQL_DIALECT = 'mariadb';
  process.env.SQL_HOST = 'db.internal';
  process.env.SQL_DATABASE = 'psevent';
  process.env.SQL_USER = 'psevent_app';
  process.env.SQL_PASSWORD = 'a-secure-test-password';
  process.env.SQL_SSL_MODE = 'disabled';
  process.env.SQL_ALLOW_INSECURE_PRODUCTION = 'false';

  assert.throws(assertSqlConfiguration, /cannot be disabled in production/);
});

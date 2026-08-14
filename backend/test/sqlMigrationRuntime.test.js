const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertRemoteSqlMigrationTarget,
  isLocalSqlHost,
} = require('../src/sql/migrationRuntime');

const ORIGINAL_ENV = { ...process.env };

function resetEnvironment() {
  for (const name of Object.keys(process.env)) {
    if (!(name in ORIGINAL_ENV)) delete process.env[name];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

test.afterEach(resetEnvironment);

test('SQL migration remote-only guard identifies local targets', () => {
  for (const host of ['localhost', '127.0.0.1', '127.9.9.9', '::1', '0.0.0.0']) {
    assert.equal(isLocalSqlHost(host), true, host);
  }
  assert.equal(isLocalSqlHost('203.170.190.137'), false);
  assert.equal(isLocalSqlHost('db.example.com'), false);
});

test('SQL migration remote-only guard rejects localhost and socket targets', () => {
  process.env.SQL_REMOTE_MIGRATION_ONLY = 'true';
  process.env.SQL_HOST = '127.0.0.1';
  assert.throws(assertRemoteSqlMigrationTarget, /real remote database host/);

  process.env.SQL_HOST = '203.170.190.137';
  process.env.SQL_SOCKET_PATH = '/tmp/mysql.sock';
  assert.throws(assertRemoteSqlMigrationTarget, /rejects SQL_SOCKET_PATH/);
});

test('SQL migration remote-only guard allows the real remote host', () => {
  process.env.SQL_REMOTE_MIGRATION_ONLY = 'true';
  process.env.SQL_HOST = '203.170.190.137';
  delete process.env.SQL_SOCKET_PATH;
  assert.doesNotThrow(assertRemoteSqlMigrationTarget);
});

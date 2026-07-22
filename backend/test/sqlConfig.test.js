const test = require('node:test');
const assert = require('node:assert/strict');
const {
  APPROVED_PLESK_SQL_HOST,
  assertSqlConfiguration,
  retryableSqlConnectionError,
  sslOptions,
} = require('../src/config/sql');

const ORIGINAL_ENV = { ...process.env };

function resetEnvironment() {
  for (const name of Object.keys(process.env)) {
    if (!(name in ORIGINAL_ENV)) delete process.env[name];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

test.afterEach(resetEnvironment);

function configureSecurePleskSql() {
  Object.assign(process.env, {
    NODE_ENV: 'production',
    SQL_ENABLED: 'true',
    SQL_PRIMARY_STORE: 'false',
    SQL_DIALECT: 'mariadb',
    SQL_PROVIDER: 'plesk',
    SQL_HOST: '203.170.190.137',
    SQL_EXPECTED_HOST: '203.170.190.137',
    SQL_PORT: '3306',
    SQL_DATABASE: 'test_database',
    SQL_USER: 'test_runtime_user',
    SQL_PASSWORD: 'a-secure-test-password',
    SQL_SSL_MODE: 'verify_identity',
    SQL_SSL_CA: 'test-ca-certificate',
    SQL_SSL_CA_SECRET_NAME: 'SQL_SSL_CA',
    SQL_SSL_SERVERNAME: 'db.reunion.scicu-alumni.com',
    SQL_AT_REST_ENCRYPTION_CONFIRMED: 'true',
    SQL_BACKUP_ENCRYPTION_CONFIRMED: 'true',
    SQL_STATIC_EGRESS_ENABLED: 'true',
    SQL_NETWORK_ALLOWLIST_CONFIRMED: 'true',
    SQL_MIRROR_ENABLED: 'false',
    SQL_ALLOW_INSECURE_PRODUCTION: 'false',
    SQL_ALLOW_UNVERIFIED_TLS: 'false',
  });
}

test('SQL remains optional when disabled', () => {
  process.env.SQL_ENABLED = 'false';
  process.env.SQL_PRIMARY_STORE = 'false';
  assert.doesNotThrow(assertSqlConfiguration);
});

test('production SQL rejects an unencrypted connection', () => {
  configureSecurePleskSql();
  process.env.SQL_SSL_MODE = 'disabled';

  assert.throws(assertSqlConfiguration, /must be verify_identity/);
});

test('production SQL rejects break-glass TLS overrides', () => {
  configureSecurePleskSql();
  process.env.SQL_ALLOW_UNVERIFIED_TLS = 'true';

  assert.throws(assertSqlConfiguration, /overrides are forbidden/);
});

test('Plesk SQL target must match the approved external endpoint', () => {
  configureSecurePleskSql();
  process.env.SQL_HOST = '203.170.190.138';

  assert.throws(assertSqlConfiguration, /approved host 203\.170\.190\.137/);

  configureSecurePleskSql();
  process.env.SQL_HOST = 'db.attacker.example';
  process.env.SQL_EXPECTED_HOST = 'db.attacker.example';
  assert.throws(assertSqlConfiguration, /approved host 203\.170\.190\.137/);
  assert.equal(APPROVED_PLESK_SQL_HOST, '203.170.190.137');
});

test('an IP endpoint needs a certificate DNS identity or confirmed IP SAN', () => {
  configureSecurePleskSql();
  delete process.env.SQL_SSL_SERVERNAME;
  process.env.SQL_SSL_IP_SAN_CONFIRMED = 'false';

  assert.throws(assertSqlConfiguration, /SQL_SSL_SERVERNAME or SQL_SSL_IP_SAN_CONFIRMED/);
});

test('production SQL requires the pinned SQL_SSL_CA logical secret', () => {
  configureSecurePleskSql();
  process.env.SQL_SSL_CA_SECRET_NAME = 'UNREVIEWED_CA_NAME';

  assert.throws(assertSqlConfiguration, /must be SQL_SSL_CA/);
});

test('production Plesk SQL fails closed until encrypted backup is confirmed', () => {
  configureSecurePleskSql();
  process.env.SQL_BACKUP_ENCRYPTION_CONFIRMED = 'false';

  assert.throws(assertSqlConfiguration, /encrypted backup and restore/);
});

test('production Plesk SQL fails closed until static egress and allowlist are confirmed', () => {
  configureSecurePleskSql();
  process.env.SQL_STATIC_EGRESS_ENABLED = 'false';

  assert.throws(assertSqlConfiguration, /static.*Cloud Run|SQL_STATIC_EGRESS_ENABLED/i);

  process.env.SQL_STATIC_EGRESS_ENABLED = 'true';
  process.env.SQL_NETWORK_ALLOWLIST_CONFIRMED = 'false';
  assert.throws(assertSqlConfiguration, /allowlists the Cloud NAT IP/);
});

test('secure production Plesk SQL configuration passes validation', () => {
  configureSecurePleskSql();

  assert.doesNotThrow(assertSqlConfiguration);
  const options = sslOptions();
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.minVersion, 'TLSv1.2');
  assert.equal(options.servername, 'db.reunion.scicu-alumni.com');
  assert.equal(typeof options.checkServerIdentity, 'function');
});

test('SQL startup retries transient network failures but not auth or TLS failures', () => {
  for (const code of ['ETIMEDOUT', 'ECONNRESET', 'ENETUNREACH', 'PROTOCOL_CONNECTION_LOST']) {
    assert.equal(retryableSqlConnectionError({ code }), true, code);
  }
  for (const code of ['ER_ACCESS_DENIED_ERROR', 'HOSTNAME_MISMATCH', 'SQL_TLS_NOT_ACTIVE']) {
    assert.equal(retryableSqlConnectionError({ code }), false, code);
  }
});

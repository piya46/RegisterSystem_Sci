const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CLIENT_SSL,
  parseMariaDbGreeting,
} = require('./probe-mariadb-tls');
const {
  evaluateProductionReadiness,
  requiredSecretNames,
} = require('./production-readiness');

function greetingPacket(capabilities) {
  const lower = capabilities & 0xffff;
  const upper = (capabilities >>> 16) & 0xffff;
  const payload = Buffer.concat([
    Buffer.from([10]),
    Buffer.from('11.4.0-MariaDB\0', 'ascii'),
    Buffer.alloc(4),
    Buffer.alloc(8),
    Buffer.from([0]),
    Buffer.from([lower & 0xff, (lower >>> 8) & 0xff]),
    Buffer.from([45]),
    Buffer.alloc(2),
    Buffer.from([upper & 0xff, (upper >>> 8) & 0xff]),
    Buffer.from([21]),
    Buffer.alloc(10),
  ]);
  const header = Buffer.alloc(4);
  header.writeUIntLE(payload.length, 0, 3);
  return Buffer.concat([header, payload]);
}

function baseConfig() {
  return {
    PROJECT_ID: 'cusa-reunion',
    SERVICE: 'psevent-production',
    REGION: 'asia-southeast3',
    SECRET_MANAGER_PREFIX: 'psevent-production',
    PUBLIC_WEB_ORIGIN: 'https://reunion.scicu-alumni.com',
    VITE_CF_TURNSTILE_SITE_KEY: 'public-turnstile-site-key',
    PARTICIPANT_EMAIL_LOGIN_ENABLED: 'false',
    MOCK_EMAIL: 'false',
    FIELD_ENCRYPTION_ENABLED: 'true',
    FIELD_ENCRYPTION_SECRET_NAME: 'DATA_ENCRYPTION_KEY',
    MONGO_SECURITY_POSTURE_REQUIRED: 'true',
    OBJECT_STORAGE_PROVIDER: 'gcs',
    GCS_LOCATION: 'asia-southeast3',
    GOOGLE_CLOUD_MONTHLY_BUDGET_THB: '1000',
    GCS_MONTHLY_BUDGET_THB: '650',
    SQL_EGRESS_MONTHLY_BUDGET_THB: '250',
    GOOGLE_CLOUD_CORE_RESERVE_THB: '100',
    SQL_PRIMARY_STORE: 'false',
  };
}

function pinsFor(config, options) {
  return Object.fromEntries(requiredSecretNames(config, options).map((name, index) => [
    name,
    `projects/cusa-reunion/secrets/psevent-production-${name}/versions/${index + 1}`,
  ]));
}

test('MariaDB greeting parser detects whether the server advertises TLS', () => {
  assert.equal(parseMariaDbGreeting(greetingPacket(CLIENT_SSL)).tlsAdvertised, true);
  assert.equal(parseMariaDbGreeting(greetingPacket(0)).tlsAdvertised, false);
  assert.throws(() => parseMariaDbGreeting(Buffer.from([1, 0, 0, 0])), /incomplete/);
});

test('production readiness accepts a complete non-SQL production configuration', () => {
  const config = baseConfig();
  const report = evaluateProductionReadiness({
    environment: 'production',
    config,
    pins: pinsFor(config, { requireSql: false }),
  });

  assert.equal(report.ready, true);
  assert.deepEqual(report.blockerIds, []);
  assert.equal(report.scope.primaryDatabaseCutover, false);
});

test('production readiness requires Brevo for participant email login', () => {
  const config = {
    ...baseConfig(),
    PARTICIPANT_EMAIL_LOGIN_ENABLED: 'true',
    EMAIL_PROVIDER: 'brevo',
    BREVO_FROM_EMAIL: 'noreply-event@pstpyst.com',
    BREVO_CANARY_CONFIRMED: 'true',
  };
  assert.deepEqual(
    requiredSecretNames(config, { requireSql: false }).filter((name) => name.includes('BREVO') || name.includes('SMTP')),
    ['BREVO_API_KEY']
  );

  const report = evaluateProductionReadiness({
    environment: 'production',
    config,
    pins: pinsFor(config, { requireSql: false }),
  });
  assert.equal(report.ready, true);

  const missingSender = evaluateProductionReadiness({
    environment: 'production',
    config: {
      ...config,
      BREVO_FROM_EMAIL: '',
    },
    pins: pinsFor(config, { requireSql: false }),
  });
  assert.equal(missingSender.ready, false);
  assert.ok(missingSender.blockerIds.includes('email_transport'));

  const missingCanary = evaluateProductionReadiness({
    environment: 'production',
    config: {
      ...config,
      BREVO_CANARY_CONFIRMED: 'false',
    },
    pins: pinsFor(config, { requireSql: false }),
  });
  assert.equal(missingCanary.ready, false);
  assert.ok(missingCanary.blockerIds.includes('brevo_canary'));
});

test('production readiness rejects a disabled MongoDB security posture gate', () => {
  const config = {
    ...baseConfig(),
    MONGO_SECURITY_POSTURE_REQUIRED: 'false',
  };
  const report = evaluateProductionReadiness({
    environment: 'production',
    config,
    pins: pinsFor(config, { requireSql: false }),
  });
  assert.equal(report.ready, false);
  assert.ok(report.blockerIds.includes('mongo_security_posture'));
});

test('production readiness rejects a total or allocated cloud budget over 1,000 THB', () => {
  const config = {
    ...baseConfig(),
    GOOGLE_CLOUD_MONTHLY_BUDGET_THB: '1001',
  };
  const report = evaluateProductionReadiness({
    environment: 'production',
    config,
    pins: pinsFor(config, { requireSql: false }),
  });
  assert.equal(report.ready, false);
  assert.ok(report.blockerIds.includes('cloud_cost_budget'));
});

test('Plesk readiness requires manual main deployment and rejects webhook automation', () => {
  const config = {
    ...baseConfig(),
    PLESK_ORIGIN: 'https://reunion.scicu-alumni.com',
    PLESK_GIT_BRANCH: 'main',
    PLESK_MANUAL_DEPLOY: 'true',
  };
  const report = evaluateProductionReadiness({
    environment: 'production',
    config,
    pins: pinsFor(config, { requireSql: false }),
    requireWeb: true,
  });
  assert.equal(report.ready, true);

  const automated = evaluateProductionReadiness({
    environment: 'production',
    config: {
      ...config,
      PLESK_CD_ENABLED: 'true',
      PLESK_GIT_WEBHOOK_URL: 'https://panel.example.test/webhook',
    },
    pins: pinsFor(config, { requireSql: false }),
    requireWeb: true,
  });
  assert.equal(automated.ready, false);
  assert.ok(automated.blockerIds.includes('plesk_automation_disabled'));
});

test('SQL mirror migration readiness requires protected transport, separate accounts, and explicit gates', () => {
  const config = {
    ...baseConfig(),
    SQL_ENABLED: 'true',
    VERIFY_SQL_TRANSPORT: 'true',
    SQL_PROVIDER: 'plesk',
    SQL_HOST: '203.170.190.137',
    SQL_EXPECTED_HOST: '203.170.190.137',
    SQL_PORT: '3306',
    SQL_DATABASE: 'reporting',
    SQL_USER: 'reporting_runtime',
    SQL_MIGRATION_USER: 'reporting_migration',
    SQL_SSL_MODE: 'verify_identity',
    SQL_SSL_CA_SECRET_NAME: 'SQL_SSL_CA',
    SQL_SSL_SERVERNAME: 'db.reunion.scicu-alumni.com',
    SQL_STATIC_EGRESS_ENABLED: 'true',
    SQL_NETWORK_ALLOWLIST_CONFIRMED: 'true',
    SQL_AT_REST_ENCRYPTION_CONFIRMED: 'true',
    SQL_BACKUP_ENCRYPTION_CONFIRMED: 'true',
    RUN_SQL_MIGRATIONS: 'true',
    RUN_SQL_BACKFILL: 'true',
    RUN_SQL_PROTECTION_AUDIT: 'true',
    SQL_MIRROR_REQUIRE_PROTECTED_VALUES: 'true',
    SQL_OUTBOX_ENABLED: 'false',
    CONFIRM_SQL_MIRROR_MIGRATION: 'production',
  };
  const report = evaluateProductionReadiness({
    environment: 'production',
    config,
    pins: pinsFor(config, { requireSql: true }),
    requireSql: true,
    mariaDbProbe: { reachable: true, tlsAdvertised: true },
  });

  assert.equal(report.ready, true);
  assert.deepEqual(report.blockerIds, []);
});

test('readiness fails closed for unsupported primary cutover and a non-TLS MariaDB endpoint', () => {
  const config = {
    ...baseConfig(),
    SQL_PRIMARY_STORE: 'true',
    SQL_ENABLED: 'true',
  };
  const report = evaluateProductionReadiness({
    environment: 'production',
    config,
    pins: {},
    requireSql: true,
    mariaDbProbe: { reachable: true, tlsAdvertised: false },
  });

  assert.equal(report.ready, false);
  assert.ok(report.blockerIds.includes('sql_primary_store'));
  assert.ok(report.blockerIds.includes('sql_server_tls_capability'));
  assert.ok(report.blockerIds.includes('secret_pins'));
});

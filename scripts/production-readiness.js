#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('../backend/node_modules/dotenv');
const { probeMariaDbTls } = require('./probe-mariadb-tls');

const ROOT = path.resolve(__dirname, '..');
const APPROVED_PROJECT_ID = 'cusa-reunion';
const APPROVED_PLESK_SQL_HOST = '203.170.190.137';
const PUBLIC_ORIGIN = 'https://reunion.scicu-alumni.com';
const PIN_PATTERN = /^projects\/([a-z][a-z0-9-]{4,28}[a-z0-9])\/secrets\/([A-Za-z0-9_-]+)\/versions\/([0-9]+)$/;

function boolValue(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function configured(value) {
  const normalized = String(value || '').trim();
  return Boolean(normalized) && !/^(?:replace-with|change-me|example|placeholder)/i.test(normalized);
}

function emailProvider(config) {
  const provider = String(config.EMAIL_PROVIDER || 'auto').trim().toLowerCase();
  if (provider !== 'auto') return provider;
  if (configured(config.BREVO_FROM_EMAIL)) return 'brevo';
  if (configured(config.SMTP_HOST)) return 'smtp';
  return 'none';
}

function validHttpsOrigin(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'https:'
      && !parsed.username
      && !parsed.password
      && parsed.pathname === '/'
      && !parsed.search
      && !parsed.hash;
  } catch {
    return false;
  }
}

function addCheck(checks, id, passed, message, remediation) {
  checks.push({
    id,
    status: passed ? 'pass' : 'blocker',
    message,
    ...(passed || !remediation ? {} : { remediation }),
  });
}

function requiredSecretNames(config, { requireSql }) {
  const names = new Set([
    'MONGODB_URI',
    'JWT_SECRET',
    'SESSION_TOKEN_HASH_SECRET',
    'CSRF_SECRET',
    'VENDOR_QR_SECRET',
    'SLIP_PROOF_SECRET',
    'TURNSTILE_SECRET_KEY',
  ]);

  if (boolValue(config.PARTICIPANT_EMAIL_LOGIN_ENABLED)) {
    const provider = emailProvider(config);
    if (provider === 'brevo') {
      names.add('BREVO_API_KEY');
    } else if (provider === 'smtp') {
      names.add('SMTP_USER');
      names.add('SMTP_PASS');
    }
  }
  if (boolValue(config.FIELD_ENCRYPTION_ENABLED)) {
    names.add('DATA_BLIND_INDEX_SECRET');
    names.add(String(config.FIELD_ENCRYPTION_SECRET_NAME || 'DATA_ENCRYPTION_KEYS').trim());
  }
  if (boolValue(config.LINE_LOGIN_ENABLED)) names.add('LINE_LOGIN_CHANNEL_SECRET');
  if (boolValue(config.LINE_WEBHOOK_ENABLED)) names.add('LINE_WEBHOOK_CHANNEL_SECRET');
  if (boolValue(config.LINE_MESSAGING_ENABLED)) names.add('LINE_CHANNEL_ACCESS_TOKEN');
  if (boolValue(config.SQL_ENABLED)) {
    names.add('SQL_PASSWORD');
    if (configured(config.SQL_SSL_CA_SECRET_NAME)) names.add('SQL_SSL_CA');
  }
  if (requireSql) {
    names.add('SQL_MIGRATION_PASSWORD');
    names.add('SQL_MIRROR_IDENTITY_HASH_SECRET');
  }
  return [...names].filter(Boolean).sort();
}

function validatePin(name, resource, { projectId, prefix }) {
  const match = String(resource || '').match(PIN_PATTERN);
  return Boolean(
    match
    && match[1] === projectId
    && match[2] === `${prefix}-${name}`
    && /^\d+$/.test(match[3])
  );
}

function evaluateProductionReadiness({
  environment,
  config,
  pins,
  requireSql = false,
  requireWeb = false,
  mariaDbProbe = null,
}) {
  const checks = [];
  const projectId = String(config.PROJECT_ID || config.GCP_PROJECT_ID || '').trim();
  const prefix = String(config.SECRET_MANAGER_PREFIX || '').trim();
  const expectedService = `psevent-${environment}`;

  addCheck(
    checks,
    'environment',
    ['staging', 'production'].includes(environment),
    `Deployment environment is ${environment}`,
    'Use staging or production.'
  );
  addCheck(
    checks,
    'project',
    projectId === APPROVED_PROJECT_ID,
    'Google Cloud project is pinned to cusa-reunion',
    'Set PROJECT_ID or GCP_PROJECT_ID to cusa-reunion.'
  );
  addCheck(
    checks,
    'service',
    config.SERVICE === expectedService,
    `Cloud Run service is ${expectedService}`,
    `Set SERVICE=${expectedService}.`
  );
  addCheck(
    checks,
    'region',
    config.REGION === 'asia-southeast3',
    'Cloud resources use asia-southeast3',
    'Set REGION=asia-southeast3 unless a reviewed migration changes every regional resource.'
  );
  addCheck(
    checks,
    'public_origin',
    String(config.PUBLIC_WEB_ORIGIN || '').replace(/\/+$/, '') === PUBLIC_ORIGIN,
    'Public links use the canonical Plesk domain',
    `Set PUBLIC_WEB_ORIGIN=${PUBLIC_ORIGIN}.`
  );
  addCheck(
    checks,
    'turnstile_site_key',
    configured(config.VITE_CF_TURNSTILE_SITE_KEY),
    'Turnstile public site key is configured',
    'Set VITE_CF_TURNSTILE_SITE_KEY from the widget restricted to reunion.scicu-alumni.com.'
  );
  addCheck(
    checks,
    'email_transport',
    !boolValue(config.PARTICIPANT_EMAIL_LOGIN_ENABLED)
      || (
        emailProvider(config) === 'brevo'
        && configured(config.BREVO_FROM_EMAIL)
        && !boolValue(config.MOCK_EMAIL)
      )
      || (
        emailProvider(config) === 'smtp'
        && configured(config.SMTP_HOST)
        && (configured(config.SMTP_FROM) || configured(config.SMTP_USER))
        && !boolValue(config.MOCK_EMAIL)
      ),
    'Production email login has a real transactional email transport',
    'Set EMAIL_PROVIDER=brevo, BREVO_FROM_EMAIL, keep MOCK_EMAIL=false, and pin BREVO_API_KEY; SMTP requires an approved fallback.'
  );
  if (boolValue(config.PARTICIPANT_EMAIL_LOGIN_ENABLED) && emailProvider(config) === 'brevo') {
    addCheck(
      checks,
      'brevo_canary',
      environment !== 'production' || boolValue(config.BREVO_CANARY_CONFIRMED),
      'Brevo transactional email canary has passed before production rollout',
      'Run BREVO_CANARY_WRITE=true npm run canary:brevo-email -- --send after pinning BREVO_API_KEY, then set BREVO_CANARY_CONFIRMED=true for the approved production deploy.'
    );
  }
  addCheck(
    checks,
    'field_encryption',
    boolValue(config.FIELD_ENCRYPTION_ENABLED),
    'Application-level field encryption is enabled',
    'Set FIELD_ENCRYPTION_ENABLED=true and pin the blind-index/encryption keys.'
  );
  addCheck(
    checks,
    'mongo_security_posture',
    environment !== 'production' || boolValue(config.MONGO_SECURITY_POSTURE_REQUIRED),
    'Production startup enforces the live MongoDB security posture',
    'Set MONGO_SECURITY_POSTURE_REQUIRED=true; startup must remain blocked until privacy, TTL, and legacy-index migration verifies clean.'
  );
  addCheck(
    checks,
    'object_storage',
    config.OBJECT_STORAGE_PROVIDER === 'gcs' && config.GCS_LOCATION === config.REGION,
    'Private object storage uses regional GCS',
    'Set OBJECT_STORAGE_PROVIDER=gcs and GCS_LOCATION equal to REGION.'
  );
  const totalBudget = Number(config.GOOGLE_CLOUD_MONTHLY_BUDGET_THB);
  const allocatedBudget = Number(config.GCS_MONTHLY_BUDGET_THB)
    + Number(config.SQL_EGRESS_MONTHLY_BUDGET_THB)
    + Number(config.GOOGLE_CLOUD_CORE_RESERVE_THB);
  addCheck(
    checks,
    'cloud_cost_budget',
    Number.isInteger(totalBudget)
      && totalBudget > 0
      && totalBudget <= 1000
      && Number.isFinite(allocatedBudget)
      && allocatedBudget <= totalBudget,
    'Google Cloud project budget and component allocations stay within 1,000 THB/month',
    'Set a total of at most 1,000 THB and keep GCS + SQL egress + core reserve within that total.'
  );
  addCheck(
    checks,
    'sql_primary_store',
    !boolValue(config.SQL_PRIMARY_STORE),
    'MongoDB remains the primary store during the reporting-mirror migration',
    'SQL_PRIMARY_STORE is not implemented; keep it false and do not retire MongoDB.'
  );

  const requiredPins = requiredSecretNames(config, { requireSql });
  const missingPins = requiredPins.filter((name) => !validatePin(name, pins[name], { projectId, prefix }));
  addCheck(
    checks,
    'secret_pins',
    missingPins.length === 0,
    `All ${requiredPins.length} required Secret Manager versions are pinned`,
    missingPins.length > 0 ? `Create and pin numeric versions for: ${missingPins.join(', ')}` : ''
  );

  if (requireWeb) {
    const pleskOrigin = String(config.PLESK_ORIGIN || '').replace(/\/+$/, '');
    addCheck(
      checks,
      'plesk_origin',
      pleskOrigin === PUBLIC_ORIGIN,
      'Plesk deployment origin is canonical',
      `Set PLESK_ORIGIN=${PUBLIC_ORIGIN}.`
    );
    addCheck(
      checks,
      'plesk_branch',
      String(config.PLESK_GIT_BRANCH || config.PLESK_EXPECTED_BRANCH || '') === 'main',
      'Plesk manually deploys the main branch',
      'Set PLESK_GIT_BRANCH=main (or PLESK_EXPECTED_BRANCH=main) and select main in Plesk Git.'
    );
    addCheck(
      checks,
      'plesk_manual_deploy',
      boolValue(config.PLESK_MANUAL_DEPLOY),
      'Plesk Pull now and Deploy now require an operator action',
      'Set PLESK_MANUAL_DEPLOY=true after disabling automatic deployment in Plesk.'
    );
    addCheck(
      checks,
      'plesk_automation_disabled',
      !configured(config.PLESK_GIT_WEBHOOK_URL) && !boolValue(config.PLESK_CD_ENABLED),
      'No GitHub webhook or automatic Plesk deployment is enabled',
      'Remove PLESK_GIT_WEBHOOK_URL and keep PLESK_CD_ENABLED unset/false.'
    );
  }

  if (requireSql || boolValue(config.SQL_ENABLED)) {
    const runtimeUser = String(config.SQL_USER || '').trim();
    const migrationUser = String(config.SQL_MIGRATION_USER || '').trim();
    const plaintextException = boolValue(config.SQL_ALLOW_INSECURE_PRODUCTION)
      && config.SQL_PROVIDER === 'plesk'
      && config.SQL_HOST === APPROVED_PLESK_SQL_HOST
      && config.SQL_EXPECTED_HOST === APPROVED_PLESK_SQL_HOST
      && config.SQL_SSL_MODE === 'disabled'
      && !configured(config.SQL_SSL_CA_SECRET_NAME);
    const requiredFlags = [
      'SQL_ENABLED',
      'VERIFY_SQL_TRANSPORT',
      ...(!plaintextException ? [
        'SQL_STATIC_EGRESS_ENABLED',
        'SQL_NETWORK_ALLOWLIST_CONFIRMED',
      ] : []),
      'SQL_AT_REST_ENCRYPTION_CONFIRMED',
      'SQL_BACKUP_ENCRYPTION_CONFIRMED',
      ...(requireSql ? [
        'RUN_SQL_MIGRATIONS',
        'RUN_SQL_BACKFILL',
        'RUN_SQL_PROTECTION_AUDIT',
        'SQL_MIRROR_REQUIRE_PROTECTED_VALUES',
      ] : []),
    ];
    const disabledFlags = requiredFlags.filter((name) => !boolValue(config[name]));
    addCheck(
      checks,
      'sql_activation_flags',
      disabledFlags.length === 0,
      requireSql ? 'All SQL migration safety flags are enabled' : 'All SQL runtime activation flags are enabled',
      disabledFlags.length > 0 ? `Review and set true only after evidence exists: ${disabledFlags.join(', ')}` : ''
    );
    addCheck(
      checks,
      'sql_endpoint',
      config.SQL_PROVIDER === 'plesk'
        && config.SQL_HOST === APPROVED_PLESK_SQL_HOST
        && config.SQL_EXPECTED_HOST === APPROVED_PLESK_SQL_HOST
        && Number(config.SQL_PORT) === 3306,
      'MariaDB endpoint is pinned to the approved Plesk destination',
      `Set SQL_PROVIDER=plesk and SQL_HOST=SQL_EXPECTED_HOST=${APPROVED_PLESK_SQL_HOST}.`
    );
    const verifiedTls = config.SQL_SSL_MODE === 'verify_identity'
      && config.SQL_SSL_CA_SECRET_NAME === 'SQL_SSL_CA'
      && (configured(config.SQL_SSL_SERVERNAME) || boolValue(config.SQL_SSL_IP_SAN_CONFIRMED));
    addCheck(
      checks,
      'sql_tls_policy',
      verifiedTls || plaintextException,
      plaintextException
        ? 'MariaDB plaintext transport exception is explicitly limited to the approved Plesk endpoint'
        : 'MariaDB requires CA-pinned TLS identity verification',
      'Use verify_identity with a pinned CA, or explicitly approve disabled TLS only for the fixed Plesk endpoint.'
    );
    addCheck(
      checks,
      'sql_accounts',
      configured(config.SQL_DATABASE)
        && configured(runtimeUser)
        && (!requireSql || (configured(migrationUser) && runtimeUser !== migrationUser)),
      requireSql ? 'Runtime and migration MariaDB accounts are separate' : 'Runtime MariaDB account is configured',
      requireSql
        ? 'Set SQL_DATABASE, SQL_USER, and a distinct SQL_MIGRATION_USER as protected variables.'
        : 'Set SQL_DATABASE and SQL_USER as protected deployment variables.'
    );
    addCheck(
      checks,
      'event_registration_sql_primary',
      boolValue(config.SQL_EVENT_REGISTRATION_PRIMARY),
      'Event Registration uses MariaDB as its scoped primary repository',
      'Set SQL_EVENT_REGISTRATION_PRIMARY=true while keeping SQL_PRIMARY_STORE=false.'
    );
    if (requireSql) {
      addCheck(
        checks,
        'sql_migration_confirmation',
        String(config.CONFIRM_SQL_MIRROR_MIGRATION || '') === environment,
        'SQL mirror migration has an environment-specific confirmation',
        `Set CONFIRM_SQL_MIRROR_MIGRATION=${environment} only for the approved migration run.`
      );
      addCheck(
        checks,
        'sql_outbox_during_backfill',
        !boolValue(config.SQL_OUTBOX_ENABLED),
        'Live SQL outbox remains disabled during initial backfill',
        'Set SQL_OUTBOX_ENABLED=false for schema/backfill, then enable it in a reviewed follow-up release.'
      );
    }
    if (mariaDbProbe) {
      addCheck(
        checks,
        'sql_server_tls_capability',
        mariaDbProbe.reachable === true
          && (mariaDbProbe.tlsAdvertised === true || plaintextException),
        plaintextException
          ? 'MariaDB is reachable under the approved plaintext transport exception'
          : 'MariaDB greeting advertises TLS capability',
        'Enable TLS, or approve the endpoint-restricted Hostatom plaintext exception with a least-privilege runtime account.'
      );
    }
  }

  const blockers = checks.filter((check) => check.status === 'blocker');
  return {
    environment,
    scope: {
      web: requireWeb,
      sqlMirrorMigration: requireSql,
      primaryDatabaseCutover: false,
    },
    ready: blockers.length === 0,
    checks,
    blockerIds: blockers.map((check) => check.id),
  };
}

function loadConfiguration(environment) {
  const configPath = path.join(ROOT, 'deploy', 'environments', `${environment}.env`);
  const pinsPath = process.env.SECRET_VERSIONS_FILE
    || path.join(ROOT, 'deploy', 'secret-versions', `${environment}.json`);
  if (!fs.existsSync(configPath)) throw new Error(`Missing deployment config for ${environment}`);
  if (!fs.existsSync(pinsPath)) throw new Error(`Missing Secret Manager pin file for ${environment}`);
  return {
    config: {
      ...dotenv.parse(fs.readFileSync(configPath)),
      ...process.env,
    },
    pins: JSON.parse(fs.readFileSync(pinsPath, 'utf8')),
  };
}

function printText(report) {
  for (const check of report.checks) {
    const label = check.status === 'pass' ? 'PASS' : 'BLOCK';
    process.stdout.write(`[${label}] ${check.id}: ${check.message}\n`);
    if (check.remediation) process.stdout.write(`        ${check.remediation}\n`);
  }
  process.stdout.write(`Production readiness: ${report.ready ? 'READY' : 'BLOCKED'}\n`);
}

async function main() {
  const environment = process.argv.find((value) => ['staging', 'production'].includes(value)) || 'production';
  const requireSql = process.argv.includes('--sql');
  const requireWeb = process.argv.includes('--web');
  const shouldProbeMariaDb = process.argv.includes('--probe-mariadb');
  const { config, pins } = loadConfiguration(environment);
  let mariaDbProbe = null;

  if (requireSql && shouldProbeMariaDb) {
    try {
      mariaDbProbe = await probeMariaDbTls({
        host: config.SQL_HOST,
        port: Number(config.SQL_PORT || 3306),
        timeoutMs: 5000,
      });
    } catch (error) {
      mariaDbProbe = {
        reachable: false,
        tlsAdvertised: false,
        code: error.code || 'SQL_PROBE_FAILED',
      };
    }
  }

  const report = evaluateProductionReadiness({
    environment,
    config,
    pins,
    requireSql,
    requireWeb,
    mariaDbProbe,
  });
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else printText(report);
  if (!report.ready) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Production readiness check failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  evaluateProductionReadiness,
  requiredSecretNames,
  validatePin,
};

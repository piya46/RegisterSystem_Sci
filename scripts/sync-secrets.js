#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('../backend/node_modules/dotenv');

const ROOT = path.resolve(__dirname, '..');
const APPROVED_PROJECT_ID = 'cusa-reunion';
const GENERATED_SECRETS = new Set([
  'CSRF_SECRET',
  'DATA_BLIND_INDEX_SECRET',
  'JWT_SECRET',
  'OBJECT_STORAGE_LOCAL_SIGNING_SECRET',
  'SESSION_TOKEN_HASH_SECRET',
  'SLIP_PROOF_SECRET',
  'SQL_MIRROR_IDENTITY_HASH_SECRET',
  'VENDOR_QR_SECRET',
]);
const EXTERNAL_SECRETS = new Set([
  'BREVO_API_KEY',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_LOGIN_CHANNEL_SECRET',
  'LINE_WEBHOOK_CHANNEL_SECRET',
  'MONGODB_URI',
  'SMTP_PASS',
  'SMTP_USER',
  'SQL_MIGRATION_PASSWORD',
  'SQL_PASSWORD',
  'SQL_SSL_CA',
  'TURNSTILE_SECRET_KEY',
]);
const MIGRATION_ACCOUNT_SECRET_NAMES = Object.freeze([
  'MONGODB_URI',
  'SQL_MIGRATION_PASSWORD',
  'SQL_MIRROR_IDENTITY_HASH_SECRET',
  'SQL_SSL_CA',
]);
const FORBIDDEN_MIGRATION_PROJECT_SECRET_ROLES = new Set([
  'roles/editor',
  'roles/owner',
  'roles/secretmanager.admin',
  'roles/secretmanager.secretAccessor',
]);

function fail(message) {
  throw new Error(message);
}

function gcloud(args, { input = undefined, allowFailure = false } = {}) {
  const result = spawnSync('gcloud', args, {
    cwd: ROOT,
    encoding: 'utf8',
    input,
    maxBuffer: 10 * 1024 * 1024,
    stdio: input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const detail = String(result.stderr || result.stdout || '').trim().split('\n').slice(-3).join(' ');
    fail(`gcloud ${args.slice(0, 4).join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

function loadOptionalEnv(filePath) {
  return fs.existsSync(filePath) ? dotenv.parse(fs.readFileSync(filePath)) : {};
}

function normalizeSecretId(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function generatedSecretValue(name, keyId) {
  const key = crypto.randomBytes(32).toString('base64url');
  if (name === 'DATA_ENCRYPTION_KEYS') return JSON.stringify({ [keyId]: key });
  return key;
}

function latestEnabledVersion(projectId, secretId) {
  const result = gcloud([
    'secrets', 'versions', 'list', secretId,
    '--project', projectId,
    '--filter', 'state=enabled',
    '--sort-by', '~createTime',
    '--limit', '1',
    '--format', 'value(name)',
  ]);
  const raw = String(result.stdout || '').trim();
  const version = raw.split('/').pop();
  if (!/^\d+$/.test(version)) fail(`Secret ${secretId} has no enabled version`);
  return version;
}

function addVersion(projectId, secretId, value) {
  const result = gcloud([
    'secrets', 'versions', 'add', secretId,
    '--project', projectId,
    '--data-file=-',
    '--format', 'value(name)',
  ], { input: value });
  const version = String(result.stdout || '').trim().split('/').pop();
  if (!/^\d+$/.test(version)) fail(`Unable to resolve the new version for ${secretId}`);
  return version;
}

function grantSecretAccess(projectId, secretId, serviceAccount) {
  if (!serviceAccount) return;
  gcloud([
    'secrets', 'add-iam-policy-binding', secretId,
    '--project', projectId,
    '--member', `serviceAccount:${serviceAccount}`,
    '--role', 'roles/secretmanager.secretAccessor',
    '--quiet',
  ]);
}

function revokeSecretAccess(projectId, secretId, serviceAccount) {
  if (!serviceAccount) return false;
  const member = `serviceAccount:${serviceAccount}`;
  const policyResult = gcloud([
    'secrets', 'get-iam-policy', secretId,
    '--project', projectId,
    '--format', 'json',
  ]);
  let policy;
  try {
    policy = JSON.parse(policyResult.stdout || '{}');
  } catch {
    fail(`Unable to parse IAM policy for ${secretId}`);
  }
  const hasBinding = (policy.bindings || []).some((binding) => (
    binding.role === 'roles/secretmanager.secretAccessor'
      && Array.isArray(binding.members)
      && binding.members.includes(member)
  ));
  if (!hasBinding) return false;
  gcloud([
    'secrets', 'remove-iam-policy-binding', secretId,
    '--project', projectId,
    '--member', member,
    '--role', 'roles/secretmanager.secretAccessor',
    '--quiet',
  ]);
  return true;
}

function assertNoBroadMigrationSecretAccess(projectId, migrationAccount) {
  const member = `serviceAccount:${migrationAccount}`;
  const policyResult = gcloud([
    'projects', 'get-iam-policy', projectId,
    '--format', 'json',
  ]);
  let policy;
  try {
    policy = JSON.parse(policyResult.stdout || '{}');
  } catch {
    fail('Unable to parse project IAM policy while checking migration Secret access');
  }
  const forbiddenRoles = (policy.bindings || [])
    .filter((binding) => (
      FORBIDDEN_MIGRATION_PROJECT_SECRET_ROLES.has(binding.role)
      && Array.isArray(binding.members)
      && binding.members.includes(member)
    ))
    .map((binding) => binding.role)
    .sort();
  if (forbiddenRoles.length > 0) {
    fail(
      `Migration service account has forbidden project-level Secret access: ${forbiddenRoles.join(', ')}. `
      + 'Remove the broad binding and use per-secret IAM only.'
    );
  }
}

function resolveValue(name, values, keyId) {
  const direct = values[name];
  if (direct && !/^replace-with|^change-me|^example/i.test(String(direct))) return String(direct);
  if (name === 'DATA_ENCRYPTION_KEY' || name === 'FIELD_ENCRYPTION_KEY') {
    return generatedSecretValue(name, keyId);
  }
  if (name === 'DATA_ENCRYPTION_KEYS') return generatedSecretValue(name, keyId);
  if (GENERATED_SECRETS.has(name)) return generatedSecretValue(name, keyId);
  return '';
}

function buildRuntimeValues(config, invocationEnvironment = {}) {
  return {
    ...config,
    ...invocationEnvironment,
    NODE_ENV: 'production',
  };
}

function buildSecretSourceValues(localSecrets, config, invocationEnvironment = {}) {
  return {
    ...localSecrets,
    ...config,
    ...invocationEnvironment,
  };
}

function buildSecretAccessPlan(values = {}) {
  const profile = String(values.SECRET_SYNC_PROFILE || '').trim().toLowerCase();
  if (profile && !['sql-migration', 'sql-migration-cleanup'].includes(profile)) {
    fail('SECRET_SYNC_PROFILE must be sql-migration or sql-migration-cleanup when set');
  }
  const sqlProfileEnabled = profile === 'sql-migration';
  const cleanupOnly = profile === 'sql-migration-cleanup';
  const sqlMigrationEnabled = sqlProfileEnabled || String(values.RUN_SQL_MIGRATIONS) === 'true';
  const sqlBackfillEnabled = sqlProfileEnabled || String(values.RUN_SQL_BACKFILL) === 'true';
  const migrationAccessNames = new Set([
    ...((sqlMigrationEnabled || sqlBackfillEnabled)
      ? ['SQL_MIGRATION_PASSWORD', 'SQL_SSL_CA']
      : []),
    ...(sqlBackfillEnabled
      ? ['MONGODB_URI', 'SQL_MIRROR_IDENTITY_HASH_SECRET']
      : []),
  ]);
  return {
    cleanupOnly,
    profile,
    sqlBackfillEnabled,
    sqlMigrationEnabled,
    sqlProfileEnabled,
    migrationAccessNames: [...migrationAccessNames].sort(),
    conditionalMigrationNames: [...MIGRATION_ACCOUNT_SECRET_NAMES],
  };
}

function revokeInactiveMigrationAccess({
  projectId,
  prefix,
  migrationAccount,
  migrationAccessNames,
  processedNames = [],
  summary,
}) {
  const active = new Set(migrationAccessNames);
  const processed = new Set(processedNames);
  for (const name of MIGRATION_ACCOUNT_SECRET_NAMES) {
    if (active.has(name) || processed.has(name)) continue;
    const secretId = `${prefix}-${normalizeSecretId(name)}`;
    const describe = gcloud([
      'secrets', 'describe', secretId,
      '--project', projectId,
      '--format', 'value(name)',
    ], { allowFailure: true });
    if (describe.status !== 0) {
      summary.push({ name, iamAction: 'secret_absent' });
      continue;
    }
    const revoked = revokeSecretAccess(projectId, secretId, migrationAccount);
    summary.push({ name, iamAction: revoked ? 'migration_access_revoked' : 'migration_access_absent' });
  }
}

function main() {
  const environment = process.env.DEPLOY_ENVIRONMENT || process.argv[2] || 'staging';
  if (!['staging', 'production'].includes(environment)) fail('DEPLOY_ENVIRONMENT must be staging or production');
  if (process.env.ALLOW_SECRET_UPLOAD !== 'true') {
    fail('Secret synchronization and IAM changes require the explicit gate ALLOW_SECRET_UPLOAD=true');
  }

  const configPath = path.join(ROOT, 'deploy', 'environments', `${environment}.env`);
  const config = loadOptionalEnv(configPath);
  const localSecrets = loadOptionalEnv(process.env.SECRET_SOURCE_FILE || path.join(ROOT, 'backend', '.env'));
  const invocationEnvironment = { ...process.env };
  // Local .env values are a payload source only. They must never enable an
  // integration that is disabled in the reviewed deployment configuration.
  const values = buildRuntimeValues(config, invocationEnvironment);
  const secretSourceValues = buildSecretSourceValues(localSecrets, config, invocationEnvironment);
  Object.assign(process.env, values);

  const projectId = String(values.PROJECT_ID || values.GCP_PROJECT_ID || '').trim();
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) fail('PROJECT_ID is missing or invalid');
  if (projectId !== APPROVED_PROJECT_ID) fail(`PROJECT_ID must be the approved project ${APPROVED_PROJECT_ID}`);
  const prefix = normalizeSecretId(values.SECRET_MANAGER_PREFIX || `psevent-${environment}`);
  const runtimeAccountName = values.RUNTIME_SERVICE_ACCOUNT || `psevent-runtime-${environment}`;
  const migrationAccountName = values.MIGRATION_SERVICE_ACCOUNT || `psevent-migration-${environment}`;
  const runtimeAccount = runtimeAccountName.includes('@')
    ? runtimeAccountName
    : `${runtimeAccountName}@${projectId}.iam.gserviceaccount.com`;
  const migrationAccount = migrationAccountName.includes('@')
    ? migrationAccountName
    : `${migrationAccountName}@${projectId}.iam.gserviceaccount.com`;
  assertNoBroadMigrationSecretAccess(projectId, migrationAccount);
  const accessPlan = buildSecretAccessPlan(values);
  if (accessPlan.cleanupOnly) {
    if (String(values.CONFIRM_SQL_MIGRATION_ACCESS_REVOKE || '') !== environment) {
      fail(`sql-migration-cleanup requires CONFIRM_SQL_MIGRATION_ACCESS_REVOKE=${environment}`);
    }
    const summary = [];
    revokeInactiveMigrationAccess({
      projectId,
      prefix,
      migrationAccount,
      migrationAccessNames: [],
      summary,
    });
    process.stdout.write(`${JSON.stringify({
      environment,
      profile: accessPlan.profile,
      migrationAccount,
      secrets: summary,
    }, null, 2)}\n`);
    return;
  }

  const { managedRuntimeSecretNames } = require('../backend/src/config/runtimeSecrets');
  const names = new Set(managedRuntimeSecretNames());
  const {
    migrationAccessNames,
    conditionalMigrationNames,
    sqlBackfillEnabled,
    sqlMigrationEnabled,
    sqlProfileEnabled,
  } = accessPlan;
  if (sqlProfileEnabled) names.add('SQL_PASSWORD');
  if (sqlMigrationEnabled || sqlBackfillEnabled) names.add('SQL_MIGRATION_PASSWORD');
  if (sqlBackfillEnabled) names.add('SQL_MIRROR_IDENTITY_HASH_SECRET');
  if (sqlProfileEnabled || (String(values.SQL_ENABLED) === 'true' && values.SQL_SSL_CA_SECRET_NAME)) {
    names.add('SQL_SSL_CA');
  }
  const migrationAccessSet = new Set(migrationAccessNames);
  const conditionalMigrationSet = new Set(conditionalMigrationNames);

  const rotate = process.env.ROTATE_SECRETS === 'true';
  const keyId = values.DATA_ENCRYPTION_KEY_ID || 'v1';
  const pins = {};
  const summary = [];

  for (const name of [...names].sort()) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) fail(`Invalid secret environment name: ${name}`);
    const secretId = `${prefix}-${normalizeSecretId(name)}`;
    const describe = gcloud([
      'secrets', 'describe', secretId,
      '--project', projectId,
      '--format', 'value(name)',
    ], { allowFailure: true });
    const exists = describe.status === 0;
    let value = resolveValue(name, secretSourceValues, keyId);
    let action = 'pinned_existing';

    if (!exists) {
      if (!value) {
        const hint = EXTERNAL_SECRETS.has(name) ? 'Supply the integration credential in backend/.env or the process environment.' : '';
        fail(`Missing initial value for ${name}. ${hint}`.trim());
      }
      gcloud([
        'secrets', 'create', secretId,
        '--project', projectId,
        '--replication-policy', 'automatic',
        '--labels', `application=psevent,environment=${environment},managed-by=release-script`,
        '--quiet',
      ]);
      action = 'created';
    } else if (rotate && !value) {
      fail(`ROTATE_SECRETS=true but no source value is available for ${name}`);
    }

    let version;
    if (!exists || rotate) {
      version = addVersion(projectId, secretId, value);
      action = exists ? 'rotated' : action;
    } else {
      version = latestEnabledVersion(projectId, secretId);
    }
    value = '';

    if (name === 'SQL_MIGRATION_PASSWORD') {
      revokeSecretAccess(projectId, secretId, runtimeAccount);
    } else {
      grantSecretAccess(projectId, secretId, runtimeAccount);
    }
    if (migrationAccessSet.has(name)) {
      grantSecretAccess(projectId, secretId, migrationAccount);
    } else if (conditionalMigrationSet.has(name)) {
      revokeSecretAccess(projectId, secretId, migrationAccount);
    }
    const resource = `projects/${projectId}/secrets/${secretId}/versions/${version}`;
    pins[name] = resource;
    summary.push({ name, action, version });
  }
  revokeInactiveMigrationAccess({
    projectId,
    prefix,
    migrationAccount,
    migrationAccessNames,
    processedNames: names,
    summary,
  });

  const outputPath = process.env.SECRET_VERSIONS_FILE
    || path.join(ROOT, 'deploy', 'secret-versions', `${environment}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(pins, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(outputPath, 0o600);
  process.stdout.write(`${JSON.stringify({ environment, outputPath, secrets: summary }, null, 2)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Secret synchronization failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildRuntimeValues,
  buildSecretAccessPlan,
  buildSecretSourceValues,
};

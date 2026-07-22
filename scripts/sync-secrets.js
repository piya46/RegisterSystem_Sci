#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('../backend/node_modules/dotenv');

const ROOT = path.resolve(__dirname, '..');
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
  if (!serviceAccount) return;
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
  if (!hasBinding) return;
  gcloud([
    'secrets', 'remove-iam-policy-binding', secretId,
    '--project', projectId,
    '--member', member,
    '--role', 'roles/secretmanager.secretAccessor',
    '--quiet',
  ]);
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

function main() {
  const environment = process.env.DEPLOY_ENVIRONMENT || process.argv[2] || 'staging';
  if (!['staging', 'production'].includes(environment)) fail('DEPLOY_ENVIRONMENT must be staging or production');
  if (process.env.ALLOW_SECRET_UPLOAD !== 'true') {
    fail('Secret synchronization requires the explicit gate ALLOW_SECRET_UPLOAD=true');
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
  const prefix = normalizeSecretId(values.SECRET_MANAGER_PREFIX || `psevent-${environment}`);
  const runtimeAccountName = values.RUNTIME_SERVICE_ACCOUNT || `psevent-runtime-${environment}`;
  const migrationAccountName = values.MIGRATION_SERVICE_ACCOUNT || `psevent-migration-${environment}`;
  const runtimeAccount = runtimeAccountName.includes('@')
    ? runtimeAccountName
    : `${runtimeAccountName}@${projectId}.iam.gserviceaccount.com`;
  const migrationAccount = migrationAccountName.includes('@')
    ? migrationAccountName
    : `${migrationAccountName}@${projectId}.iam.gserviceaccount.com`;

  const { managedRuntimeSecretNames } = require('../backend/src/config/runtimeSecrets');
  const names = new Set(managedRuntimeSecretNames());
  if (String(values.RUN_SQL_MIGRATIONS) === 'true') names.add('SQL_MIGRATION_PASSWORD');
  if (values.SQL_SSL_CA_SECRET_NAME) names.add('SQL_SSL_CA');

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
    if (name === 'SQL_MIGRATION_PASSWORD' || name === 'SQL_SSL_CA') {
      grantSecretAccess(projectId, secretId, migrationAccount);
    }
    const resource = `projects/${projectId}/secrets/${secretId}/versions/${version}`;
    pins[name] = resource;
    summary.push({ name, action, version });
  }

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
  buildSecretSourceValues,
};

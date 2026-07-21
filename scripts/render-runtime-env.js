#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('../backend/node_modules/dotenv');

const ROOT = path.resolve(__dirname, '..');
const SECRET_VERSION_PATTERN = /^projects\/[a-z0-9][a-z0-9-]{4,28}[a-z0-9]\/secrets\/[A-Za-z0-9_-]+\/versions\/[0-9]+$/;

const CONFIG_KEYS = [
  'AUDIT_LOG_RETENTION_DAYS',
  'BCRYPT_SALT_ROUNDS',
  'CERTIFICATE_VERIFY_RATE_LIMIT_MAX',
  'CERTIFICATE_VERIFY_RATE_LIMIT_WINDOW_MS',
  'CLOUD_COST_TIMEZONE',
  'COOKIE_SAME_SITE',
  'COOKIE_SECURE',
  'DATA_ENCRYPTION_KEY_ID',
  'DONATION_IDEMPOTENCY_REQUIRED',
  'E2EE_STRICT_MODE',
  'EVENT_MEDIA_ALLOW_EXTERNAL_URLS',
  'FIELD_ENCRYPTION_ENABLED',
  'FIELD_ENCRYPTION_SECRET_NAME',
  'FIRESTORE_DATABASE_ID',
  'FIRESTORE_MAX_DAILY_DELETES',
  'FIRESTORE_MAX_DAILY_READS',
  'FIRESTORE_MAX_DAILY_WRITES',
  'FIRESTORE_MIRROR_ENABLED',
  'FIRESTORE_PAYMENT_STATUS_COLLECTION',
  'FIRESTORE_PAYMENT_STATUS_TTL_HOURS',
  'FIRESTORE_PROJECT_ID',
  'GCS_COST_CLASS_A_USD_PER_THOUSAND',
  'GCS_COST_CLASS_B_USD_PER_THOUSAND',
  'GCS_COST_INTERNET_EGRESS_USD_PER_GIB',
  'GCS_COST_STANDARD_STORAGE_USD_PER_GIB_MONTH',
  'GCS_COST_USD_TO_THB',
  'GCS_EXPECTED_MONTHLY_DOWNLOADS',
  'GCS_EXPECTED_MONTHLY_EGRESS_GIB',
  'GCS_EXPECTED_MONTHLY_UPLOADS',
  'GCS_LIFECYCLE_DELETE_GRACE_DAYS',
  'GCS_LOCATION',
  'GCS_MAX_BUCKET_RETENTION_DAYS',
  'GCS_MAX_DAILY_METADATA_OPS',
  'GCS_MAX_DAILY_PROJECTED_EGRESS_KIB',
  'GCS_MAX_DAILY_SIGNED_URL_OPS',
  'GCS_MAX_DAILY_UPLOAD_KIB',
  'GCS_MAX_DAILY_UPLOADS',
  'GCS_MAX_SOFT_DELETE_RETENTION_DAYS',
  'GCS_MONTHLY_BUDGET_THB',
  'GCS_OBJECT_PREFIX',
  'GCS_PRIVATE_SIGNED_URL_TTL_SECONDS',
  'GCS_PUBLIC_SIGNED_URL_TTL_SECONDS',
  'GCS_REJECT_CONFLICTING_LIFECYCLE',
  'GCS_REQUIRE_AUTOCLASS_DISABLED',
  'GCS_REQUIRE_DEFAULT_EVENT_HOLD_DISABLED',
  'GCS_REQUIRE_FLAT_NAMESPACE',
  'GCS_REQUIRE_LEGACY_UPLOADS_DISABLED',
  'GCS_REQUIRE_LIFECYCLE',
  'GCS_REQUIRE_SINGLE_REGION',
  'GCS_REQUIRE_STANDARD_STORAGE',
  'GCS_REQUIRE_VERSIONING_DISABLED',
  'GCS_SLIP_RETENTION_DAYS',
  'GCS_UNLINKED_UPLOAD_TTL_HOURS',
  'GCS_VALIDATE_BUCKET_ON_STARTUP',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLOUD_MONTHLY_BUDGET_THB',
  'GOOGLE_CLOUD_OPTIONAL_FEATURES_ENABLED',
  'GOOGLE_DRIVE_ENABLED',
  'GOOGLE_DRIVE_FOLDER_ID',
  'KMS_DATA_KEY_CACHE_TTL_MS',
  'KMS_DATA_KEY_ENABLED',
  'KMS_KEY_RESOURCE',
  'KMS_MAX_DAILY_CRYPTO_OPS',
  'LEGACY_UPLOADS_PUBLIC_ENABLED',
  'LINE_ALLOW_LEGACY_USER_ID_LOGIN',
  'LINE_LOGIN_ENABLED',
  'LINE_GROUP_ID',
  'LINE_LOGIN_CHANNEL_ID',
  'LINE_LOGIN_SCOPE',
  'LINE_MESSAGING_ENABLED',
  'LINE_WEBHOOK_ENABLED',
  'LOGIN_CLIENT_ID',
  'MOCK_EMAIL',
  'MONGODB_MAX_POOL_SIZE',
  'MONGODB_MIN_POOL_SIZE',
  'MONGODB_SERVER_SELECTION_TIMEOUT_MS',
  'OBJECT_STORAGE_CLEANUP_SCHEDULER_ENABLED',
  'OBJECT_STORAGE_PROVIDER',
  'PARTICIPANT_AUTH_OTP_TTL_MS',
  'PARTICIPANT_EMAIL_LOGIN_ENABLED',
  'PARTICIPANT_JWT_EXPIRES_IN',
  'PARTICIPANT_MAX_ACTIVE_SESSIONS',
  'PARTICIPANT_REGISTRATION_IDEMPOTENCY_REQUIRED',
  'PARTICIPANT_REQUIRE_SESSION_STORE',
  'PARTICIPANT_SESSION_ABSOLUTE_TIMEOUT',
  'PARTICIPANT_SESSION_PREVIOUS_TOKEN_GRACE',
  'PARTICIPANT_SESSION_TTL',
  'PARTICIPANT_STEP_UP_EXPIRES_IN',
  'PUBLIC_AGGREGATE_MIN_GROUP_SIZE',
  'PUBLIC_CACHE_TTL_MS',
  'PUBLIC_REPORT_MAX_ROWS',
  'REPORT_SCHEDULER_ENABLED',
  'SENSITIVE_AUDIT_STRICT',
  'SERVER_SHUTDOWN_TIMEOUT_MS',
  'SESSION_ABSOLUTE_TIMEOUT',
  'SESSION_IDLE_TIMEOUT',
  'SESSION_PREVIOUS_TOKEN_GRACE',
  'SESSION_REFRESH_THRESHOLD',
  'SLIP_PROOF_TTL_SECONDS',
  'SMTP_FROM',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SQL_ALLOW_INSECURE_PRODUCTION',
  'SQL_ALLOW_UNVERIFIED_TLS',
  'SQL_CONNECT_TIMEOUT_MS',
  'SQL_DATABASE',
  'SQL_DIALECT',
  'SQL_ENABLED',
  'SQL_HOST',
  'SQL_MAX_DAILY_READS',
  'SQL_MAX_DAILY_WRITES',
  'SQL_MAX_SYNC_LAG_SECONDS',
  'SQL_MIGRATION_LOCK_TIMEOUT_SECONDS',
  'SQL_MIGRATION_USER',
  'SQL_MIRROR_ENABLED',
  'SQL_OUTBOX_BATCH_SIZE',
  'SQL_OUTBOX_ENABLED',
  'SQL_OUTBOX_MAX_ATTEMPTS',
  'SQL_OUTBOX_POLL_INTERVAL_MS',
  'SQL_OUTBOX_STRICT',
  'SQL_POOL_IDLE_TIMEOUT_MS',
  'SQL_POOL_MAX',
  'SQL_POOL_MIN',
  'SQL_PORT',
  'SQL_PRIMARY_STORE',
  'SQL_PRIMARY_STORE_ACKNOWLEDGED',
  'SQL_QUERY_TIMEOUT_MS',
  'SQL_QUEUE_LIMIT',
  'SQL_RECEIPT_COUNTER_ENABLED',
  'SQL_SOCKET_PATH',
  'SQL_SSL_CA_SECRET_NAME',
  'SQL_SSL_MODE',
  'SQL_USER',
  'SQL_WALLET_LEDGER_ENABLED',
  'SUCCESS_SLIP_TTL_SECONDS',
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing deployment config: ${filePath}`);
  return dotenv.parse(fs.readFileSync(filePath));
}

function safeBucketName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    .slice(0, 63);
}

function resolveConfiguration() {
  const environment = process.env.DEPLOY_ENVIRONMENT || process.argv[2] || 'staging';
  if (!['staging', 'production'].includes(environment)) throw new Error('DEPLOY_ENVIRONMENT must be staging or production');
  const configPath = path.join(ROOT, 'deploy', 'environments', `${environment}.env`);
  const fileConfig = loadEnvFile(configPath);
  const config = { ...fileConfig, ...process.env };
  const projectId = String(config.PROJECT_ID || config.GCP_PROJECT_ID || '').trim();
  const projectNumber = String(config.PROJECT_NUMBER || '').trim();
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) throw new Error('PROJECT_ID is missing or invalid');
  if (!/^\d+$/.test(projectNumber)) throw new Error('PROJECT_NUMBER is missing or invalid');
  const service = String(config.SERVICE || '').trim();
  if (!/^[a-z][a-z0-9-]{0,48}[a-z0-9]$/.test(service)) throw new Error('SERVICE is missing or invalid');
  const region = String(config.REGION || '').trim();
  if (!/^[a-z]+(?:-[a-z]+)+\d+$/.test(region)) throw new Error('REGION is missing or invalid');

  const deterministicOrigin = `https://${service}-${projectNumber}.${region}.run.app`;
  const origin = String(config.APP_ORIGIN || deterministicOrigin).replace(/\/+$/, '');
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.protocol !== 'https:' || parsedOrigin.username || parsedOrigin.password
      || parsedOrigin.search || parsedOrigin.hash || parsedOrigin.pathname !== '/') {
    throw new Error('APP_ORIGIN must be an HTTPS origin without path, credentials, query, or fragment');
  }

  const gcsBucket = safeBucketName(config.GCS_BUCKET || `${projectId}-${service}-assets`);
  if (String(config.OBJECT_STORAGE_PROVIDER || 'gcs') === 'gcs' && gcsBucket.length < 3) {
    throw new Error('GCS_BUCKET could not be derived');
  }
  return { config, environment, gcsBucket, origin, projectId, region, service };
}

function readPins(environment) {
  const pinPath = process.env.SECRET_VERSIONS_FILE
    || path.join(ROOT, 'deploy', 'secret-versions', `${environment}.json`);
  const pins = JSON.parse(fs.readFileSync(pinPath, 'utf8'));
  if (!pins || Array.isArray(pins) || typeof pins !== 'object') throw new Error('Secret version pins must be a JSON object');
  for (const [name, resource] of Object.entries(pins)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name) || !SECRET_VERSION_PATTERN.test(String(resource))) {
      throw new Error(`Invalid Secret Manager pin for ${name}`);
    }
  }
  return pins;
}

function writeYaml(filePath, values) {
  const lines = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}: ${JSON.stringify(String(value))}`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

function main() {
  const { config, environment, gcsBucket, origin, projectId } = resolveConfiguration();
  const pins = readPins(environment);

  Object.assign(process.env, config, {
    NODE_ENV: 'production',
    GOOGLE_CLOUD_PROJECT: projectId,
    GCS_BUCKET: gcsBucket,
  });
  const { managedRuntimeSecretNames, requiredRuntimeSecretNames } = require('../backend/src/config/runtimeSecrets');
  const requiredNames = requiredRuntimeSecretNames();
  const missingPins = requiredNames.filter((name) => !pins[name]);
  if (missingPins.length > 0) {
    throw new Error(`Missing pinned Secret Manager versions: ${missingPins.join(', ')}`);
  }

  const configuredHostnames = String(config.TURNSTILE_ALLOWED_HOSTNAMES || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const turnstileHostnames = [...new Set([new URL(origin).hostname, ...configuredHostnames])].join(',');
  const values = {
    NODE_ENV: 'production',
    HOST: '0.0.0.0',
    RELEASE_ID: config.RELEASE_ID,
    SERVE_FRONTEND: 'true',
    FRONTEND_DIST_DIR: '/app/frontend/dist',
    PUBLIC_URL: origin,
    FRONTEND_URL: origin,
    CORS_ORIGIN: [origin, config.CORS_ORIGIN_EXTRA].filter(Boolean).join(','),
    COOKIE_SAME_SITE: config.COOKIE_SAME_SITE || 'lax',
    COOKIE_SECURE: 'true',
    TURNSTILE_ALLOWED_HOSTNAMES: turnstileHostnames,
    LINE_LOGIN_CALLBACK_URL: config.LINE_LOGIN_CALLBACK_URL || `${origin}/user/line/callback`,
    LINE_LOGIN_CALLBACK_URLS: config.LINE_LOGIN_CALLBACK_URLS || `${origin}/user/line/callback`,
    LOGIN_CLIENT_ID: config.LOGIN_CLIENT_ID || config.VITE_GOOGLE_CLIENT_ID,
    OBJECT_STORAGE_PUBLIC_API_ORIGIN: origin,
    GOOGLE_CLOUD_PROJECT: projectId,
    GCS_BUCKET: gcsBucket,
    SECRET_PROVIDER: 'google_secret_manager',
    SECRET_MANAGER_ENABLED: 'true',
    SECRET_MANAGER_PROJECT_ID: projectId,
    SECRET_MANAGER_PREFIX: config.SECRET_MANAGER_PREFIX,
    SECRET_MANAGER_CACHE_TTL_MS: config.SECRET_MANAGER_CACHE_TTL_MS || '300000',
    SECRET_MANAGER_MAX_DAILY_ACCESS_OPS: config.SECRET_MANAGER_MAX_DAILY_ACCESS_OPS || '200',
    SECRET_MANAGER_FAIL_CLOSED: 'true',
    SECRET_MANAGER_REQUIRE_PINNED_VERSIONS: 'true',
    SECRET_MANAGER_PINNED_VERSIONS_JSON: JSON.stringify(pins),
    SECRET_MANAGER_LOAD_NAMES: managedRuntimeSecretNames().join(','),
    RUNTIME_SECRET_VALIDATION_STRICT: 'true',
    LEGACY_UPLOADS_PUBLIC_ENABLED: config.LEGACY_UPLOADS_PUBLIC_ENABLED || 'false',
    GCS_VALIDATE_BUCKET_ON_STARTUP: config.GCS_VALIDATE_BUCKET_ON_STARTUP || 'true',
    GCS_REQUIRE_LIFECYCLE: config.GCS_REQUIRE_LIFECYCLE || 'true',
    GCS_REJECT_CONFLICTING_LIFECYCLE: config.GCS_REJECT_CONFLICTING_LIFECYCLE || 'true',
    GCS_REQUIRE_LEGACY_UPLOADS_DISABLED: config.GCS_REQUIRE_LEGACY_UPLOADS_DISABLED || 'true',
    GCS_REQUIRE_SINGLE_REGION: config.GCS_REQUIRE_SINGLE_REGION || 'true',
    GCS_REQUIRE_STANDARD_STORAGE: config.GCS_REQUIRE_STANDARD_STORAGE || 'true',
    GCS_REQUIRE_VERSIONING_DISABLED: config.GCS_REQUIRE_VERSIONING_DISABLED || 'true',
    GCS_REQUIRE_AUTOCLASS_DISABLED: config.GCS_REQUIRE_AUTOCLASS_DISABLED || 'true',
    GCS_REQUIRE_FLAT_NAMESPACE: config.GCS_REQUIRE_FLAT_NAMESPACE || 'true',
    GCS_REQUIRE_DEFAULT_EVENT_HOLD_DISABLED: config.GCS_REQUIRE_DEFAULT_EVENT_HOLD_DISABLED || 'true',
    GCS_MAX_SOFT_DELETE_RETENTION_DAYS: config.GCS_MAX_SOFT_DELETE_RETENTION_DAYS || '7',
    GCS_MAX_BUCKET_RETENTION_DAYS: config.GCS_MAX_BUCKET_RETENTION_DAYS || '0',
    DONATION_IDEMPOTENCY_REQUIRED: config.DONATION_IDEMPOTENCY_REQUIRED || 'true',
    PARTICIPANT_REGISTRATION_IDEMPOTENCY_REQUIRED: config.PARTICIPANT_REGISTRATION_IDEMPOTENCY_REQUIRED || 'true',
    ALLOW_LEGACY_CERTIFICATE_PARTICIPANT_ID: 'false',
    SQL_MIGRATION_WRITE: process.env.MIGRATION_MODE === 'true' ? 'true' : 'false',
  };

  for (const key of CONFIG_KEYS) {
    if (config[key] !== undefined && config[key] !== '') values[key] = config[key];
  }

  const cloudRunReservedNames = new Set(['PORT', 'K_SERVICE', 'K_REVISION', 'K_CONFIGURATION']);
  const reserved = Object.keys(values).filter((name) => (
    cloudRunReservedNames.has(name) || name.startsWith('X_GOOGLE_')
  ));
  if (reserved.length > 0) {
    throw new Error(`Cloud Run reserved environment variables cannot be rendered: ${reserved.join(', ')}`);
  }

  const forbidden = requiredNames.filter((name) => Object.hasOwn(values, name));
  if (forbidden.length > 0) throw new Error(`Secret values cannot be rendered into Cloud Run environment: ${forbidden.join(', ')}`);

  const outputPath = process.env.RUNTIME_ENV_FILE
    || path.join(ROOT, '.release', `runtime-${environment}.yaml`);
  writeYaml(outputPath, values);
  process.stdout.write(`${JSON.stringify({ environment, outputPath, requiredSecretNames: requiredNames })}\n`);
}

try {
  main();
} catch (error) {
  console.error(`Runtime configuration failed: ${error.message}`);
  process.exitCode = 1;
}

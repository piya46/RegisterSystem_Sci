const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { google } = require('googleapis');
const { boolEnv, recordCloudUsage } = require('./cloudCostGuardrail');
const {
  managedRuntimeSecretNames,
  requiredRuntimeSecretNames,
} = require('../config/runtimeSecrets');

const MIN_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const VERSION_RESOURCE_PATTERN = /^projects\/[^/]+\/secrets\/[^/]+\/versions\/[^/]+$/;

const cache = new Map();
const inFlight = new Map();
let secretManagerClient = null;
const state = {
  hydrated: false,
  provider: null,
  loadedNames: [],
  failedNames: [],
  loadedAt: null,
  lastError: null,
};

const ENV_ALIASES = {
  LINE_LOGIN_CHANNEL_SECRET: ['LINE_CLIENT_SECRET', 'LINE_CHANNEL_SECRET'],
  LINE_WEBHOOK_CHANNEL_SECRET: ['LINE_CHANNEL_SECRET'],
  KMS_WRAPPED_DATA_KEYS: ['GOOGLE_KMS_WRAPPED_DATA_KEYS'],
};

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function providerName() {
  if (boolEnv('SECRET_MANAGER_ENABLED', false)) return 'google_secret_manager';
  return String(process.env.SECRET_PROVIDER || 'env').trim().toLowerCase();
}

function failClosed() {
  return boolEnv('SECRET_MANAGER_FAIL_CLOSED', process.env.NODE_ENV === 'production');
}

function requirePinnedVersions() {
  return boolEnv('SECRET_MANAGER_REQUIRE_PINNED_VERSIONS', process.env.NODE_ENV === 'production');
}

function cacheTtlMs() {
  return Math.min(
    Math.max(numberEnv('SECRET_MANAGER_CACHE_TTL_MS', DEFAULT_CACHE_TTL_MS), MIN_CACHE_TTL_MS),
    MAX_CACHE_TTL_MS
  );
}

function parseJsonObject(envName) {
  const raw = String(process.env[envName] || '').trim();
  if (!raw) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${envName} must be a valid JSON object`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${envName} must be a JSON object`);
  }
  return parsed;
}

function validateSecretName(name) {
  const normalized = String(name || '').trim();
  if (!SECRET_NAME_PATTERN.test(normalized)) {
    throw new Error(`Invalid runtime secret name: ${normalized || '(empty)'}`);
  }
  return normalized;
}

function secretProjectId() {
  return process.env.SECRET_MANAGER_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || '';
}

function normalizeSecretIdPart(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function defaultSecretId(name) {
  const prefix = normalizeSecretIdPart(process.env.SECRET_MANAGER_PREFIX || 'psevent');
  const secretName = normalizeSecretIdPart(name);
  return [prefix, secretName].filter(Boolean).join('-');
}

function secretBaseResource(name) {
  const projectId = secretProjectId();
  if (!projectId) throw new Error('SECRET_MANAGER_PROJECT_ID is required for Google Secret Manager');

  const idMap = parseJsonObject('SECRET_MANAGER_SECRET_IDS_JSON');
  const configured = idMap[name];
  if (configured && typeof configured !== 'string') {
    throw new Error(`SECRET_MANAGER_SECRET_IDS_JSON.${name} must be a string`);
  }
  if (configured?.startsWith('projects/')) {
    if (!/^projects\/[^/]+\/secrets\/[^/]+$/.test(configured)) {
      throw new Error(`Invalid Secret Manager resource for ${name}`);
    }
    return configured;
  }

  const secretId = normalizeSecretIdPart(configured || defaultSecretId(name));
  if (!secretId) throw new Error(`Secret Manager secret id is missing for ${name}`);
  return `projects/${projectId}/secrets/${secretId}`;
}

function secretVersionResource(name) {
  const pins = parseJsonObject('SECRET_MANAGER_PINNED_VERSIONS_JSON');
  const configured = pins[name];

  if (typeof configured === 'string' && VERSION_RESOURCE_PATTERN.test(configured)) return configured;
  if (configured && typeof configured === 'object' && VERSION_RESOURCE_PATTERN.test(configured.resource || '')) {
    return configured.resource;
  }

  const version = typeof configured === 'object' ? configured.version : configured;
  if ((version === undefined || version === null || version === '') && requirePinnedVersions()) {
    throw new Error(`Pinned Secret Manager version is required for ${name}`);
  }
  const normalizedVersion = String(version || 'latest').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(normalizedVersion)) {
    throw new Error(`Invalid Secret Manager version for ${name}`);
  }
  return `${secretBaseResource(name)}/versions/${normalizedVersion}`;
}

function valueFingerprint(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

async function accessGoogleSecret(name) {
  const resource = secretVersionResource(name);
  const cached = cache.get(resource);
  if (cached && cached.expiresAt > Date.now()) return cached;
  if (inFlight.has(resource)) return inFlight.get(resource);

  const request = (async () => {
    recordCloudUsage('secretManagerAccess', 1, { optional: false });
    if (!secretManagerClient) {
      const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      secretManagerClient = google.secretmanager({ version: 'v1', auth });
    }
    const response = await secretManagerClient.projects.secrets.versions.access({ name: resource });
    const encoded = response.data?.payload?.data;
    if (!encoded) throw new Error(`Secret Manager returned an empty payload for ${name}`);

    const value = Buffer.from(encoded, 'base64').toString('utf8');
    if (!value) throw new Error(`Secret Manager returned an empty value for ${name}`);
    const item = {
      value,
      resource,
      fingerprint: valueFingerprint(value),
      expiresAt: Date.now() + cacheTtlMs(),
    };
    cache.set(resource, item);
    return item;
  })();

  inFlight.set(resource, request);
  try {
    return await request;
  } finally {
    inFlight.delete(resource);
  }
}

async function loadTestFile() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('file_for_test secret provider is only allowed when NODE_ENV=test');
  }
  const filePath = String(process.env.SECRET_TEST_FILE || '').trim();
  if (!filePath) throw new Error('SECRET_TEST_FILE is required for file_for_test provider');
  const parsed = JSON.parse(await fs.readFile(path.resolve(filePath), 'utf8'));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('SECRET_TEST_FILE must contain a JSON object');
  }
  return parsed;
}

async function loadSecret(name, { testValues = null } = {}) {
  const normalized = validateSecretName(name);
  const provider = providerName();

  if (provider === 'env') {
    const alias = (ENV_ALIASES[normalized] || []).find((candidate) => process.env[candidate]);
    const value = process.env[normalized] || (alias ? process.env[alias] : '');
    return value ? { value, source: 'env', resource: null, fingerprint: valueFingerprint(value) } : null;
  }
  if (provider === 'file_for_test') {
    const value = testValues?.[normalized];
    return value ? { value: String(value), source: provider, resource: null, fingerprint: valueFingerprint(value) } : null;
  }
  if (provider !== 'google_secret_manager') {
    throw new Error(`Unsupported SECRET_PROVIDER: ${provider}`);
  }

  try {
    const item = await accessGoogleSecret(normalized);
    return { ...item, source: provider };
  } catch (error) {
    const alias = (ENV_ALIASES[normalized] || []).find((candidate) => process.env[candidate]);
    const fallbackValue = process.env[normalized] || (alias ? process.env[alias] : '');
    if (!failClosed() && fallbackValue) {
      const value = fallbackValue;
      return { value, source: 'env_fallback', resource: null, fingerprint: valueFingerprint(value) };
    }
    const wrapped = new Error(`Unable to load required runtime secret ${normalized}`);
    wrapped.code = error.code || 'SECRET_LOAD_FAILED';
    wrapped.cause = error;
    throw wrapped;
  }
}

function validateRuntimeSecret(name, value) {
  if (!value) throw new Error(`Required runtime secret ${name} is missing`);
  if (process.env.NODE_ENV !== 'production' && !boolEnv('RUNTIME_SECRET_VALIDATION_STRICT', false)) return;

  if (/^replace-with|^change-me|^example/i.test(value)) {
    throw new Error(`Required runtime secret ${name} still uses a placeholder value`);
  }
  if (['JWT_SECRET', 'SESSION_TOKEN_HASH_SECRET', 'CSRF_SECRET', 'VENDOR_QR_SECRET', 'SLIP_PROOF_SECRET', 'OBJECT_STORAGE_LOCAL_SIGNING_SECRET'].includes(name)
      && Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error(`Required runtime secret ${name} must be at least 32 bytes`);
  }
  if (name === 'MONGODB_URI' && !/^mongodb(?:\+srv)?:\/\//.test(value)) {
    throw new Error('MONGODB_URI must use mongodb:// or mongodb+srv://');
  }
  if (['SQL_PASSWORD', 'SQL_MIGRATION_PASSWORD'].includes(name) && Buffer.byteLength(value, 'utf8') < 16) {
    throw new Error(`${name} must be at least 16 bytes in strict mode`);
  }
  if (name === 'SQL_MIRROR_IDENTITY_HASH_SECRET' && Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error('SQL_MIRROR_IDENTITY_HASH_SECRET must be at least 32 bytes in strict mode');
  }
}

function validateSecretSeparation() {
  if (process.env.NODE_ENV !== 'production' && !boolEnv('RUNTIME_SECRET_VALIDATION_STRICT', false)) return;
  const groups = [
    ['JWT_SECRET', 'SESSION_TOKEN_HASH_SECRET'],
    ['JWT_SECRET', 'CSRF_SECRET'],
    ['VENDOR_QR_SECRET', 'SLIP_PROOF_SECRET'],
    ['JWT_SECRET', 'OBJECT_STORAGE_LOCAL_SIGNING_SECRET'],
  ];
  for (const [left, right] of groups) {
    if (process.env[left] && process.env[left] === process.env[right]) {
      throw new Error(`${left} and ${right} must use different values`);
    }
  }
}

async function hydrateRuntimeSecrets({ requiredNames = null, managedNames = null } = {}) {
  const provider = providerName();
  const required = new Set((requiredNames || requiredRuntimeSecretNames()).map(validateSecretName));
  const names = [...new Set([
    ...(managedNames || managedRuntimeSecretNames()),
    ...required,
  ].map(validateSecretName))];
  const testValues = provider === 'file_for_test' ? await loadTestFile() : null;
  const loaded = [];
  const failed = [];

  state.hydrated = false;
  state.provider = provider;
  state.loadedNames = [];
  state.failedNames = [];
  state.loadedAt = null;
  state.lastError = null;

  for (const name of names) {
    try {
      const item = await loadSecret(name, { testValues });
      if (!item) {
        if (required.has(name)) throw new Error(`Required runtime secret ${name} is missing`);
        continue;
      }
      validateRuntimeSecret(name, item.value);
      process.env[name] = item.value;
      loaded.push({ name, source: item.source, resource: item.resource || null, fingerprint: item.fingerprint });
    } catch (error) {
      failed.push({ name, code: error.code || 'SECRET_VALIDATION_FAILED' });
      if (required.has(name) || failClosed()) {
        state.failedNames = failed.map((item) => item.name);
        state.lastError = error.message;
        throw error;
      }
    }
  }

  for (const name of required) validateRuntimeSecret(name, process.env[name]);
  validateSecretSeparation();

  state.hydrated = true;
  state.loadedNames = loaded.map((item) => item.name);
  state.failedNames = failed.map((item) => item.name);
  state.loadedAt = new Date().toISOString();
  return {
    provider,
    loaded,
    failed,
    loadedAt: state.loadedAt,
  };
}

function secretProviderStatus() {
  return {
    hydrated: state.hydrated,
    provider: state.provider || providerName(),
    loadedCount: state.loadedNames.length,
    failedCount: state.failedNames.length,
    loadedAt: state.loadedAt,
    healthy: state.hydrated && !state.lastError,
  };
}

function clearSecretCache() {
  cache.clear();
  inFlight.clear();
  secretManagerClient = null;
}

module.exports = {
  clearSecretCache,
  hydrateRuntimeSecrets,
  loadSecret,
  secretProviderStatus,
};

const { google } = require('googleapis');
const {
  boolEnv,
  recordCloudUsage,
} = require('./cloudCostGuardrail');

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const MIN_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_TTL_MS = 15 * 60 * 1000;

const cache = {
  keys: new Map(),
  expiresAt: 0,
  timer: null,
  lastError: null,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function kmsDataKeyEnabled() {
  return boolEnv('KMS_DATA_KEY_ENABLED', boolEnv('GOOGLE_KMS_ENABLED', false));
}

function kmsDataKeyRequired() {
  return kmsDataKeyEnabled() && String(process.env.FIELD_ENCRYPTION_ENABLED || '').toLowerCase() !== 'false';
}

function cacheTtlMs() {
  const value = Number(process.env.KMS_DATA_KEY_CACHE_TTL_MS || process.env.KMS_CACHE_TTL_MS);
  return clamp(Number.isFinite(value) ? value : DEFAULT_CACHE_TTL_MS, MIN_CACHE_TTL_MS, MAX_CACHE_TTL_MS);
}

function parseWrappedKeyMap(raw) {
  const keys = new Map();
  if (!raw) return keys;

  const trimmed = String(raw).trim();
  let entries = [];
  if (trimmed.startsWith('{')) {
    entries = Object.entries(JSON.parse(trimmed));
  } else {
    entries = trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separator = item.includes('=') ? '=' : ':';
        const index = item.indexOf(separator);
        if (index <= 0) throw new Error('KMS_WRAPPED_DATA_KEYS entries must use kid=ciphertext');
        return [item.slice(0, index).trim(), item.slice(index + 1).trim()];
      });
  }

  for (const [kid, ciphertext] of entries) {
    if (!kid || !ciphertext) throw new Error('KMS_WRAPPED_DATA_KEYS requires non-empty key ids and ciphertext values');
    keys.set(String(kid), String(ciphertext));
  }
  return keys;
}

function wrappedDataKeys() {
  return parseWrappedKeyMap(process.env.KMS_WRAPPED_DATA_KEYS || process.env.GOOGLE_KMS_WRAPPED_DATA_KEYS);
}

function kmsKeyResource() {
  return process.env.KMS_KEY_RESOURCE || process.env.GOOGLE_KMS_KEY_RESOURCE || '';
}

function validatePlaintextKey(kid, plaintextBase64) {
  const decoded = Buffer.from(String(plaintextBase64 || ''), 'base64');
  if (decoded.length !== 32) {
    throw new Error(`KMS plaintext for DATA_ENCRYPTION_KEY_ID=${kid} must be a 32-byte data key`);
  }
  return plaintextBase64;
}

async function unwrapKmsDataKeys() {
  if (!kmsDataKeyEnabled()) return new Map();

  const name = kmsKeyResource();
  const wrapped = wrappedDataKeys();
  if (!name) throw new Error('KMS_KEY_RESOURCE is required when KMS_DATA_KEY_ENABLED=true');
  if (wrapped.size === 0) throw new Error('KMS_WRAPPED_DATA_KEYS is required when KMS_DATA_KEY_ENABLED=true');

  recordCloudUsage('kmsCryptoOps', wrapped.size, { optional: false });

  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloudkms'] });
  const cloudkms = google.cloudkms({ version: 'v1', auth });
  const unwrapped = new Map();

  for (const [kid, ciphertext] of wrapped.entries()) {
    const result = await cloudkms.projects.locations.keyRings.cryptoKeys.decrypt({
      name,
      requestBody: { ciphertext },
    });
    const plaintext = result.data?.plaintext;
    unwrapped.set(kid, validatePlaintextKey(kid, plaintext));
  }

  return unwrapped;
}

async function refreshKmsDataKeys() {
  const keys = await unwrapKmsDataKeys();
  cache.keys = keys;
  cache.expiresAt = Date.now() + cacheTtlMs();
  cache.lastError = null;
  return keys;
}

async function initializeKmsDataKeys() {
  if (!kmsDataKeyEnabled()) return { enabled: false };

  const keys = await refreshKmsDataKeys();
  const refreshMs = Math.floor(cacheTtlMs() * 0.8);
  if (cache.timer) clearInterval(cache.timer);
  cache.timer = setInterval(() => {
    refreshKmsDataKeys().catch((err) => {
      cache.lastError = err;
      console.error('KMS data key refresh failed:', err.message);
    });
  }, refreshMs);
  if (typeof cache.timer.unref === 'function') cache.timer.unref();

  return { enabled: true, keyCount: keys.size, expiresAt: new Date(cache.expiresAt).toISOString() };
}

function getCachedKmsDataKeys() {
  if (!kmsDataKeyEnabled()) return new Map();
  if (cache.expiresAt <= Date.now()) return new Map();
  return new Map(cache.keys);
}

function kmsDataKeyStatus() {
  return {
    enabled: kmsDataKeyEnabled(),
    required: kmsDataKeyRequired(),
    cachedKeyCount: cache.keys.size,
    expiresAt: cache.expiresAt ? new Date(cache.expiresAt).toISOString() : null,
    lastError: cache.lastError ? cache.lastError.message : null,
  };
}

function shutdownKmsDataKeys() {
  if (cache.timer) clearInterval(cache.timer);
  cache.timer = null;
  cache.keys.clear();
  cache.expiresAt = 0;
  cache.lastError = null;
}

module.exports = {
  getCachedKmsDataKeys,
  initializeKmsDataKeys,
  kmsDataKeyRequired,
  kmsDataKeyStatus,
  refreshKmsDataKeys,
  shutdownKmsDataKeys,
};

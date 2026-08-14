const crypto = require('crypto');
const {
  getCachedKmsDataKeys,
  kmsDataKeyRequired,
} = require('./kmsDataKeys');

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const MARKER = '__enc';

const DEFAULT_SENSITIVE_FIELDS = [
  'name',
  'fullName',
  'fullname',
  'nickname',
  'phone',
  'email',
  'usr_add',
  'usr_add_post',
  'address',
  'department',
  'dept',
  'date_year',
  'nationalId',
  'citizenId',
  'idCard',
];

const DEFAULT_BLIND_INDEX_FIELDS = [
  'name',
  'fullName',
  'fullname',
  'phone',
  'email',
  'nationalId',
  'citizenId',
  'idCard',
];

const DEFAULT_SENSITIVE_DONATION_FIELDS = [
  'firstName',
  'lastName',
  'address',
  'slipUrl',
];

const DEFAULT_SEARCH_FIELDS = [
  'name',
  'fullName',
  'fullname',
  'phone',
  'email',
  'nationalId',
  'citizenId',
  'idCard',
];

function listFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseKey(raw, { allowHashFallback = false } = {}) {
  if (!raw) return null;
  const value = String(raw).trim();
  if (/^[a-f0-9]{64}$/i.test(value)) return Buffer.from(value, 'hex');

  try {
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length === 32) return decoded;
  } catch {
    // fall through to hash-derived key below
  }

  return allowHashFallback ? crypto.createHash('sha256').update(value).digest() : null;
}

function parseKeyMap(raw) {
  const keys = new Map();
  if (!raw) return keys;

  const trimmed = String(raw).trim();
  let entries = [];

  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    entries = Object.entries(parsed);
  } else {
    entries = trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separator = item.includes('=') ? '=' : ':';
        const index = item.indexOf(separator);
        if (index <= 0) throw new Error('DATA_ENCRYPTION_KEYS entries must use kid=key');
        return [item.slice(0, index).trim(), item.slice(index + 1).trim()];
      });
  }

  for (const [kid, value] of entries) {
    const key = parseKey(value);
    if (!kid || !key) {
      throw new Error('DATA_ENCRYPTION_KEYS must map each key id to a 32-byte key encoded as 64 hex characters or base64');
    }
    keys.set(String(kid), key);
  }

  return keys;
}

function activeKeyId() {
  return process.env.DATA_ENCRYPTION_KEY_ID || 'v1';
}

function configuredEncryptionKeys() {
  const keys = parseKeyMap(process.env.DATA_ENCRYPTION_KEYS);
  for (const [kid, value] of getCachedKmsDataKeys().entries()) {
    const kmsKey = parseKey(value);
    if (!kmsKey) throw new Error(`KMS data key ${kid} must be a 32-byte key encoded as base64`);
    keys.set(String(kid), kmsKey);
  }
  const legacyRaw = process.env.DATA_ENCRYPTION_KEY || process.env.FIELD_ENCRYPTION_KEY;
  if (legacyRaw) {
    const legacyKey = parseKey(legacyRaw);
    if (!legacyKey) throw new Error('DATA_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters or base64');
    keys.set(activeKeyId(), legacyKey);
  }
  if (keys.size === 0 && kmsDataKeyRequired()) {
    throw new Error('KMS data key cache is unavailable. Refusing to encrypt/decrypt sensitive fields.');
  }
  return keys;
}

function activeEncryptionKey() {
  const keys = configuredEncryptionKeys();
  if (keys.size === 0) return null;
  const kid = activeKeyId();
  if (!keys.has(kid)) {
    throw new Error(`DATA_ENCRYPTION_KEY_ID=${kid} is not present in DATA_ENCRYPTION_KEYS`);
  }
  return keys.get(kid);
}

function decryptionKey(kid) {
  const keys = configuredEncryptionKeys();
  if (keys.size === 0) return null;
  if (!kid) return activeEncryptionKey();
  if (!keys.has(kid)) {
    throw new Error(`Missing data encryption key for encrypted value kid=${kid}`);
  }
  return keys.get(kid);
}

function blindIndexSecret() {
  const explicitSecret = parseKey(
    process.env.DATA_BLIND_INDEX_SECRET ||
    process.env.SESSION_TOKEN_HASH_SECRET,
    { allowHashFallback: true }
  );
  if (explicitSecret) return explicitSecret;
  return activeEncryptionKey();
}

function encryptionEnabled() {
  if (String(process.env.FIELD_ENCRYPTION_ENABLED || '').toLowerCase() === 'false') return false;
  return Boolean(activeEncryptionKey());
}

function e2eeStrictMode() {
  return ['true', '1', 'strict'].includes(String(process.env.E2EE_STRICT_MODE || '').toLowerCase());
}

function isEncryptedValue(value) {
  return Boolean(value && typeof value === 'object' && value[MARKER] === ENCRYPTION_ALGORITHM);
}

function normalizeForBlindIndex(value) {
  return String(value ?? '').trim().toLowerCase();
}

function blindIndex(field, value) {
  const secret = blindIndexSecret();
  const normalized = normalizeForBlindIndex(value);
  if (!secret || !normalized) return null;
  return crypto
    .createHmac('sha256', secret)
    .update(`${field}:${normalized}`)
    .digest('hex');
}

function encryptPlainValue(value) {
  const key = activeEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    [MARKER]: ENCRYPTION_ALGORITHM,
    kid: activeKeyId(),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64'),
  };
}

function encryptValue(value) {
  if (!encryptionEnabled()) return value;
  if (value === undefined || value === null || value === '') return value;
  if (isEncryptedValue(value)) return value;
  return encryptPlainValue(value);
}

function decryptValue(value) {
  if (!isEncryptedValue(value)) return value;
  if (e2eeStrictMode()) {
    const err = new Error('E2EE_STRICT_MODE blocks server-side decrypt. Decrypt this value on a trusted client.');
    err.code = 'E2EE_CLIENT_DECRYPT_REQUIRED';
    err.statusCode = 409;
    throw err;
  }
  const key = decryptionKey(value.kid);
  if (!key) throw new Error(`Missing data encryption key for encrypted value kid=${value.kid || 'unknown'}`);

  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(value.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.data, 'base64')),
    decipher.final(),
  ]).toString('utf8');

  return JSON.parse(plaintext);
}

function encryptedKeyId(value) {
  return isEncryptedValue(value) ? value.kid || 'v1' : null;
}

function needsKeyRotation(value) {
  return isEncryptedValue(value) && encryptedKeyId(value) !== activeKeyId();
}

function reencryptValue(value) {
  if (!encryptionEnabled()) return value;
  if (value === undefined || value === null || value === '') return value;
  const plaintext = decryptValue(value);
  return encryptPlainValue(plaintext);
}

function participantSensitiveFields() {
  return listFromEnv('SENSITIVE_PARTICIPANT_FIELDS', DEFAULT_SENSITIVE_FIELDS);
}

function participantBlindIndexFields() {
  return listFromEnv('BLIND_INDEX_PARTICIPANT_FIELDS', DEFAULT_BLIND_INDEX_FIELDS);
}

function participantSearchFields() {
  return listFromEnv('SEARCH_INDEX_PARTICIPANT_FIELDS', DEFAULT_SEARCH_FIELDS);
}

function tokenizeForSearch(value) {
  const normalized = normalizeForBlindIndex(value).replace(/\s+/g, ' ');
  if (!normalized) return [];
  const tokens = new Set([normalized]);

  for (const part of normalized.split(' ')) {
    if (!part) continue;
    tokens.add(part);
    for (let size = 2; size <= Math.min(part.length, 24); size += 1) {
      tokens.add(part.slice(0, size));
    }
  }

  const digits = normalized.replace(/\D/g, '');
  if (digits.length >= 4) {
    tokens.add(digits);
    tokens.add(digits.slice(-4));
  }

  return [...tokens];
}

function searchToken(field, token) {
  const secret = blindIndexSecret();
  if (!secret || !token) return null;
  return crypto
    .createHmac('sha256', secret)
    .update(`search:${field}:${token}`)
    .digest('hex');
}

function participantSearchTokens(fields = {}) {
  const tokens = new Set();
  for (const field of participantSearchFields()) {
    for (const token of tokenizeForSearch(fields?.[field])) {
      const index = searchToken(field, token);
      if (index) tokens.add(index);
    }
  }
  return [...tokens];
}

function participantSearchTokensForQuery(query) {
  const tokens = new Set();
  const queryTokens = tokenizeForSearch(query);
  for (const field of participantSearchFields()) {
    for (const token of queryTokens) {
      const index = searchToken(field, token);
      if (index) tokens.add(index);
    }
  }
  return [...tokens];
}

function protectParticipantFields(fields = {}) {
  const sensitive = new Set(participantSensitiveFields());
  return Object.fromEntries(
    Object.entries(fields || {}).map(([field, value]) => [
      field,
      sensitive.has(field) ? encryptValue(value) : value,
    ])
  );
}

function donationSensitiveFields() {
  return listFromEnv('SENSITIVE_DONATION_FIELDS', DEFAULT_SENSITIVE_DONATION_FIELDS);
}

function protectDonationPayload(payload = {}) {
  const sensitive = new Set(donationSensitiveFields());
  return Object.fromEntries(
    Object.entries(payload || {}).map(([field, value]) => [
      field,
      sensitive.has(field) ? encryptValue(value) : value,
    ])
  );
}

function revealDonationObject(donation) {
  if (!donation) return donation;
  const obj = typeof donation.toObject === 'function' ? donation.toObject() : { ...donation };
  for (const field of donationSensitiveFields()) {
    if (obj[field] !== undefined) obj[field] = decryptValue(obj[field]);
  }
  return obj;
}

function revealParticipantFields(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields || {}).map(([field, value]) => [field, decryptValue(value)])
  );
}

function participantBlindIndexes(fields = {}) {
  const indexes = {};
  for (const field of participantBlindIndexFields()) {
    const value = fields?.[field];
    const index = blindIndex(field, value);
    if (index) indexes[field] = index;
  }
  return indexes;
}

function participantFieldMatch(field, value) {
  const index = blindIndex(field, value);
  if (!index) return { [`fields.${field}`]: value };
  return {
    $or: [
      { [`fields.${field}`]: value },
      { [`secureIndex.${field}`]: index },
    ],
  };
}

function revealParticipantObject(participant) {
  if (!participant) return participant;
  const obj = typeof participant.toObject === 'function' ? participant.toObject() : { ...participant };
  obj.fields = revealParticipantFields(obj.fields || {});
  obj.specialAssistance = decryptValue(obj.specialAssistance);
  return obj;
}

module.exports = {
  blindIndex,
  decryptValue,
  donationSensitiveFields,
  e2eeStrictMode,
  encryptedKeyId,
  encryptValue,
  encryptionEnabled,
  isEncryptedValue,
  needsKeyRotation,
  participantBlindIndexes,
  participantBlindIndexFields,
  participantFieldMatch,
  participantSearchFields,
  participantSearchTokens,
  participantSearchTokensForQuery,
  participantSensitiveFields,
  protectParticipantFields,
  protectDonationPayload,
  reencryptValue,
  revealDonationObject,
  revealParticipantFields,
  revealParticipantObject,
};

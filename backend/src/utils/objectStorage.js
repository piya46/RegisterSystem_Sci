const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const StoredObject = require('../models/storedObject');
const { boolEnv, recordCloudUsage } = require('./cloudCostGuardrail');
const { optimizeImage } = require('./imageOptimization');

const KIB = 1024;
const PUBLIC_PURPOSES = new Set(['event_media', 'payment_qr', 'avatar']);
const PRIVATE_PURPOSES = new Set(['payment_slip']);
const signedUrlCache = new Map();
let gcsClient = null;

const state = {
  initialized: false,
  healthy: true,
  provider: 'local',
  validatedAt: null,
  lastErrorCode: null,
  bucketPolicy: null,
};

function integerEnv(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number(process.env[name]);
  const normalized = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(Math.max(normalized, min), max);
}

function objectStorageProvider() {
  return String(process.env.OBJECT_STORAGE_PROVIDER || 'local').trim().toLowerCase();
}

function objectStorageEnabled() {
  return objectStorageProvider() === 'gcs';
}

function localRoot() {
  return path.resolve(process.env.OBJECT_STORAGE_LOCAL_ROOT || path.join(__dirname, '../../uploads/objects'));
}

function gcsBucketName() {
  return String(process.env.GCS_BUCKET || '').trim();
}

function isRegionalGcsLocation(value) {
  return /^[a-z]+(?:-[a-z]+)+\d+$/.test(String(value || '').trim().toLowerCase());
}

function normalizedPrefix() {
  return String(process.env.GCS_OBJECT_PREFIX || process.env.NODE_ENV || 'development')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/^\/+|\/+$/g, '') || 'development';
}

function purposeVisibility(purpose) {
  if (PUBLIC_PURPOSES.has(purpose)) return 'public';
  if (PRIVATE_PURPOSES.has(purpose)) return 'private';
  const error = new Error('Unsupported object storage purpose');
  error.code = 'OBJECT_STORAGE_PURPOSE_UNSUPPORTED';
  error.statusCode = 400;
  throw error;
}

function assertObjectStorageConfiguration() {
  const provider = objectStorageProvider();
  if (!['local', 'gcs'].includes(provider)) throw new Error('OBJECT_STORAGE_PROVIDER must be local or gcs');
  if (provider === 'gcs') {
    if (!gcsBucketName()) throw new Error('GCS_BUCKET is required when OBJECT_STORAGE_PROVIDER=gcs');
    const location = String(process.env.GCS_LOCATION || '').trim();
    if (!location) throw new Error('GCS_LOCATION is required when OBJECT_STORAGE_PROVIDER=gcs');
    if (boolEnv('GCS_REQUIRE_SINGLE_REGION', process.env.NODE_ENV === 'production')
        && !isRegionalGcsLocation(location)) {
      throw new Error('GCS_LOCATION must be a single region when GCS_REQUIRE_SINGLE_REGION=true');
    }
    if (process.env.NODE_ENV === 'production'
        && boolEnv('GCS_REQUIRE_LEGACY_UPLOADS_DISABLED', true)
        && boolEnv('LEGACY_UPLOADS_PUBLIC_ENABLED', false)) {
      throw new Error('LEGACY_UPLOADS_PUBLIC_ENABLED must be false after switching production to GCS');
    }
  }
  const privateTtl = integerEnv('GCS_PRIVATE_SIGNED_URL_TTL_SECONDS', 300, { min: 60, max: 3600 });
  const publicTtl = integerEnv('GCS_PUBLIC_SIGNED_URL_TTL_SECONDS', 3600, { min: 300, max: 604800 });
  if (privateTtl > publicTtl) throw new Error('Private signed URL TTL cannot exceed public signed URL TTL');
  const configuredOrigin = String(
    process.env.OBJECT_STORAGE_PUBLIC_API_ORIGIN || process.env.PUBLIC_URL || ''
  ).trim();
  if (configuredOrigin) {
    let parsed;
    try {
      parsed = new URL(configuredOrigin);
    } catch {
      throw new Error('OBJECT_STORAGE_PUBLIC_API_ORIGIN must be an absolute URL');
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
      throw new Error('OBJECT_STORAGE_PUBLIC_API_ORIGIN must contain only scheme, host, and optional port');
    }
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      throw new Error('OBJECT_STORAGE_PUBLIC_API_ORIGIN must use HTTPS in production');
    }
  }
}

function storageClient() {
  if (!gcsClient) {
    gcsClient = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || undefined,
    });
  }
  return gcsClient;
}

function expectedLifecyclePrefix() {
  return `${normalizedPrefix()}/payment_slip/`;
}

function lifecycleHasSlipDeletion(metadata) {
  const retentionDays = integerEnv('GCS_SLIP_RETENTION_DAYS', 365, { min: 30, max: 3650 });
  const unlinkedHours = integerEnv('GCS_UNLINKED_UPLOAD_TTL_HOURS', 24, { min: 1, max: 168 });
  const graceDays = integerEnv('GCS_LIFECYCLE_DELETE_GRACE_DAYS', 2, { min: 1, max: 30 });
  const minimumAge = retentionDays + Math.ceil(unlinkedHours / 24) + graceDays;
  return (metadata.lifecycle?.rule || []).some((rule) => {
    const action = String(rule.action?.type || '').toLowerCase();
    const prefixes = rule.condition?.matchesPrefix || [];
    const age = Number(rule.condition?.age);
    return action === 'delete'
      && age >= minimumAge
      && age <= minimumAge + 30
      && prefixes.includes(expectedLifecyclePrefix());
  });
}

function conflictingLifecycleDeleteRules(metadata) {
  const managedRoot = `${normalizedPrefix()}/`;
  const retentionDays = integerEnv('GCS_SLIP_RETENTION_DAYS', 365, { min: 30, max: 3650 });
  const unlinkedHours = integerEnv('GCS_UNLINKED_UPLOAD_TTL_HOURS', 24, { min: 1, max: 168 });
  const graceDays = integerEnv('GCS_LIFECYCLE_DELETE_GRACE_DAYS', 2, { min: 1, max: 30 });
  const minimumSlipAge = retentionDays + Math.ceil(unlinkedHours / 24) + graceDays;
  return (metadata.lifecycle?.rule || []).filter((rule) => {
    if (String(rule.action?.type || '').toLowerCase() !== 'delete') return false;
    const prefixes = rule.condition?.matchesPrefix || [];
    const touchesManagedRoot = prefixes.length === 0 || prefixes.some((prefix) => {
      const value = String(prefix || '');
      return value.startsWith(managedRoot) || managedRoot.startsWith(value);
    });
    if (!touchesManagedRoot) return false;
    const onlySafeSlipPrefix = prefixes.length > 0
      && prefixes.every((prefix) => prefix === expectedLifecyclePrefix())
      && Number(rule.condition?.age) >= minimumSlipAge;
    return !onlySafeSlipPrefix;
  });
}

function durationSeconds(value) {
  const normalized = String(value ?? '').trim().replace(/s$/i, '');
  const seconds = Number(normalized);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

async function initializeObjectStorage() {
  assertObjectStorageConfiguration();
  state.provider = objectStorageProvider();
  state.initialized = false;
  state.healthy = true;
  state.validatedAt = null;
  state.lastErrorCode = null;
  state.bucketPolicy = null;
  if (state.provider === 'local') {
    await fs.mkdir(localRoot(), { recursive: true });
    state.initialized = true;
    state.validatedAt = new Date().toISOString();
    state.bucketPolicy = null;
    return objectStorageStatus();
  }

  if (!boolEnv('GCS_VALIDATE_BUCKET_ON_STARTUP', process.env.NODE_ENV === 'production')) {
    state.initialized = true;
    return objectStorageStatus();
  }

  try {
    recordCloudUsage('gcsMetadataOps', 1, { optional: false });
    const [metadata] = await storageClient().bucket(gcsBucketName()).getMetadata();
    const uniformAccess = metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled === true;
    const publicAccessPrevention = metadata.iamConfiguration?.publicAccessPrevention === 'enforced';
    const locationMatches = String(metadata.location || '').toLowerCase()
      === String(process.env.GCS_LOCATION || '').toLowerCase();
    const lifecycleConfigured = lifecycleHasSlipDeletion(metadata);
    const conflictingLifecycleRuleCount = conflictingLifecycleDeleteRules(metadata).length;
    const storageClass = String(metadata.storageClass || '').toUpperCase();
    const objectVersioningEnabled = metadata.versioning?.enabled === true;
    const autoclassEnabled = metadata.autoclass?.enabled === true;
    const hierarchicalNamespaceEnabled = metadata.hierarchicalNamespace?.enabled === true;
    const softDeleteRetentionSeconds = durationSeconds(metadata.softDeletePolicy?.retentionDurationSeconds);
    const maxSoftDeleteSeconds = integerEnv('GCS_MAX_SOFT_DELETE_RETENTION_DAYS', 7, { min: 0, max: 90 }) * 86400;
    const bucketRetentionSeconds = durationSeconds(metadata.retentionPolicy?.retentionPeriod);
    const maxBucketRetentionSeconds = integerEnv('GCS_MAX_BUCKET_RETENTION_DAYS', 0, { min: 0, max: 3650 }) * 86400;
    const defaultEventBasedHold = metadata.defaultEventBasedHold === true;
    state.bucketPolicy = {
      uniformAccess,
      publicAccessPrevention,
      locationMatches,
      lifecycleConfigured,
      conflictingLifecycleRuleCount,
      storageClass,
      objectVersioningEnabled,
      autoclassEnabled,
      hierarchicalNamespaceEnabled,
      softDeleteRetentionSeconds,
      bucketRetentionSeconds,
      defaultEventBasedHold,
    };
    if (!uniformAccess || !publicAccessPrevention || !locationMatches) {
      const error = new Error('GCS bucket security/location policy validation failed');
      error.code = 'GCS_BUCKET_POLICY_INVALID';
      throw error;
    }
    if (boolEnv('GCS_REQUIRE_LIFECYCLE', process.env.NODE_ENV === 'production') && !lifecycleConfigured) {
      const error = new Error('GCS payment slip lifecycle rule is required');
      error.code = 'GCS_LIFECYCLE_REQUIRED';
      throw error;
    }
    if (boolEnv('GCS_REJECT_CONFLICTING_LIFECYCLE', process.env.NODE_ENV === 'production')
        && conflictingLifecycleRuleCount > 0) {
      const error = new Error('GCS lifecycle contains a delete rule that can remove managed objects too early');
      error.code = 'GCS_LIFECYCLE_CONFLICT';
      throw error;
    }
    if (boolEnv('GCS_REQUIRE_STANDARD_STORAGE', process.env.NODE_ENV === 'production') && storageClass !== 'STANDARD') {
      const error = new Error('GCS Standard storage class is required by the active cost policy');
      error.code = 'GCS_STORAGE_CLASS_INVALID';
      throw error;
    }
    if (boolEnv('GCS_REQUIRE_VERSIONING_DISABLED', process.env.NODE_ENV === 'production') && objectVersioningEnabled) {
      const error = new Error('GCS object versioning must be disabled by the active cost policy');
      error.code = 'GCS_VERSIONING_MUST_BE_DISABLED';
      throw error;
    }
    if (boolEnv('GCS_REQUIRE_AUTOCLASS_DISABLED', process.env.NODE_ENV === 'production') && autoclassEnabled) {
      const error = new Error('GCS Autoclass must be disabled by the active cost policy');
      error.code = 'GCS_AUTOCLASS_MUST_BE_DISABLED';
      throw error;
    }
    if (boolEnv('GCS_REQUIRE_FLAT_NAMESPACE', process.env.NODE_ENV === 'production') && hierarchicalNamespaceEnabled) {
      const error = new Error('GCS flat namespace is required by the active cost policy');
      error.code = 'GCS_HIERARCHICAL_NAMESPACE_NOT_ALLOWED';
      throw error;
    }
    if (softDeleteRetentionSeconds > maxSoftDeleteSeconds) {
      const error = new Error('GCS soft-delete retention exceeds the active cost policy');
      error.code = 'GCS_SOFT_DELETE_RETENTION_TOO_LONG';
      throw error;
    }
    if (bucketRetentionSeconds > maxBucketRetentionSeconds) {
      const error = new Error('GCS bucket retention exceeds the active cost and deletion policy');
      error.code = 'GCS_BUCKET_RETENTION_TOO_LONG';
      throw error;
    }
    if (boolEnv('GCS_REQUIRE_DEFAULT_EVENT_HOLD_DISABLED', process.env.NODE_ENV === 'production')
        && defaultEventBasedHold) {
      const error = new Error('GCS default event-based hold must be disabled by the active deletion policy');
      error.code = 'GCS_DEFAULT_EVENT_HOLD_NOT_ALLOWED';
      throw error;
    }
    state.initialized = true;
    state.validatedAt = new Date().toISOString();
    return objectStorageStatus();
  } catch (error) {
    state.healthy = false;
    state.lastErrorCode = String(error.code || 'GCS_VALIDATION_FAILED').slice(0, 80);
    throw error;
  }
}

function retentionUntilFor(purpose, now = new Date()) {
  if (purpose !== 'payment_slip') return null;
  const days = integerEnv('GCS_SLIP_RETENTION_DAYS', 365, { min: 30, max: 3650 });
  return new Date(now.getTime() + (days * 86400000));
}

function objectKeyFor(purpose, extension, publicId, now = new Date()) {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${normalizedPrefix()}/${purpose}/${year}/${month}/${publicId}${extension}`;
}

function safeLocalPath(objectKey) {
  if (!/^[a-z0-9/_-]+\.(webp|png)$/i.test(objectKey)) throw new Error('Unsafe local object key');
  const target = path.resolve(localRoot(), objectKey);
  const rootPrefix = `${localRoot()}${path.sep}`;
  if (!target.startsWith(rootPrefix)) throw new Error('Object path escapes local storage root');
  return target;
}

function cacheControlFor(visibility) {
  return visibility === 'public'
    ? 'public, max-age=31536000, immutable'
    : 'private, no-store, max-age=0';
}

async function writeProviderObject({ objectKey, buffer, contentType, visibility, purpose, publicId, sha256 }) {
  if (objectStorageProvider() === 'local') {
    const target = safeLocalPath(objectKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer, { flag: 'wx', mode: 0o600 });
    return;
  }

  recordCloudUsage('gcsUploadOps', 1, { optional: false });
  recordCloudUsage('gcsUploadKiB', Math.ceil(buffer.length / KIB), { optional: false });
  await storageClient().bucket(gcsBucketName()).file(objectKey).save(buffer, {
    resumable: false,
    validation: 'crc32c',
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: {
      contentType,
      cacheControl: cacheControlFor(visibility),
      metadata: { purpose, publicId, sha256 },
    },
  });
}

async function deleteProviderObject(record) {
  if (record.provider === 'local') {
    await fs.unlink(safeLocalPath(record.objectKey)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    return;
  }
  await storageClient().bucket(record.bucket).file(record.objectKey).delete({ ignoreNotFound: true });
}

function publicApiOrigin() {
  return String(process.env.OBJECT_STORAGE_PUBLIC_API_ORIGIN || process.env.PUBLIC_URL || '').replace(/\/+$/, '');
}

function publicObjectUrl(publicId) {
  return `${publicApiOrigin()}/api/uploads/public/files/${encodeURIComponent(publicId)}`;
}

function objectReference(publicId) {
  return `object://${publicId}`;
}

function parseObjectReference(reference) {
  const match = /^object:\/\/([0-9a-f-]{36})$/i.exec(String(reference || '').trim());
  return match ? match[1].toLowerCase() : null;
}

function parsePublicObjectId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let pathname = raw;
  try {
    pathname = new URL(raw, 'http://object-storage.local').pathname;
  } catch {
    return null;
  }
  const match = /^\/api\/uploads\/public\/files\/([0-9a-f-]{36})\/?$/i.exec(pathname);
  return match ? match[1].toLowerCase() : null;
}

function unlinkedUploadExpiry(now = new Date()) {
  const hours = integerEnv('GCS_UNLINKED_UPLOAD_TTL_HOURS', 24, { min: 1, max: 168 });
  return new Date(now.getTime() + (hours * 3600000));
}

async function storeImage({ buffer, declaredMimeType, purpose, eventId = null, uploadedBy = null }) {
  const visibility = purposeVisibility(purpose);
  const optimized = await optimizeImage({ buffer, declaredMimeType, purpose });
  const sha256 = crypto.createHash('sha256').update(optimized.buffer).digest('hex');
  const publicId = crypto.randomUUID();
  const objectKey = objectKeyFor(purpose, optimized.extension, publicId);
  const provider = objectStorageProvider();
  const now = new Date();
  const pending = purpose === 'payment_slip';
  const awaitingLink = pending || purpose === 'event_media' || purpose === 'payment_qr' || purpose === 'avatar';

  const record = await StoredObject.create({
    publicId,
    provider,
    bucket: provider === 'gcs' ? gcsBucketName() : '',
    objectKey,
    purpose,
    visibility,
    eventId,
    uploadedBy,
    linkedEntityType: '',
    linkedEntityId: null,
    contentType: optimized.contentType,
    sourceContentType: optimized.detectedMimeType,
    sourceSizeBytes: optimized.sourceSizeBytes,
    sizeBytes: optimized.sizeBytes,
    sha256,
    status: pending ? 'pending' : 'active',
    linkExpiresAt: awaitingLink ? unlinkedUploadExpiry(now) : null,
    retentionUntil: pending ? null : retentionUntilFor(purpose, now),
    linkedAt: awaitingLink ? null : now,
  });

  try {
    await writeProviderObject({
      objectKey,
      buffer: optimized.buffer,
      contentType: optimized.contentType,
      visibility,
      purpose,
      publicId,
      sha256,
    });
  } catch (error) {
    await deleteProviderObject({ provider, bucket: gcsBucketName(), objectKey }).catch(() => {});
    await StoredObject.updateOne(
      { _id: record._id, linkedAt: null },
      {
        $set: { status: 'deleted', deletedAt: new Date() },
        $unset: { linkExpiresAt: 1, retentionUntil: 1 },
      }
    ).catch(() => {});
    throw error;
  }

  return {
    record,
    reference: objectReference(record.publicId),
    url: visibility === 'public' ? publicObjectUrl(record.publicId) : objectReference(record.publicId),
    optimization: {
      sourceSizeBytes: optimized.sourceSizeBytes,
      sizeBytes: optimized.sizeBytes,
      savedBytes: optimized.savedBytes,
      width: optimized.width,
      height: optimized.height,
    },
  };
}

async function claimAvatarObject(reference, { adminId, session = null } = {}) {
  const publicId = parseObjectReference(reference);
  if (!publicId || !adminId) {
    const error = new Error('ไฟล์รูปโปรไฟล์ไม่ถูกต้อง');
    error.code = 'AVATAR_OBJECT_CLAIM_INVALID';
    error.statusCode = 400;
    throw error;
  }
  const now = new Date();
  const record = await StoredObject.findOneAndUpdate(
    {
      publicId,
      purpose: 'avatar',
      visibility: 'public',
      status: 'active',
      uploadedBy: adminId,
      linkedAt: null,
      linkExpiresAt: { $gt: now },
    },
    {
      $set: {
        linkedEntityType: 'admin',
        linkedEntityId: adminId,
        linkedAt: now,
      },
      $unset: { linkExpiresAt: 1 },
    },
    { new: true, ...(session ? { session } : {}) }
  );
  if (!record) {
    const error = new Error('ไฟล์รูปโปรไฟล์หมดอายุ ถูกใช้งานแล้ว หรือไม่ใช่ของบัญชีนี้');
    error.code = 'AVATAR_OBJECT_CLAIM_FAILED';
    error.statusCode = 400;
    throw error;
  }
  return record;
}

async function claimEventPublicObject(url, {
  eventId,
  purpose,
  field,
  session = null,
} = {}) {
  const publicId = parsePublicObjectId(url);
  if (!publicId) return { managed: false, url };
  if (!['branding.logoUrl', 'branding.coverImageUrl', 'config.paymentQrUrl'].includes(field)) {
    throw new Error('Unsupported event media link field');
  }
  const queryOptions = session ? { session } : {};
  let record = await StoredObject.findOne({
    publicId,
    visibility: 'public',
    status: { $in: ['active', 'quarantined'] },
    purpose,
  }, null, queryOptions);
  if (!record) {
    const error = new Error('ไฟล์รูปภาพที่เลือกไม่ถูกต้องหรือถูกลบแล้ว');
    error.code = 'STORED_PUBLIC_OBJECT_NOT_FOUND';
    error.statusCode = 400;
    throw error;
  }

  if (!record.linkedAt) {
    if (String(record.eventId || '') !== String(eventId || '')
        || !record.linkExpiresAt
        || record.linkExpiresAt <= new Date()) {
      const error = new Error('ไฟล์รูปภาพหมดอายุหรือไม่ได้อัปโหลดสำหรับกิจกรรมนี้');
      error.code = 'STORED_PUBLIC_OBJECT_CLAIM_FAILED';
      error.statusCode = 400;
      throw error;
    }
  }
  record = await StoredObject.findOneAndUpdate(
    { _id: record._id, status: { $in: ['active', 'quarantined'] } },
    {
      $set: {
        status: 'active',
        linkedEntityType: 'event',
        linkedEntityId: eventId,
        linkedAt: record.linkedAt || new Date(),
        retentionUntil: null,
      },
      $addToSet: { eventLinks: { eventId, field } },
      $unset: { linkExpiresAt: 1 },
    },
    { new: true, ...queryOptions }
  );
  if (!record) {
    const error = new Error('ไฟล์รูปภาพถูกใช้งานหรือหมดอายุแล้ว กรุณาอัปโหลดใหม่');
    error.code = 'STORED_PUBLIC_OBJECT_CLAIM_RACE';
    error.statusCode = 409;
    throw error;
  }
  return { managed: true, record, url: publicObjectUrl(publicId) };
}

async function unlinkEventPublicObject(url, { eventId, field, session = null } = {}) {
  const publicId = parsePublicObjectId(url);
  if (!publicId) return { managed: false };
  const queryOptions = session ? { session } : {};
  const result = await StoredObject.updateOne(
    {
      publicId,
      visibility: 'public',
      status: { $in: ['active', 'quarantined'] },
      eventLinks: { $elemMatch: { eventId, field } },
    },
    { $pull: { eventLinks: { eventId, field } } },
    queryOptions
  );
  if (result.modifiedCount !== 1) return { managed: true, unlinked: false };

  const record = await StoredObject.findOneAndUpdate(
    { publicId, status: 'active', eventLinks: { $size: 0 } },
    {
      $set: { status: 'quarantined', retentionUntil: new Date() },
      $unset: { linkedEntityId: 1 },
    },
    { new: true, ...queryOptions }
  );
  return { managed: true, unlinked: true, quarantined: Boolean(record) };
}

async function claimPendingObject(reference, {
  eventId,
  linkedEntityType,
  linkedEntityId,
  session = null,
} = {}) {
  const publicId = parseObjectReference(reference);
  if (!publicId) return { managed: false };
  const now = new Date();
  const record = await StoredObject.findOneAndUpdate(
    {
      publicId,
      purpose: 'payment_slip',
      visibility: 'private',
      status: 'pending',
      eventId,
      linkExpiresAt: { $gt: now },
    },
    {
      $set: {
        status: 'active',
        linkedEntityType,
        linkedEntityId,
        linkedAt: now,
        retentionUntil: retentionUntilFor('payment_slip', now),
      },
      $unset: { linkExpiresAt: 1 },
    },
    { new: true, ...(session ? { session } : {}) }
  );
  if (!record) {
    const error = new Error('ไฟล์สลิปไม่ถูกต้อง หมดอายุ หรือถูกใช้งานแล้ว');
    error.code = 'STORED_OBJECT_CLAIM_FAILED';
    error.statusCode = 400;
    throw error;
  }
  return { managed: true, record };
}

async function storedObjectForDelivery(publicId, { visibility }) {
  if (!/^[0-9a-f-]{36}$/i.test(String(publicId || ''))) return null;
  return StoredObject.findOne({ publicId: String(publicId).toLowerCase(), visibility, status: 'active' })
    .select('+bucket +objectKey')
    .lean();
}

function signedUrlTtlSeconds(visibility) {
  return visibility === 'public'
    ? integerEnv('GCS_PUBLIC_SIGNED_URL_TTL_SECONDS', 3600, { min: 300, max: 604800 })
    : integerEnv('GCS_PRIVATE_SIGNED_URL_TTL_SECONDS', 300, { min: 60, max: 3600 });
}

function localSignature(publicId, expiresAt) {
  const secret = process.env.OBJECT_STORAGE_LOCAL_SIGNING_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('OBJECT_STORAGE_LOCAL_SIGNING_SECRET or JWT_SECRET is required');
  return crypto.createHmac('sha256', secret).update(`${publicId}.${expiresAt}`).digest('hex');
}

function createLocalSignedUrl(record, ttlSeconds) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = localSignature(record.publicId, expiresAt);
  return `${publicApiOrigin()}/api/uploads/local/files/${encodeURIComponent(record.publicId)}?expires=${expiresAt}&signature=${signature}`;
}

function verifyLocalSignature(publicId, expiresAt, signature) {
  const expiry = Number(expiresAt);
  if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(Date.now() / 1000)) return false;
  if (!/^[a-f0-9]{64}$/i.test(String(signature || ''))) return false;
  const expected = Buffer.from(localSignature(publicId, expiry), 'hex');
  const actual = Buffer.from(String(signature), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

async function deliveryUrl(record) {
  const ttlSeconds = signedUrlTtlSeconds(record.visibility);
  if (record.provider === 'local') return createLocalSignedUrl(record, ttlSeconds);
  const cacheKey = `${record.publicId}:${record.visibility}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30000) return cached.url;
  recordCloudUsage('gcsSignedUrlOps', 1, { optional: false });
  const expiresAt = Date.now() + (ttlSeconds * 1000);
  const [url] = await storageClient().bucket(record.bucket).file(record.objectKey).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: expiresAt,
    responseDisposition: 'inline',
    responseType: record.contentType,
  });
  if (signedUrlCache.size >= 5000) signedUrlCache.clear();
  signedUrlCache.set(cacheKey, { url, expiresAt });
  return url;
}

function recordProjectedEgress(record) {
  if (record.provider !== 'gcs') return;
  recordCloudUsage('gcsProjectedEgressKiB', Math.max(1, Math.ceil(record.sizeBytes / KIB)), { optional: false });
}

async function deleteStoredObjectByReference(reference) {
  const publicId = parseObjectReference(reference);
  if (!publicId) return false;
  const record = await StoredObject.findOne({ publicId, status: { $ne: 'deleted' } })
    .select('+bucket +objectKey');
  if (!record) return false;
  await deleteProviderObject(record);
  record.status = 'deleted';
  record.deletedAt = new Date();
  record.cleanupLockedAt = null;
  record.cleanupPreviousStatus = '';
  await record.save();
  signedUrlCache.delete(`${record.publicId}:${record.visibility}`);
  return true;
}

async function deleteStoredObjectByPublicUrl(url) {
  const publicId = parsePublicObjectId(url);
  return publicId ? deleteStoredObjectByReference(objectReference(publicId)) : false;
}

async function quarantineAvatarObject(reference, adminId) {
  const publicId = parseObjectReference(reference);
  if (!publicId || !adminId) return false;
  const result = await StoredObject.updateOne(
    {
      publicId,
      purpose: 'avatar',
      status: 'active',
      linkedEntityType: 'admin',
      linkedEntityId: adminId,
    },
    {
      $set: { status: 'quarantined', retentionUntil: new Date() },
      $unset: { linkedEntityId: 1 },
    }
  );
  signedUrlCache.delete(`${publicId}:public`);
  return result.modifiedCount === 1;
}

function localPathForRecord(record) {
  if (record.provider !== 'local') return null;
  return safeLocalPath(record.objectKey);
}

function objectStorageStatus() {
  return {
    enabled: objectStorageEnabled(),
    provider: state.provider,
    initialized: state.initialized,
    healthy: state.healthy,
    validatedAt: state.validatedAt,
    lastErrorCode: state.lastErrorCode,
    bucketPolicy: state.bucketPolicy,
  };
}

function shutdownObjectStorage() {
  gcsClient = null;
  signedUrlCache.clear();
  state.initialized = false;
}

module.exports = {
  assertObjectStorageConfiguration,
  claimAvatarObject,
  claimEventPublicObject,
  claimPendingObject,
  deleteStoredObjectByReference,
  deleteStoredObjectByPublicUrl,
  deliveryUrl,
  initializeObjectStorage,
  lifecycleHasSlipDeletion,
  conflictingLifecycleDeleteRules,
  localPathForRecord,
  objectReference,
  objectStorageEnabled,
  objectStorageProvider,
  objectStorageStatus,
  parseObjectReference,
  parsePublicObjectId,
  publicObjectUrl,
  quarantineAvatarObject,
  recordProjectedEgress,
  shutdownObjectStorage,
  signedUrlTtlSeconds,
  storedObjectForDelivery,
  storeImage,
  unlinkEventPublicObject,
  verifyLocalSignature,
};

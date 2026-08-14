require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { disconnectDB } = require('../config/db');
const Admin = require('../models/admin');
const Donation = require('../models/Donation');
const Event = require('../models/event');
const { protectDonationPayload, revealDonationObject } = require('../utils/fieldEncryption');
const { detectedImageMime } = require('../utils/imageOptimization');
const { initializeKmsDataKeys, shutdownKmsDataKeys } = require('../utils/kmsDataKeys');
const {
  claimAvatarObject,
  claimEventPublicObject,
  claimPendingObject,
  deleteStoredObjectByReference,
  initializeObjectStorage,
  objectStorageProvider,
  shutdownObjectStorage,
  storeImage,
} = require('../utils/objectStorage');
const { clearSecretCache, hydrateRuntimeSecrets } = require('../utils/secretProvider');
const { explicitMigrationApply } = require('../utils/migrationMode');

const EVENT_MEDIA_FIELDS = [
  { section: 'branding', key: 'logoUrl', field: 'branding.logoUrl', purpose: 'event_media' },
  { section: 'branding', key: 'coverImageUrl', field: 'branding.coverImageUrl', purpose: 'event_media' },
  { section: 'config', key: 'paymentQrUrl', field: 'config.paymentQrUrl', purpose: 'payment_qr' },
];
const GENERAL_UPLOAD_ROOT = path.resolve(__dirname, '../../uploads');
const AVATAR_UPLOAD_ROOT = path.resolve(__dirname, '../uploads/avatars');

function integerOption(name, fallback) {
  const argument = process.argv.find((value) => value.startsWith(`${name}=`));
  const value = Number(argument ? argument.slice(name.length + 1) : fallback);
  if (!Number.isInteger(value) || value < 1 || value > 10000) {
    throw new Error(`${name} must be an integer from 1 to 10000`);
  }
  return value;
}

function pathWithin(root, relativePath) {
  const target = path.resolve(root, relativePath);
  return target.startsWith(`${root}${path.sep}`) ? target : null;
}

function legacyLocalPath(value, { avatar = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (avatar && !raw.includes('/') && !raw.includes('\\')) {
    return pathWithin(AVATAR_UPLOAD_ROOT, raw);
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(raw, 'http://legacy.local').pathname);
  } catch {
    return null;
  }
  if (pathname.startsWith('/uploads/avatars/')) {
    return pathWithin(AVATAR_UPLOAD_ROOT, pathname.slice('/uploads/avatars/'.length));
  }
  if (pathname.startsWith('/uploads/') && !pathname.startsWith('/uploads/objects/')) {
    return pathWithin(GENERAL_UPLOAD_ROOT, pathname.slice('/uploads/'.length));
  }
  return null;
}

async function sourceInfo(sourcePath) {
  try {
    const stat = await fs.stat(sourcePath);
    if (!stat.isFile()) return null;
    return { sizeBytes: stat.size };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function emptyStats(dryRun) {
  return {
    dryRun,
    provider: objectStorageProvider(),
    scanned: { eventMedia: 0, donationSlips: 0, avatars: 0 },
    candidates: { eventMedia: 0, donationSlips: 0, avatars: 0 },
    migrated: { eventMedia: 0, donationSlips: 0, avatars: 0 },
    missingSource: { eventMedia: 0, donationSlips: 0, avatars: 0 },
    failed: { eventMedia: 0, donationSlips: 0, avatars: 0 },
    sourceBytes: 0,
  };
}

async function migrateEventMedia({ event, descriptor, sourceUrl, sourcePath }) {
  const buffer = await fs.readFile(sourcePath);
  const mimeType = detectedImageMime(buffer);
  if (!mimeType) throw new Error('Legacy event media is not a supported image');
  const stored = await storeImage({
    buffer,
    declaredMimeType: mimeType,
    purpose: descriptor.purpose,
    eventId: event._id,
  });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const current = await Event.findById(event._id).session(session);
      if (!current || String(current?.[descriptor.section]?.[descriptor.key] || '') !== sourceUrl) {
        const error = new Error('Event media reference changed during migration');
        error.code = 'MIGRATION_SOURCE_CHANGED';
        throw error;
      }
      const claimed = await claimEventPublicObject(stored.url, {
        eventId: current._id,
        purpose: descriptor.purpose,
        field: descriptor.field,
        session,
      });
      if (descriptor.section === 'branding') {
        current.branding[descriptor.key] = claimed.url;
      } else {
        current.config = { ...(current.config || {}), [descriptor.key]: claimed.url };
        current.markModified('config');
      }
      await current.save({ session });
    });
  } catch (error) {
    await deleteStoredObjectByReference(stored.reference).catch(() => {});
    throw error;
  } finally {
    session.endSession();
  }
}

async function migrateDonationSlip({ donation, sourceUrl, sourcePath }) {
  if (!donation.eventId) throw new Error('Legacy donation has no eventId');
  const buffer = await fs.readFile(sourcePath);
  const mimeType = detectedImageMime(buffer);
  if (!mimeType) throw new Error('Legacy payment slip is not a supported image');
  const stored = await storeImage({
    buffer,
    declaredMimeType: mimeType,
    purpose: 'payment_slip',
    eventId: donation.eventId,
  });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const current = await Donation.findById(donation._id).session(session);
      if (!current || String(revealDonationObject(current).slipUrl || '') !== sourceUrl) {
        const error = new Error('Donation slip reference changed during migration');
        error.code = 'MIGRATION_SOURCE_CHANGED';
        throw error;
      }
      await claimPendingObject(stored.reference, {
        eventId: current.eventId,
        linkedEntityType: 'donation',
        linkedEntityId: current._id,
        session,
      });
      current.set(protectDonationPayload({ slipUrl: stored.reference }));
      await current.save({ session });
    });
  } catch (error) {
    await deleteStoredObjectByReference(stored.reference).catch(() => {});
    throw error;
  } finally {
    session.endSession();
  }
}

async function migrateAvatar({ admin, sourceUrl, sourcePath }) {
  const buffer = await fs.readFile(sourcePath);
  const mimeType = detectedImageMime(buffer);
  if (!mimeType) throw new Error('Legacy avatar is not a supported image');
  const stored = await storeImage({
    buffer,
    declaredMimeType: mimeType,
    purpose: 'avatar',
    uploadedBy: admin._id,
  });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const current = await Admin.findOne({
        _id: admin._id,
        avatarUrl: sourceUrl,
        $or: [{ avatarObjectRef: '' }, { avatarObjectRef: null }, { avatarObjectRef: { $exists: false } }],
      }).select('+avatarObjectRef').session(session);
      if (!current) {
        const error = new Error('Avatar reference changed during migration');
        error.code = 'MIGRATION_SOURCE_CHANGED';
        throw error;
      }
      await claimAvatarObject(stored.reference, { adminId: current._id, session });
      current.avatarUrl = stored.url;
      current.avatarObjectRef = stored.reference;
      await current.save({ session });
    });
  } catch (error) {
    await deleteStoredObjectByReference(stored.reference).catch(() => {});
    throw error;
  } finally {
    session.endSession();
  }
}

async function inspectCandidate(stats, type, sourcePath, migrate) {
  stats.scanned[type] += 1;
  const info = await sourceInfo(sourcePath);
  if (!info) {
    stats.missingSource[type] += 1;
    return;
  }
  stats.candidates[type] += 1;
  stats.sourceBytes += info.sizeBytes;
  if (stats.dryRun) return;
  try {
    await migrate();
    stats.migrated[type] += 1;
  } catch (error) {
    stats.failed[type] += 1;
    console.error('[ObjectStorageMigration] Item failed:', {
      type,
      code: String(error.code || 'OBJECT_MIGRATION_FAILED').slice(0, 80),
    });
  }
}

async function migrateLegacyObjects({ dryRun, limit }) {
  const stats = emptyStats(dryRun);
  let inspected = 0;
  const events = await Event.find({}).select('branding config').limit(limit).lean();
  for (const event of events) {
    for (const descriptor of EVENT_MEDIA_FIELDS) {
      if (inspected >= limit) return stats;
      const sourceUrl = String(event?.[descriptor.section]?.[descriptor.key] || '').trim();
      const sourcePath = legacyLocalPath(sourceUrl);
      if (!sourcePath) continue;
      inspected += 1;
      await inspectCandidate(stats, 'eventMedia', sourcePath, () => migrateEventMedia({
        event,
        descriptor,
        sourceUrl,
        sourcePath,
      }));
    }
  }

  const donationCursor = Donation.find({ isDeleted: { $ne: true } }).cursor();
  for await (const donation of donationCursor) {
    if (inspected >= limit) return stats;
    const sourceUrl = String(revealDonationObject(donation).slipUrl || '').trim();
    const sourcePath = legacyLocalPath(sourceUrl);
    if (!sourcePath) continue;
    inspected += 1;
    await inspectCandidate(stats, 'donationSlips', sourcePath, () => migrateDonationSlip({
      donation,
      sourceUrl,
      sourcePath,
    }));
  }

  const adminCursor = Admin.find({}).select('+avatarObjectRef').cursor();
  for await (const admin of adminCursor) {
    if (inspected >= limit) return stats;
    if (admin.avatarObjectRef) continue;
    const sourceUrl = String(admin.avatarUrl || '').trim();
    const sourcePath = legacyLocalPath(sourceUrl, { avatar: true });
    if (!sourcePath) continue;
    inspected += 1;
    await inspectCandidate(stats, 'avatars', sourcePath, () => migrateAvatar({
      admin,
      sourceUrl,
      sourcePath,
    }));
  }
  return stats;
}

async function main() {
  const apply = explicitMigrationApply({
    writeFlag: 'OBJECT_STORAGE_MIGRATION_WRITE',
    mongoSafetyGate: true,
  });
  const dryRun = !apply;
  if (!dryRun && objectStorageProvider() !== 'gcs') {
    throw new Error('Applying legacy object migration requires OBJECT_STORAGE_PROVIDER=gcs');
  }
  try {
    await hydrateRuntimeSecrets();
    await connectDB({ autoIndex: false });
    await initializeKmsDataKeys();
    if (!dryRun) await initializeObjectStorage();
    const result = await migrateLegacyObjects({
      dryRun,
      limit: integerOption('--limit', 1000),
    });
    console.log(JSON.stringify(result, null, 2));
    if (!dryRun && Object.values(result.failed).some((count) => count > 0)) process.exitCode = 2;
  } finally {
    shutdownObjectStorage();
    shutdownKmsDataKeys();
    await disconnectDB().catch(() => {});
    clearSecretCache();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Legacy object migration failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  legacyLocalPath,
  migrateLegacyObjects,
};

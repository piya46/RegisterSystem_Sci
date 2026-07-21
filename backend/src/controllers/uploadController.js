const Event = require('../models/event');
const StoredObject = require('../models/storedObject');
const auditLog = require('../helpers/auditLog');
const { getEventContextFromRequest } = require('../utils/eventYear');
const { canAccessEvent } = require('../utils/permissions');
const {
  deliveryUrl,
  localPathForRecord,
  objectStorageStatus,
  parseObjectReference,
  recordProjectedEgress,
  signedUrlTtlSeconds,
  storedObjectForDelivery,
  storeImage,
  verifyLocalSignature,
} = require('../utils/objectStorage');
const { guardrailStatus } = require('../utils/cloudCostGuardrail');
const { estimateGcsMonthlyCost } = require('../utils/gcsCostEstimator');

function respondError(res, error, fallbackMessage) {
  const status = Number(error.statusCode) || 500;
  if (status >= 500) {
    console.error('[ObjectStorage] Request failed:', {
      code: String(error.code || 'OBJECT_STORAGE_REQUEST_FAILED').slice(0, 80),
    });
  }
  return res.status(status).json({
    success: false,
    message: status < 500 ? error.message : fallbackMessage,
  });
}

function sendLocalFile(res, record, { publicCache = false } = {}) {
  const localPath = localPathForRecord(record);
  if (!localPath) return res.status(404).end();
  res.setHeader('Content-Type', record.contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', publicCache
    ? 'public, max-age=31536000, immutable'
    : 'private, no-store, max-age=0');
  return res.sendFile(localPath, (error) => {
    if (error && !res.headersSent) res.status(error.statusCode || 404).end();
  });
}

exports.uploadEventMedia = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'ไม่พบไฟล์รูปภาพ' });
    const purpose = req.body.purpose === 'payment_qr' ? 'payment_qr' : 'event_media';
    const context = await getEventContextFromRequest(req, {
      requireAccess: true,
      requireEventIdentity: true,
    });
    const stored = await storeImage({
      buffer: req.file.buffer,
      declaredMimeType: req.file.mimetype,
      purpose,
      eventId: context.eventId,
      uploadedBy: req.user?._id || null,
    });
    await auditLog({
      req,
      action: 'UPLOAD_EVENT_MEDIA',
      detail: JSON.stringify({
        storedObjectId: stored.record.publicId,
        eventId: String(context.eventId),
        purpose,
        sourceSizeBytes: stored.optimization.sourceSizeBytes,
        sizeBytes: stored.optimization.sizeBytes,
      }),
      strict: false,
    });
    return res.status(201).json({
      success: true,
      url: stored.url,
      reference: stored.reference,
      optimization: stored.optimization,
    });
  } catch (error) {
    return respondError(res, error, 'อัปโหลดรูปภาพไม่สำเร็จ');
  }
};

exports.uploadPublicSlip = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'ไม่พบไฟล์สลิป' });
    const context = await getEventContextFromRequest(req, {
      requireAccess: false,
      requireEventIdentity: true,
      requirePublic: true,
    });
    if (context.event?.config?.enabledFeatures?.donations === false) {
      return res.status(403).json({ success: false, message: 'กิจกรรมนี้ไม่ได้เปิดรับข้อมูลการสนับสนุน' });
    }
    const stored = await storeImage({
      buffer: req.file.buffer,
      declaredMimeType: req.file.mimetype,
      purpose: 'payment_slip',
      eventId: context.eventId,
    });
    await auditLog({
      req,
      action: 'UPLOAD_PAYMENT_SLIP_PENDING',
      detail: JSON.stringify({
        storedObjectId: stored.record.publicId,
        eventId: String(context.eventId),
        sourceSizeBytes: stored.optimization.sourceSizeBytes,
        sizeBytes: stored.optimization.sizeBytes,
      }),
      strict: false,
    });
    return res.status(201).json({
      success: true,
      url: stored.reference,
      reference: stored.reference,
      optimization: stored.optimization,
    });
  } catch (error) {
    return respondError(res, error, 'อัปโหลดสลิปไม่สำเร็จ');
  }
};

exports.uploadAdminSlip = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'ไม่พบไฟล์สลิป' });
    const context = await getEventContextFromRequest(req, {
      requireAccess: true,
      requireEventIdentity: true,
    });
    if (context.event?.config?.enabledFeatures?.donations === false) {
      return res.status(403).json({ success: false, message: 'กิจกรรมนี้ไม่ได้เปิดฟีเจอร์ผู้สนับสนุน' });
    }
    const stored = await storeImage({
      buffer: req.file.buffer,
      declaredMimeType: req.file.mimetype,
      purpose: 'payment_slip',
      eventId: context.eventId,
      uploadedBy: req.user?._id || null,
    });
    await auditLog({
      req,
      action: 'UPLOAD_PAYMENT_SLIP_ADMIN_PENDING',
      detail: JSON.stringify({
        storedObjectId: stored.record.publicId,
        eventId: String(context.eventId),
        sourceSizeBytes: stored.optimization.sourceSizeBytes,
        sizeBytes: stored.optimization.sizeBytes,
      }),
      strict: false,
    });
    return res.status(201).json({
      success: true,
      url: stored.reference,
      reference: stored.reference,
      optimization: stored.optimization,
    });
  } catch (error) {
    return respondError(res, error, 'อัปโหลดสลิปไม่สำเร็จ');
  }
};

exports.publicFile = async (req, res) => {
  try {
    const record = await storedObjectForDelivery(req.params.publicId, { visibility: 'public' });
    if (!record) return res.status(404).end();
    recordProjectedEgress(record);
    if (record.provider === 'local') return sendLocalFile(res, record, { publicCache: true });
    const url = await deliveryUrl(record);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.redirect(302, url);
  } catch (error) {
    return respondError(res, error, 'ไม่สามารถเปิดไฟล์ได้');
  }
};

exports.privateAccess = async (req, res) => {
  try {
    const publicId = parseObjectReference(req.body?.reference);
    if (!publicId) return res.status(400).json({ success: false, message: 'รูปแบบ reference ไม่ถูกต้อง' });
    const record = await storedObjectForDelivery(publicId, { visibility: 'private' });
    if (!record) return res.status(404).json({ success: false, message: 'ไม่พบไฟล์' });
    const event = record.eventId
      ? await Event.findById(record.eventId).select('organizationId seriesId eventYear status')
      : null;
    if (!event || !canAccessEvent(req.user, event)) {
      return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์เปิดไฟล์นี้' });
    }
    recordProjectedEgress(record);
    const url = await deliveryUrl(record);
    await auditLog({
      req,
      action: 'ACCESS_PRIVATE_STORED_OBJECT',
      detail: JSON.stringify({ storedObjectId: record.publicId, eventId: String(record.eventId), purpose: record.purpose }),
      strict: false,
    });
    return res.json({ success: true, url, expiresInSeconds: signedUrlTtlSeconds(record.visibility) });
  } catch (error) {
    return respondError(res, error, 'ไม่สามารถเปิดไฟล์ได้');
  }
};

exports.localSignedFile = async (req, res) => {
  try {
    if (!verifyLocalSignature(req.params.publicId, req.query.expires, req.query.signature)) {
      return res.status(403).end();
    }
    const record = await storedObjectForDelivery(req.params.publicId, { visibility: 'private' });
    if (!record || record.provider !== 'local') return res.status(404).end();
    return sendLocalFile(res, record);
  } catch {
    return res.status(404).end();
  }
};

exports.storageStatus = async (req, res) => {
  try {
    const aggregates = await StoredObject.aggregate([
      { $match: { status: { $in: ['pending', 'active'] } } },
      {
        $group: {
          _id: { provider: '$provider', status: '$status', purpose: '$purpose' },
          objectCount: { $sum: 1 },
          sourceBytes: { $sum: '$sourceSizeBytes' },
          storedBytes: { $sum: '$sizeBytes' },
        },
      },
    ]);
    return res.json({
      success: true,
      data: {
        storage: objectStorageStatus(),
        objects: aggregates.map((entry) => ({
          provider: entry._id.provider,
          status: entry._id.status,
          purpose: entry._id.purpose,
          objectCount: entry.objectCount,
          sourceBytes: entry.sourceBytes,
          storedBytes: entry.storedBytes,
          optimizedBytesSaved: Math.max(0, entry.sourceBytes - entry.storedBytes),
        })),
        estimate: estimateGcsMonthlyCost({
          storedGiB: aggregates
            .filter((entry) => entry._id.provider === 'gcs')
            .reduce((sum, entry) => sum + Number(entry.storedBytes || 0), 0) / (1024 ** 3),
          uploadOperations: Number(process.env.GCS_EXPECTED_MONTHLY_UPLOADS || 0),
          downloadOperations: Number(process.env.GCS_EXPECTED_MONTHLY_DOWNLOADS || 0),
          internetEgressGiB: Number(process.env.GCS_EXPECTED_MONTHLY_EGRESS_GIB || 0),
        }),
        costGuardrail: guardrailStatus(),
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return respondError(res, error, 'ไม่สามารถตรวจสอบสถานะ Object Storage ได้');
  }
};

const mongoose = require('mongoose');

const eventLinkSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  field: {
    type: String,
    enum: ['branding.logoUrl', 'branding.coverImageUrl', 'config.paymentQrUrl'],
    required: true,
  },
}, { _id: false });

const storedObjectSchema = new mongoose.Schema({
  publicId: { type: String, required: true, unique: true, immutable: true },
  provider: { type: String, enum: ['local', 'gcs'], required: true, immutable: true },
  bucket: { type: String, default: '', select: false, immutable: true },
  objectKey: { type: String, required: true, select: false, immutable: true },
  purpose: {
    type: String,
    enum: ['event_media', 'payment_qr', 'payment_slip', 'avatar'],
    required: true,
    immutable: true,
  },
  visibility: { type: String, enum: ['public', 'private'], required: true, immutable: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null, index: true, immutable: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null, immutable: true },
  linkedEntityType: { type: String, enum: ['', 'donation', 'admin', 'event'], default: '' },
  linkedEntityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  eventLinks: { type: [eventLinkSchema], default: () => [] },
  contentType: { type: String, required: true, immutable: true },
  sourceContentType: { type: String, required: true, immutable: true },
  sourceSizeBytes: { type: Number, required: true, min: 1, immutable: true },
  sizeBytes: { type: Number, required: true, min: 1, immutable: true },
  sha256: { type: String, required: true, immutable: true, select: false },
  status: {
    type: String,
    enum: ['pending', 'active', 'quarantined', 'deleting', 'deleted'],
    required: true,
    default: 'active',
    index: true,
  },
  linkExpiresAt: { type: Date, default: null, index: true },
  retentionUntil: { type: Date, default: null },
  linkedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
  cleanupLockedAt: { type: Date, default: null },
  cleanupPreviousStatus: { type: String, enum: ['', 'pending', 'active', 'quarantined'], default: '' },
}, { timestamps: true, versionKey: false });

storedObjectSchema.index({ purpose: 1, status: 1, createdAt: -1 });
storedObjectSchema.index({ eventId: 1, purpose: 1, status: 1, createdAt: -1 });
storedObjectSchema.index({ 'eventLinks.eventId': 1, status: 1 });
storedObjectSchema.index({ status: 1, linkExpiresAt: 1 });

module.exports = mongoose.model('StoredObject', storedObjectSchema);

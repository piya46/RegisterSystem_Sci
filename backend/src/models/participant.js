const mongoose = require('mongoose');
const sqlMirrorOutboxPlugin = require('../utils/sqlMirrorOutboxPlugin');
const { generateCertificateVerificationId } = require('../utils/certificateVerification');

const participantSchema = new mongoose.Schema({
  qrCode: { type: String, unique: true, required: true },


  fields: { type: Object, default: {} },
  secureIndex: { type: Object, default: {}, select: false },
  secureSearch: { type: [String], default: [], select: false },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventSeries', default: null, index: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null, index: true },
  eventYear: { type: String, default: '', index: true },
  tags: [{ type: String, trim: true }],

  status: {
    type: String,
    enum: ['registered', 'checkedIn', 'cancelled'],
    default: 'registered',
    index: true
  },

  checkedInAt: { type: Date, default: null, index: true },
  registeredAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
  certificateVerificationId: {
    type: String,
    default: generateCertificateVerificationId,
    select: false,
  },
  certificateVerificationIssuedAt: { type: Date, default: Date.now, select: false },
  registrationIdempotencyKeyHash: { type: String, default: null, select: false, immutable: true },
  registrationIdempotencyFingerprint: { type: String, default: null, select: false, immutable: true },

  registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null, index: true },
  registeredPoint: { type: String, default: 'Online', index: true },
  registeredPointId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegistrationPoint', default: null, index: true },
  registeredPointName: { type: String, default: '', index: true },

  isDeleted: { type: Boolean, default: false, index: true },

  // ประเภทการลงทะเบียน
  registrationType: {
    type: String,
    enum: ['online', 'onsite', 'onsite_staff', 'onsite_kiosk', 'self_register'],
    default: 'online', 
    index: true
  },


  followers: { type: Number, default: 0, min: 0 },

  


  consent: { 
    type: String, 
    enum: ['agreed', 'disagreed', null], 
    default: null 
  },


  specialAssistance: { type: mongoose.Schema.Types.Mixed, default: "" },
  isForfeited: { type: Boolean, default: false, index: true },
  isRevoked: { type: Boolean, default: false, index: true },
  prizeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prize', default: null, index: true },
  prizeWonAt: { type: Date, default: null, index: true },

  authProvider: { type: String, default: 'email', enum: ['email', 'line'] },
  authProviders: [{ type: String, enum: ['email', 'line', 'google'] }],
  primaryAuthProvider: { type: String, default: 'email', enum: ['email', 'line', 'google'] },
  lineUserId: { type: String, default: undefined, index: { unique: true, sparse: true } },
  lineDisplayName: { type: String, default: '' },
  linePictureUrl: { type: String, default: '' },
  lineLinkedAt: { type: Date, default: null },
  lineUnlinkedAt: { type: Date, default: null },
  isLineLinked: { type: Boolean, default: false, index: true },
  lastLoginAt: { type: Date, default: null, index: true },
  participantTokenVersion: { type: Number, default: 0 },
  lastLogoutAt: { type: Date, default: null },
  trustedDevices: { type: [mongoose.Schema.Types.Mixed], default: [] },
  notificationPreferences: {
    linePush: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    coupon: { type: Boolean, default: true },
    checkin: { type: Boolean, default: true },
    certificate: { type: Boolean, default: true },
  }

}, { timestamps: true, versionKey: false });

// Index ที่ช่วยการค้นหา/แดชบอร์ด
participantSchema.index({ status: 1, registeredPoint: 1, createdAt: -1 });
participantSchema.index({ eventId: 1, status: 1, registeredPoint: 1, createdAt: -1 }, { sparse: true });
participantSchema.index({ eventYear: 1, status: 1, registeredPoint: 1, createdAt: -1 });
participantSchema.index({ eventId: 1, status: 1, registeredPointId: 1, createdAt: -1 }, { sparse: true });
participantSchema.index({ eventYear: 1, status: 1, registeredPointName: 1, createdAt: -1 });
participantSchema.index({ registeredAt: -1 });
participantSchema.index({ 'fields.phone': 1 }, { sparse: true });
participantSchema.index({ 'fields.name': 1 }, { sparse: true });
participantSchema.index({ 'fields.dept': 1 }, { sparse: true });
participantSchema.index({ 'fields.date_year': 1 }, { sparse: true });
participantSchema.index({ 'secureIndex.phone': 1 }, { sparse: true });
participantSchema.index({ 'secureIndex.email': 1 }, { sparse: true });
participantSchema.index({ 'secureIndex.name': 1 }, { sparse: true });
participantSchema.index({ secureSearch: 1 }, { sparse: true });
participantSchema.index({ eventYear: 1, prizeWonAt: 1, isForfeited: 1 });
participantSchema.index({ eventId: 1, prizeWonAt: 1, isForfeited: 1 }, { sparse: true });
participantSchema.index({ eventId: 1, registrationType: 1, createdAt: -1 }, { sparse: true });
participantSchema.index({ eventYear: 1, registrationType: 1, createdAt: -1 });
participantSchema.index({ eventId: 1, lineUserId: 1 }, { sparse: true });
participantSchema.index(
  { certificateVerificationId: 1 },
  { unique: true, sparse: true, name: 'uq_participant_certificate_verification_id' }
);
participantSchema.index(
  { eventId: 1, registrationIdempotencyKeyHash: 1 },
  {
    unique: true,
    partialFilterExpression: { registrationIdempotencyKeyHash: { $type: 'string' } },
    name: 'uq_participant_registration_idempotency_per_event',
  }
);
participantSchema.plugin(sqlMirrorOutboxPlugin, { domain: 'participants' });

module.exports = mongoose.model('Participant', participantSchema);

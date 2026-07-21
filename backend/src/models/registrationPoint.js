// src/models/registrationPoint.js
const mongoose = require('mongoose');

const registrationPointSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, // eg. "หน้างานประชุม", "ประตูหลัก", ...
  description: { type: String, default: '', trim: true },
  type: { type: String, enum: ['onsite', 'meeting', 'kiosk', 'self_register', 'checkin', 'other'], default: 'onsite' },
  enabled: { type: Boolean, default: true, index: true },

  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventSeries', default: null, index: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null, index: true },
  eventYear: { type: String, default: '', index: true },

  allowedStaff: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }],
  deviceIds: [{ type: String, trim: true }],
  kioskPolicy: {
    allowStaffMode: { type: Boolean, default: true },
    allowKioskMode: { type: Boolean, default: false },
    requireCamera: { type: Boolean, default: true },
    requireFullscreen: { type: Boolean, default: false },
    idleTimeoutSeconds: { type: Number, default: 120, min: 15, max: 3600 },
    successResetSeconds: { type: Number, default: 8, min: 1, max: 120 },
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

registrationPointSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

registrationPointSchema.index(
  { eventId: 1, name: 1 },
  { unique: true, partialFilterExpression: { eventId: { $type: 'objectId' }, enabled: true } }
);
registrationPointSchema.index({ eventYear: 1, enabled: 1, type: 1 });
registrationPointSchema.index({ allowedStaff: 1, enabled: 1 });

module.exports = mongoose.model('RegistrationPoint', registrationPointSchema);

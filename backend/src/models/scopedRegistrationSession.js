const mongoose = require('mongoose');

const scopedRegistrationSessionSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true, index: true },
  scope: {
    type: String,
    enum: ['self_register_session'],
    required: true,
    index: true,
  },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  eventYear: { type: String, default: '', index: true },
  pointId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegistrationPoint', required: true, index: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
  usedAt: { type: Date, default: null, index: true },
  participantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Participant', default: null },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, versionKey: false });

scopedRegistrationSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ScopedRegistrationSession', scopedRegistrationSessionSchema);

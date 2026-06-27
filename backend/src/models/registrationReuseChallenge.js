const mongoose = require('mongoose');

const registrationReuseChallengeSchema = new mongoose.Schema({
  targetEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  sourceEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null, index: true },
  participantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Participant', required: true, index: true },
  emailHash: { type: String, required: true, index: true },
  otpHash: { type: String, required: true },
  ref: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: true },
  usedAt: { type: Date, default: null },
}, { timestamps: true });

registrationReuseChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RegistrationReuseChallenge', registrationReuseChallengeSchema);

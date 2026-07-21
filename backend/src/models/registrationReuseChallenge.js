const mongoose = require('mongoose');

const registrationReuseChallengeSchema = new mongoose.Schema({
  email: { type: String, default: '', index: true, select: false },
  emailHash: { type: String, default: '', index: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null, index: true },
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventSeries', default: null, index: true },
  targetEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null, index: true },
  sourceEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null, index: true },
  participantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Participant', default: null, index: true },
  otpHash: { type: String, required: true },
  ref: { type: String, default: '' },
  attempts: { type: Number, default: 0 },
  usedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true }
}, { timestamps: true, versionKey: false });

// TTL index to automatically delete expired challenges
registrationReuseChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RegistrationReuseChallenge', registrationReuseChallengeSchema);

const mongoose = require('mongoose');

const participantAuthChallengeSchema = new mongoose.Schema({
  participantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Participant', default: null, index: true },
  participantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Participant' }],
  emailHash: { type: String, required: true, index: true },
  otpHash: { type: String, required: true },
  ref: { type: String, required: true },
  purpose: { type: String, default: 'login', enum: ['login', 'step_up'], index: true },
  action: { type: String, default: '' },
  attempts: { type: Number, default: 0 },
  usedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, versionKey: false });

participantAuthChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ParticipantAuthChallenge', participantAuthChallengeSchema);

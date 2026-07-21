const mongoose = require('mongoose');

const participantSessionSchema = new mongoose.Schema({
  participantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Participant', required: true, index: true },
  tokenHash: { type: String, required: true, index: true, select: false },
  previousTokenHash: { type: String, index: true, select: false },
  previousTokenExpiresAt: { type: Date, default: null },
  previousTokenHashes: [{
    tokenHash: { type: String, index: true, select: false },
    expiresAt: { type: Date }
  }],
  provider: { type: String, default: 'email', enum: ['email', 'line', 'liff'] },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null, index: true },
  eventYear: { type: String, default: '', index: true },
  userAgent: { type: String, default: '' },
  ip: { type: String, default: '' },
  deviceLabel: { type: String, default: '' },
  lastActivityAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  absoluteExpiresAt: { type: Date, default: null },
  revoked: { type: Boolean, default: false, index: true },
  revokedAt: { type: Date, default: null },
  revokedReason: { type: String, default: '' },
}, { timestamps: true, versionKey: false });

participantSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
participantSessionSchema.index({ participantId: 1, revoked: 1, expiresAt: -1 });

participantSessionSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.tokenHash;
    delete ret.previousTokenHash;
    delete ret.previousTokenHashes;
    return ret;
  }
});

participantSessionSchema.set('toObject', {
  transform: (doc, ret) => {
    delete ret.tokenHash;
    delete ret.previousTokenHash;
    delete ret.previousTokenHashes;
    return ret;
  }
});

module.exports = mongoose.model('ParticipantSession', participantSessionSchema);

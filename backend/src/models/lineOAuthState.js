const mongoose = require('mongoose');

const lineOAuthStateSchema = new mongoose.Schema({
  stateHash: { type: String, required: true, unique: true },
  nonce: { type: String, required: true },
  action: { type: String, default: 'login', enum: ['login', 'link'] },
  participantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Participant', default: null, index: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null, index: true },
  eventYear: { type: String, default: '' },
  redirectUri: { type: String, required: true },
  usedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, versionKey: false });

lineOAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('LineOAuthState', lineOAuthStateSchema);

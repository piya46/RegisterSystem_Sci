const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  token: { type: String, select: false },
  tokenHash: { type: String, index: true, select: false },
  userAgent: String,
  ip: String,
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
  revoked: { type: Boolean, default: false },
});

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.token;
    delete ret.tokenHash;
    return ret;
  }
});
sessionSchema.set('toObject', {
  transform: (doc, ret) => {
    delete ret.token;
    delete ret.tokenHash;
    return ret;
  }
});

module.exports = mongoose.model('Session', sessionSchema);

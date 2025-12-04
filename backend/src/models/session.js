const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  token: { type: String, required: true },
  userAgent: String,
  ip: String,
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
  revoked: { type: Boolean, default: false },
});

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model('Session', sessionSchema);
const mongoose = require('mongoose');

const sqlMirrorOutboxSchema = new mongoose.Schema({
  domain: { type: String, required: true, trim: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, default: null },
  operation: { type: String, enum: ['upsert'], default: 'upsert', required: true },
  dedupeKey: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'dead'],
    default: 'pending',
    required: true,
  },
  attemptCount: { type: Number, default: 0, min: 0 },
  maxAttempts: { type: Number, required: true, min: 1 },
  availableAt: { type: Date, default: Date.now, required: true },
  firstRequestedAt: { type: Date, default: Date.now, required: true },
  requestedAt: { type: Date, default: Date.now, required: true },
  lockToken: { type: String, default: null },
  lockOwner: { type: String, default: null },
  lockedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  deadLetteredAt: { type: Date, default: null },
  purgeAt: { type: Date, default: null },
  lastErrorCode: { type: String, default: null },
  lastErrorAt: { type: Date, default: null },
  resultSourceHash: { type: String, default: null },
}, { timestamps: true, versionKey: false });

sqlMirrorOutboxSchema.index({ status: 1, availableAt: 1, requestedAt: 1 });
sqlMirrorOutboxSchema.index(
  { lockedAt: 1 },
  { partialFilterExpression: { status: 'processing' } }
);
sqlMirrorOutboxSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);
sqlMirrorOutboxSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SqlMirrorOutbox', sqlMirrorOutboxSchema);

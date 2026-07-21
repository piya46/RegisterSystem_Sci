const mongoose = require('mongoose');
const sqlMirrorOutboxPlugin = require('../utils/sqlMirrorOutboxPlugin');

const receiptSchema = new mongoose.Schema({
  receiptNumber: { type: String, required: true, unique: true },
  participantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Participant', required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  amount: { type: Number, required: true, min: 0 },
  issuedAt: { type: Date, default: Date.now },
  details: { type: Object }
});

receiptSchema.index({ participantId: 1, eventId: 1 }, { unique: true });
receiptSchema.plugin(sqlMirrorOutboxPlugin, { domain: 'receipts' });

module.exports = mongoose.model('Receipt', receiptSchema);

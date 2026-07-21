const mongoose = require('mongoose');
const sqlMirrorOutboxPlugin = require('../utils/sqlMirrorOutboxPlugin');

const walletSchema = new mongoose.Schema({
  participantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Participant',
    required: true,
    index: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    default: null,
    index: true
  },
  eventYear: {
    type: String,
    default: '',
    index: true
  },
  coinBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  coupons: [{
    couponId: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, default: 1, min: 0 }
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true, versionKey: false });

// Ensure one wallet per participant per event
walletSchema.index({ participantId: 1, eventId: 1, eventYear: 1 }, { unique: true });
walletSchema.plugin(sqlMirrorOutboxPlugin, { domain: 'wallets' });

module.exports = mongoose.model('Wallet', walletSchema);

const mongoose = require('mongoose');

const guestTokenSchema = new mongoose.Schema({
  parentWalletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
    index: true
  },
  tokenHash: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  limitAmount: {
    type: Number,
    default: null,
    min: 0
  },
  spentAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: '1s' } // TTL index
  },
  isActive: {
    type: Boolean,
    default: true
  },
  revokedAt: {
    type: Date,
    default: null
  },
  lastUsedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('GuestToken', guestTokenSchema);

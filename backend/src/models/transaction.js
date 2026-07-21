const mongoose = require('mongoose');
const sqlMirrorOutboxPlugin = require('../utils/sqlMirrorOutboxPlugin');

const transactionSchema = new mongoose.Schema({
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
    index: true
  },
  guestTokenId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GuestToken',
    default: null,
    index: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['payment', 'refund', 'reversal', 'adjustment', 'grant', 'topup'],
    default: 'payment',
    index: true
  },
  idempotencyKey: {
    type: String,
    default: null,
    trim: true
  },
  paymentMethod: {
    type: String,
    enum: ['coins', 'coupon'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 1
  },
  couponId: {
    type: String,
    default: null
  },
  menuItemId: {
    type: String,
    default: null
  },
  menuItemName: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    default: 'success',
    index: true
  },
  balanceBefore: {
    type: Number,
    default: null
  },
  balanceAfter: {
    type: Number,
    default: null
  },
  itemBalanceBefore: {
    type: Number,
    default: null
  },
  itemBalanceAfter: {
    type: Number,
    default: null
  },
  serverTime: {
    type: Date,
    default: Date.now,
    index: true
  },
  slipNonce: {
    type: String,
    default: '',
    select: true
  },
  verificationCode: {
    type: String,
    default: '',
    select: true
  },
  slipExpiresAt: {
    type: Date,
    default: null,
    index: true
  },
  dailyThemeCode: {
    type: String,
    default: ''
  },
  reversalOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    default: null,
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
}, { timestamps: true, versionKey: false });

transactionSchema.index(
  { walletId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);
transactionSchema.index({ eventId: 1, vendorId: 1, serverTime: -1 });
transactionSchema.plugin(sqlMirrorOutboxPlugin, { domain: 'transactions' });

module.exports = mongoose.model('Transaction', transactionSchema);

const mongoose = require('mongoose');
const sqlMirrorOutboxPlugin = require('../utils/sqlMirrorOutboxPlugin');

const vendorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  qrCodeId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  pricingMode: {
    type: String,
    enum: ['variable', 'fixed', 'menu'],
    default: 'variable',
    index: true
  },
  fixedPrice: {
    type: Number,
    default: null,
    min: 0
  },
  minAmount: {
    type: Number,
    default: 1,
    min: 0
  },
  maxAmount: {
    type: Number,
    default: null,
    min: 0
  },
  menuItems: [{
    itemId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true }
  }],
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
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, { timestamps: true, versionKey: false });

vendorSchema.plugin(sqlMirrorOutboxPlugin, { domain: 'vendors' });

module.exports = mongoose.model('Vendor', vendorSchema);

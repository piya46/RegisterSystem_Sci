const mongoose = require('mongoose');
const sqlMirrorOutboxPlugin = require('../utils/sqlMirrorOutboxPlugin');

const donationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false 
  },
  firstName: { type: mongoose.Schema.Types.Mixed, required: true },
  lastName: { type: mongoose.Schema.Types.Mixed, required: true },
  amount: { type: Number, required: true, min: 1 }, 
  transferDateTime: { type: Date, required: true }, 
  
  source: { 
    type: String, 
    enum: ['PRE_REGISTER', 'SUPPORT_SYSTEM'], 
    default: 'PRE_REGISTER' 
  },

  isPackage: { type: Boolean, default: false },
  packageType: { type: String, default: "" }, 
  size: { type: String, default: "" },       

  // [เพิ่มใหม่] สำหรับการจัดการสลิปและสถานที่รับ/จัดส่ง
  slipUrl: { type: mongoose.Schema.Types.Mixed, default: "" },
  address: { type: mongoose.Schema.Types.Mixed, default: "" },
  pickupMethod: { 
    type: String, 
    enum: ['DELIVERY', 'PICKUP', ''], 
    default: '' 
  },
  pickupLocation: { type: String, default: "" },

  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventSeries', default: null, index: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null, index: true },
  eventYear: { type: String, default: '', index: true },
  idempotencyKeyHash: { type: String, default: null, select: false, immutable: true },
  idempotencyFingerprint: { type: String, default: null, select: false, immutable: true },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  createdAt: { type: Date, default: Date.now }
});

donationSchema.index(
  { eventId: 1, idempotencyKeyHash: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKeyHash: { $type: 'string' } },
    name: 'unique_donation_idempotency_per_event',
  }
);

donationSchema.plugin(sqlMirrorOutboxPlugin, { domain: 'donations' });

module.exports = mongoose.model('Donation', donationSchema);

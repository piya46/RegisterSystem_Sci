const mongoose = require('mongoose');

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
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Donation', donationSchema);

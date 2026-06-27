const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  qrCode: { type: String, unique: true, required: true },


  fields: { type: Object, default: {} },
  secureIndex: { type: Object, default: {}, select: false },
  secureSearch: { type: [String], default: [], select: false },
  eventYear: { type: String, default: '', index: true },
  tags: [{ type: String, trim: true }],

  status: {
    type: String,
    enum: ['registered', 'checkedIn', 'cancelled'],
    default: 'registered',
    index: true
  },

  checkedInAt: { type: Date, default: null, index: true },
  registeredAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },

  registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null, index: true },
  registeredPoint: { type: String, default: 'Online', index: true },

  isDeleted: { type: Boolean, default: false, index: true },

  // ประเภทการลงทะเบียน
  registrationType: {
    type: String,
    enum: ['online', 'onsite'],
    default: 'online', 
    index: true
  },


  followers: { type: Number, default: 0, min: 0 },

  


  consent: { 
    type: String, 
    enum: ['agreed', 'disagreed', null], 
    default: null 
  },


  specialAssistance: { type: mongoose.Schema.Types.Mixed, default: "" },
  isForfeited: { type: Boolean, default: false, index: true },
  prizeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prize', default: null, index: true },
  prizeWonAt: { type: Date, default: null, index: true }

}, { timestamps: true, versionKey: false });

// Index ที่ช่วยการค้นหา/แดชบอร์ด
participantSchema.index({ status: 1, registeredPoint: 1, createdAt: -1 });
participantSchema.index({ eventYear: 1, status: 1, registeredPoint: 1, createdAt: -1 });
participantSchema.index({ registeredAt: -1 });
participantSchema.index({ 'fields.phone': 1 }, { sparse: true });
participantSchema.index({ 'fields.name': 1 }, { sparse: true });
participantSchema.index({ 'fields.dept': 1 }, { sparse: true });
participantSchema.index({ 'fields.date_year': 1 }, { sparse: true });
participantSchema.index({ 'secureIndex.phone': 1 }, { sparse: true });
participantSchema.index({ 'secureIndex.email': 1 }, { sparse: true });
participantSchema.index({ 'secureIndex.name': 1 }, { sparse: true });
participantSchema.index({ secureSearch: 1 }, { sparse: true });
participantSchema.index({ eventYear: 1, prizeWonAt: 1, isForfeited: 1 });

module.exports = mongoose.model('Participant', participantSchema);

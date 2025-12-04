const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  qrCode: { type: String, unique: true, required: true },

  // ฟิลด์ไดนามิกจากแบบฟอร์ม (เช่น name, phone, email, dept, date_year ...)
  fields: { type: Object, default: {} },

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
    default: 'online', // สอดคล้อง Pre-registration
    index: true
  },

  // เก็บเฉพาะ "จำนวน" ผู้ติดตาม
  followers: { type: Number, default: 0, min: 0 },

  // [ใหม่] เก็บข้อมูลการยินยอม (PDPA Consent)
  consent: { 
    type: String, 
    enum: ['agreed', 'disagreed', null], 
    default: null 
  }

}, { timestamps: true, versionKey: false });

// Index ที่ช่วยการค้นหา/แดชบอร์ด
participantSchema.index({ status: 1, registeredPoint: 1, createdAt: -1 });
participantSchema.index({ registeredAt: -1 });
participantSchema.index({ 'fields.phone': 1 }, { sparse: true });
participantSchema.index({ 'fields.name': 1 }, { sparse: true });
participantSchema.index({ 'fields.dept': 1 }, { sparse: true });
participantSchema.index({ 'fields.date_year': 1 }, { sparse: true });

module.exports = mongoose.model('Participant', participantSchema);
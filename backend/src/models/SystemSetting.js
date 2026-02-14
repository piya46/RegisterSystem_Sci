const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema({
  eventName: { type: String, default: 'Event Name' },
  enableRegister: { type: Boolean, default: true },
  maintenanceMode: { type: Boolean, default: false },
  contactEmail: { type: String, default: '' },
  welcomeMessage: { type: String, default: '' },
  
  // ตั้งค่าเวลาเปิด-ปิด ฟอร์ม Pre-Register
  preRegStartDate: { type: Date, default: null },
  preRegEndDate: { type: Date, default: null },
  
  // ตั้งค่าเวลาเปิด-ปิด ฟอร์ม Kiosk (หน้างาน)
  kioskStartDate: { type: Date, default: null },
  kioskEndDate: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('SystemSetting', systemSettingSchema);
const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema({
  eventName: { type: String, default: 'Event Name' },
  defaultOrganizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
  currentEventSeriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventSeries', default: null },
  currentEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null, index: true },
  currentEventYear: { type: String, default: () => String(new Date().getFullYear()), index: true },
  eventLinkingMode: {
    type: String,
    enum: ['isolated', 'series-linked', 'manual-linked'],
    default: 'series-linked',
  },
  archivedEventYears: [{ type: String, trim: true }],
  enableRegister: { type: Boolean, default: true },
  maintenanceMode: { type: Boolean, default: false },
  enablePickup: { type: Boolean, default: true },   // เพิ่มบรรทัดนี้: เปิดให้รับหน้างาน
  enableDelivery: { type: Boolean, default: true },
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

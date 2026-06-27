const mongoose = require('mongoose');
const { EVENT_STATUSES } = require('../utils/eventLayout');

const layoutSchema = new mongoose.Schema({
  version: { type: Number, default: 1 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  updatedAt: { type: Date, default: null },
  config: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
}, { _id: false });

const defaultLayouts = () => ({
  landingPage: {
    version: 1,
    config: {
      blocks: [
        {
          id: 'hero',
          type: 'hero',
          enabled: true,
          title: '',
          subtitle: '',
          body: '',
          imageUrl: '',
          logoUrl: '',
          primaryActionLabel: 'ลงทะเบียน',
          primaryActionUrl: '',
        },
      ],
    },
  },
  registrationForm: {
    version: 1,
    config: {
      sections: [
        { id: 'personal', title: 'ข้อมูลส่วนตัว', description: 'ข้อมูลหลักที่ใช้ยืนยันตัวตนและออกบัตรเข้างาน' },
        { id: 'contact', title: 'ข้อมูลติดต่อ', description: 'ใช้ส่งอีเมลยืนยันและติดต่อกรณีจำเป็น' },
      ],
      fields: [
        { id: 'name', name: 'name', label: 'ชื่อ-นามสกุล', type: 'text', required: true },
        { id: 'email', name: 'email', label: 'อีเมล', type: 'email', required: true },
        { id: 'phone', name: 'phone', label: 'เบอร์โทรศัพท์', type: 'phone', required: true },
        { id: 'dept', name: 'dept', label: 'ภาควิชา/หน่วยงาน', type: 'text', required: false },
        { id: 'date_year', name: 'date_year', label: 'ปีการศึกษา', type: 'text', required: false },
      ],
    },
  },
  dashboard: {
    version: 1,
    config: {
      widgets: [
        { id: 'registered', type: 'metric', title: 'ผู้ลงทะเบียน', enabled: true },
        { id: 'checked-in', type: 'metric', title: 'เช็คอินแล้ว', enabled: true },
        { id: 'donations', type: 'metric', title: 'ยอดสนับสนุน', enabled: true },
        { id: 'year-comparison', type: 'table', title: 'เปรียบเทียบย้อนหลัง', enabled: true },
      ],
    },
  },
  ticket: {
    version: 1,
    config: {
      blocks: [
        { id: 'ticket-header', type: 'text', label: 'หัวบัตร', value: 'บัตรเข้างาน / อีเมลยืนยัน', enabled: true },
        { id: 'ticket-qr', type: 'qr', label: 'QR Code', value: 'qrCode', enabled: true },
        { id: 'ticket-name', type: 'field', label: 'ชื่อผู้เข้าร่วม', value: 'name', enabled: true },
        { id: 'ticket-note', type: 'text', label: 'หมายเหตุ', value: 'กรุณาแสดง QR Code นี้ที่หน้างาน', enabled: true },
      ],
    },
  },
  report: {
    version: 1,
    config: {
      columns: [
        { id: 'name', key: 'name', label: 'ชื่อ-นามสกุล', enabled: true },
        { id: 'email', key: 'email', label: 'อีเมล', enabled: true },
        { id: 'phone', key: 'phone', label: 'เบอร์โทรศัพท์', enabled: true },
        { id: 'status', key: 'status', label: 'สถานะ', enabled: true },
        { id: 'checkedInAt', key: 'checkedInAt', label: 'เวลาเช็คอิน', enabled: true },
      ],
    },
  },
});

const defaultEnabledFeatures = () => ({
  registration: true,
  checkin: true,
  dashboard: true,
  publicReport: true,
  donations: false,
  packages: false,
  luckyDraw: false,
});

const versionSchema = new mongoose.Schema({
  kind: { type: String, enum: ['landingPage', 'registrationForm', 'dashboard', 'ticket', 'report', 'event'], required: true },
  version: { type: Number, default: 1 },
  snapshot: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  note: { type: String, default: '', trim: true },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  publishedAt: { type: Date, default: Date.now },
}, { _id: false });

const eventSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventSeries', required: true, index: true },
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true },
  eventYear: { type: String, required: true, trim: true, index: true },
  status: { type: String, enum: EVENT_STATUSES, default: 'draft', index: true },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  timezone: { type: String, default: 'Asia/Bangkok', trim: true },
  branding: {
    logoUrl: { type: String, default: '' },
    coverImageUrl: { type: String, default: '' },
    primaryColor: { type: String, default: '#f7b500' },
    secondaryColor: { type: String, default: '#114b5f' },
    accentColor: { type: String, default: '#22a06b' },
  },
  publicLinks: {
    landingPath: { type: String, default: '' },
    registrationPath: { type: String, default: '' },
    checkinPath: { type: String, default: '' },
    reportPath: { type: String, default: '' },
  },
  publication: {
    publishedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    registrationOpenedAt: { type: Date, default: null },
    registrationClosedAt: { type: Date, default: null },
    consentVersion: { type: String, default: '', trim: true },
    requireConsent: { type: Boolean, default: true },
  },
  linkingMode: {
    type: String,
    enum: ['isolated', 'series-linked', 'manual-linked'],
    default: 'series-linked',
  },
  linkedEventIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Event' }],
  config: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({
      enableRegister: true,
      maintenanceMode: false,
      enablePickup: true,
      enableDelivery: true,
      enabledFeatures: defaultEnabledFeatures(),
      allowRegistrationReuse: false,
      registrationReuseMode: 'series-linked',
      registrationReuseRequiresOtp: true,
      registrationReuseEventIds: [],
      contactEmail: '',
      welcomeMessage: '',
      preRegStartDate: null,
      preRegEndDate: null,
      kioskStartDate: null,
      kioskEndDate: null,
    }),
  },
  layouts: {
    landingPage: { type: layoutSchema, default: () => ({ version: 1, config: defaultLayouts().landingPage.config }) },
    registrationForm: { type: layoutSchema, default: () => ({ version: 1, config: defaultLayouts().registrationForm.config }) },
    dashboard: { type: layoutSchema, default: () => ({ version: 1, config: defaultLayouts().dashboard.config }) },
    ticket: { type: layoutSchema, default: () => ({ version: 1, config: defaultLayouts().ticket.config }) },
    report: { type: layoutSchema, default: () => ({ version: 1, config: defaultLayouts().report.config }) },
  },
  templates: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({
      ticketEmail: { subject: '', body: '' },
      confirmationEmail: { subject: '', body: '' },
      reportHeader: {},
    }),
  },
  versionHistory: { type: [versionSchema], default: () => [] },
  archivedAt: { type: Date, default: null },
  activatedAt: { type: Date, default: null },
}, { timestamps: true });

eventSchema.index({ organizationId: 1, seriesId: 1, slug: 1 }, { unique: true });
eventSchema.index({ organizationId: 1, eventYear: 1 });

eventSchema.statics.defaultLayouts = defaultLayouts;
eventSchema.statics.defaultEnabledFeatures = defaultEnabledFeatures;

module.exports = mongoose.model('Event', eventSchema);

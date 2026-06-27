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
  registrationForm: { version: 1, config: { sections: [], fields: [] } },
  dashboard: { version: 1, config: { widgets: [] } },
  ticket: { version: 1, config: { blocks: [] } },
  report: { version: 1, config: { columns: [] } },
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
    registrationForm: { type: layoutSchema, default: () => ({ version: 1, config: { sections: [], fields: [] } }) },
    dashboard: { type: layoutSchema, default: () => ({ version: 1, config: { widgets: [] } }) },
    ticket: { type: layoutSchema, default: () => ({ version: 1, config: { blocks: [] } }) },
    report: { type: layoutSchema, default: () => ({ version: 1, config: { columns: [] } }) },
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

module.exports = mongoose.model('Event', eventSchema);

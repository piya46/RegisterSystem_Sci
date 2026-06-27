const mongoose = require('mongoose');

const layoutSchema = new mongoose.Schema({
  version: { type: Number, default: 1 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  updatedAt: { type: Date, default: null },
  config: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
}, { _id: false });

const defaultLayouts = () => ({
  registrationForm: { version: 1, config: { sections: [], fields: [] } },
  dashboard: { version: 1, config: { widgets: [] } },
  ticket: { version: 1, config: { blocks: [] } },
  report: { version: 1, config: { columns: [] } },
});

const eventSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventSeries', required: true, index: true },
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true },
  eventYear: { type: String, required: true, trim: true, index: true },
  status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft', index: true },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  timezone: { type: String, default: 'Asia/Bangkok', trim: true },
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
  archivedAt: { type: Date, default: null },
  activatedAt: { type: Date, default: null },
}, { timestamps: true });

eventSchema.index({ organizationId: 1, seriesId: 1, slug: 1 }, { unique: true });
eventSchema.index({ organizationId: 1, eventYear: 1 });

eventSchema.statics.defaultLayouts = defaultLayouts;

module.exports = mongoose.model('Event', eventSchema);

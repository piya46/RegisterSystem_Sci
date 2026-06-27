const mongoose = require('mongoose');

const eventSeriesSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true },
  description: { type: String, default: '', trim: true },
  status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  defaultLinkingMode: {
    type: String,
    enum: ['isolated', 'series-linked', 'manual-linked'],
    default: 'series-linked',
  },
  metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
}, { timestamps: true });

eventSeriesSchema.index({ organizationId: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('EventSeries', eventSeriesSchema);

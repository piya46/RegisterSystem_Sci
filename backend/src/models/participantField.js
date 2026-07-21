const mongoose = require('mongoose');

const participantFieldSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  label: { type: String, required: true },
  type: { type: String, enum: ['text', 'email', 'number', 'select', 'date'], default: 'text' },
  required: { type: Boolean, default: false },
  options: [String], // สำหรับ select
  order: { type: Number, default: 0 },
  enabled: { type: Boolean, default: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventSeries', default: null, index: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null, index: true },
  eventYear: { type: String, default: '', index: true },
});

participantFieldSchema.index(
  { eventId: 1, name: 1 },
  { unique: true, partialFilterExpression: { eventId: { $type: 'objectId' } } }
);
participantFieldSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { eventId: null } }
);
participantFieldSchema.index({ eventYear: 1, enabled: 1, order: 1 });

module.exports = mongoose.model('ParticipantField', participantFieldSchema);

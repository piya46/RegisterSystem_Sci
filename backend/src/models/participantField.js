const mongoose = require('mongoose');

const participantFieldSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  label: { type: String, required: true },
  type: { type: String, enum: ['text', 'email', 'number', 'select', 'date'], default: 'text' },
  required: { type: Boolean, default: false },
  options: [String], // สำหรับ select
  order: { type: Number, default: 0 },
  enabled: { type: Boolean, default: true }
});

module.exports = mongoose.model('ParticipantField', participantFieldSchema);

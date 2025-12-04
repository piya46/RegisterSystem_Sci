// src/models/registrationPoint.js
const mongoose = require('mongoose');

const registrationPointSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true }, // eg. "หน้างานประชุม", "ประตูหลัก", ...
  description: { type: String },
  type:        { type: String, enum: ['onsite', 'meeting', 'kiosk', 'other'], default: 'onsite' },
  enabled:     { type: Boolean, default: true },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },
});

registrationPointSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('RegistrationPoint', registrationPointSchema);

const mongoose = require('mongoose');

const cronLogSchema = new mongoose.Schema({
  jobName: { type: String, required: true },
  status: { type: String, enum: ['running', 'success', 'failed'], default: 'running' },
  startTime: { type: Date, default: Date.now },
  endTime: Date,
  detail: String,
}, { timestamps: true });

module.exports = mongoose.model('CronLog', cronLogSchema);
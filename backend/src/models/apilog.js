const mongoose = require('mongoose');

const apiLogSchema = new mongoose.Schema({
  user: String,            
  userId: String,           
  method: String,
  url: String,
  status: Number,
  ip: String,
  userAgent: String,
  action: String,           
  detail: String,           
  error: String,            
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('LogServer', apiLogSchema);

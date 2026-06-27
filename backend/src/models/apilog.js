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

apiLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: Number(process.env.AUDIT_LOG_RETENTION_DAYS || 365) * 24 * 60 * 60 }
);
apiLogSchema.index({ action: 1, createdAt: -1 });
apiLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('LogServer', apiLogSchema);

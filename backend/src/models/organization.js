const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
  description: { type: String, default: '', trim: true },
  status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  securityPolicy: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({
      requireMfaForSensitiveActions: true,
      requireAuditReasonForDecrypt: true,
      allowPublicRegistration: true,
    }),
  },
  metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
}, { timestamps: true });

module.exports = mongoose.model('Organization', organizationSchema);

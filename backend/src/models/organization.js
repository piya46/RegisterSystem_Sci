const mongoose = require('mongoose');
const sqlMirrorOutboxPlugin = require('../utils/sqlMirrorOutboxPlugin');

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

organizationSchema.plugin(sqlMirrorOutboxPlugin, { domain: 'organizations', eventPath: null });

module.exports = mongoose.model('Organization', organizationSchema);

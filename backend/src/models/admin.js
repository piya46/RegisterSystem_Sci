const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    username: {type: "String", required: true, unique: true},
    passwordHash: {type: "String", required: true},
    role : {type: ["String"], default: () => ["staff"]},
    permissions: [{ type: String, trim: true }],
    organizationIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Organization' }],
    eventIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Event' }],
    email : {type: "String", required: true, unique: true},
    fullName: {type: "String", required: true},
    registrationPoints: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RegistrationPoint' }],
    avatarUrl: { type: String, default: "" },
    avatarObjectRef: { type: String, default: "", select: false },

    googleId: { type: String, default: null },

    resetPasswordOtp: { type: String },
    resetPasswordRef: { type: String },
    resetPasswordExpires: { type: Date },
    resetPasswordAttempts: { type: Number, default: 0 },
    actionOtp: { type: String },
  actionRef: { type: String },
  actionExpires: { type: Date },
  actionAttempts: { type: Number, default: 0 },
  mustChangePassword: { type: Boolean, default: false }
});

module.exports = mongoose.model('Admin', adminSchema);

const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    username: {type: "String", required: true, unique: true},
    passwordHash: {type: "String", required: true},
    role : {type: ["String"], default: "staff"},
    email : {type: "String", required: true, unique: true},
    fullName: {type: "String", required: true},
    registrationPoints: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RegistrationPoint' }],
    avatarUrl: { type: String, default: "" },
});

module.exports = mongoose.model('Admin', adminSchema);
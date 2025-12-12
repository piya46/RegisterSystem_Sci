const Admin = require('../models/admin');
const bcrypt = require('bcrypt');
const auditLog = require('../helpers/auditLog');
const { sendResetPasswordMail } = require('../utils/sendTicketMail');
const path = require("path");
const fs = require("fs");
const logger = require('../utils/logger');
const CronLog = require('../models/cronLog');

exports.createAdmin = async (req,res) => {
  try {
    const {username, password, role, email, fullName} = req.body;
    const exists = await Admin.findOne({ username });
    if (exists) {
      auditLog({ req, action: 'CREATE_ADMIN_FAIL', detail: `username=${username} exists`, status: 400 });
      return res.status(400).json({ error: 'Username exists' });
    }
    const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_SALT_ROUNDS));
    const admin = new Admin({ username, passwordHash, role, email, fullName });
    await admin.save();
    
    auditLog({ req, action: 'CREATE_ADMIN', detail: `username=${username}` });
    logger.info(`[ADMIN][${req.user?.username || 'System'}] CREATE_ADMIN username=${username}`);
    
    res.json({ message: 'Admin created', admin: { ...admin.toObject(), passwordHash: undefined } });
  } catch (err) {
    logger.error(`Create Admin Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

exports.listAdmins = async (req, res) => {
  try {
    
    const admins = await Admin.find({}, '-passwordHash');
    auditLog({ req, action: 'LIST_ADMINS', detail: `Count=${admins.length}` });
    res.json(admins);
  } catch (err) {
    console.error('List Admins Error:', err);
    res.status(500).json({ error: 'Failed to fetch admins list', details: err.message });
  }
};

exports.deleteAdmin = async (req, res) => {
  try {
    const targetId = req.params.id;
    const admin = await Admin.findById(targetId);
    
    if (!admin) {
      auditLog({ req, action: 'DELETE_ADMIN_FAIL', detail: `targetId=${targetId} not found`, status: 404 });
      return res.status(404).json({ error: 'User not found' });
    }

  
    if (req.user && req.user._id.toString() === targetId) {
      return res.status(400).json({ error: "You can't delete yourself!" });
    }


    if (admin.role.includes('admin')) {
        auditLog({ req, action: 'DELETE_ADMIN_FAIL', detail: `Try to delete admin ${admin.username}`, status: 403 });
        return res.status(403).json({ error: 'ไม่ได้รับอนุญาตให้ลบบัญชีผู้ดูแลระบบ (Admin) ท่านอื่น' });
    }

 
    await Admin.findByIdAndDelete(targetId);
    
    res.json({ message: 'User deleted successfully' });
    auditLog({ req, action: 'DELETE_ADMIN', detail: `targetId=${targetId}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateAdmin = async (req, res) => {
  try {

    const { role, email, fullName, registrationPoints } = req.body;
    
    const updateData = { role, email, fullName };
    if (registrationPoints !== undefined) {
      updateData.registrationPoints = registrationPoints;
    }

    const admin = await Admin.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    if (!admin) {
      auditLog({ req, action: 'UPDATE_ADMIN_FAIL', detail: `targetId=${req.params.id} not found`, status: 404 });
      return res.status(404).json({ error: 'Admin not found' });
    }
    auditLog({ req, action: 'UPDATE_ADMIN', detail: `targetId=${req.params.id}` });
    res.json({ message: 'Admin updated', admin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    if (!req.user.role.includes('admin')) {
      auditLog({ req, action: 'RESET_PASSWORD_FAIL', detail: 'Not authorized', status: 403 });
      return res.status(403).json({ error: 'You do not have permission to reset other passwords.' });
    }

    const { userId, newPassword } = req.body;
    const target = await Admin.findById(userId);
    if (!target) {
      auditLog({ req, action: 'RESET_PASSWORD_FAIL', detail: `User not found: ${userId}`, status: 404 });
      return res.status(404).json({ error: 'User not found' });
    }

    if (target.role.includes('admin')) {
      auditLog({ req, action: 'RESET_PASSWORD_FAIL', detail: `Tried to reset another admin`, status: 403 });
      return res.status(403).json({ error: 'You cannot reset password for another admin.' });
    }

    const hash = await bcrypt.hash(newPassword, Number(process.env.BCRYPT_SALT_ROUNDS) || 12);
    target.passwordHash = hash;
    await target.save();

    auditLog({ req, action: 'RESET_PASSWORD', detail: `Reset for user=${target.username}` });
    
  
    try {
      await sendResetPasswordMail(
        target.email,
        newPassword,
        target.username
      );
    } catch (mailErr) {
      console.error("Email sending failed:", mailErr);
    
    }

    res.json({ message: 'Password reset successfully (Email sent).' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.user._id);

    if (!admin) {
      auditLog({ req, action: 'CHANGE_PASSWORD_FAIL', detail: 'User not found', status: 404 });
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await bcrypt.compare(oldPassword, admin.passwordHash);
    if (!isMatch) {
      auditLog({ req, action: 'CHANGE_PASSWORD_FAIL', detail: 'Incorrect old password', status: 400 });
      return res.status(400).json({ error: 'Old password is incorrect' });
    }

    admin.passwordHash = await bcrypt.hash(newPassword, Number(process.env.BCRYPT_SALT_ROUNDS) || 12);
    await admin.save();

    auditLog({ req, action: 'CHANGE_PASSWORD', detail: `User=${admin.username}` });
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateStaff = async (req, res) => {
  try {
    if (!req.user.role.includes('admin')) {
      auditLog({ req, action: 'UPDATE_STAFF_FAIL', detail: 'Not authorized', status: 403 });
      return res.status(403).json({ error: 'You do not have permission to update staff.' });
    }

    const { email, fullName, registrationPoints } = req.body;
    const staff = await Admin.findById(req.params.id);

    if (!staff) {
      auditLog({ req, action: 'UPDATE_STAFF_FAIL', detail: `Staff not found id=${req.params.id}`, status: 404 });
      return res.status(404).json({ error: 'Staff not found' });
    }

    if (staff.role.includes('admin') && !req.user._id.equals(staff._id)) {
      auditLog({ req, action: 'UPDATE_STAFF_FAIL', detail: `Cannot update another admin.`, status: 403 });
      return res.status(403).json({ error: 'You cannot update another admin.' });
    }

    if (registrationPoints && staff.role.includes('staff')) {
      staff.registrationPoints = registrationPoints;
    }
    if (email) staff.email = email;
    if (fullName) staff.fullName = fullName;

    await staff.save();
    auditLog({ req, action: 'UPDATE_STAFF', detail: `Updated staff id=${staff._id}` });
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const admin = await Admin.findById(req.user._id);
    if (!admin) return res.status(404).json({ error: "User not found" });


    if (admin.avatarUrl) {
    const oldPath = path.join(__dirname, "..", "uploads", "avatars", admin.avatarUrl);
    if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
    }
}


    admin.avatarUrl = req.file.filename;
    await admin.save();

    res.json({
      message: "Avatar uploaded successfully",
      filename: req.file.filename,
      url: `/uploads/avatars/${req.file.filename}`
    });
  } catch (err) {
    console.error("Upload Avatar Error:", err);
    res.status(500).json({ error: "Failed to upload avatar" });
  }
};

exports.getCronLogs = async (req, res) => {
  try {
    const logs = await CronLog.find().sort({ startTime: -1 }).limit(50);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
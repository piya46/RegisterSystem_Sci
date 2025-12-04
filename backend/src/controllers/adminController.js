const Admin = require('../models/admin');
const bcrypt = require('bcrypt');
const auditLog = require('../helpers/auditLog');
const sendMail = require('../utils/sendMail');
const path = require("path");
const fs = require("fs");

exports.createAdmin = async (req,res) => {
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
    res.json({ message: 'Admin created', admin: { ...admin.toObject(), passwordHash: undefined } });
    logger.info(`[ADMIN][${req.user.username}] CREATE_ADMIN username=${username}`);
};

exports.listAdmins = async (req, res) => {
  const admins = await Admin.find({}, '-passwordHash');
  auditLog({ req, action: 'LIST_ADMINS', detail: `Count=${admins.length}` });
  res.json(admins);
};

exports.deleteAdmin = async (req, res) => {
  const admin = await Admin.findById(req.params.id);
  if (!admin) {
    auditLog({ req, action: 'DELETE_ADMIN_FAIL', detail: `targetId=${req.params.id} not found`, status: 404 });
    return res.status(404).json({ error: 'Admin not found' });
  }
  if (req.user && req.user._id.toString() === req.params.id) {
    return res.status(400).json({ error: "You can't delete yourself!" });
  }
  const adminCount = await Admin.countDocuments();
  if (adminCount <= 1) {
    return res.status(400).json({ error: 'Cannot delete the last admin!' });
  }
  await Admin.findByIdAndDelete(req.params.id);
  res.json({ message: 'Admin deleted' });
  auditLog({ req, action: 'DELETE_ADMIN', detail: `targetId=${req.params.id}` });
};

exports.updateAdmin = async (req, res) => {
  const { role, email, fullName } = req.body;
  const admin = await Admin.findByIdAndUpdate(
    req.params.id,
    { role, email, fullName },
    { new: true }
  );
  if (!admin) {
    auditLog({ req, action: 'UPDATE_ADMIN_FAIL', detail: `targetId=${req.params.id} not found`, status: 404 });
    return res.status(404).json({ error: 'Admin not found' });
  }
  auditLog({ req, action: 'UPDATE_ADMIN', detail: `targetId=${req.params.id}` });
  res.json({ message: 'Admin updated', admin });
};

exports.resetPassword = async (req, res) => {
  // ให้เฉพาะ admin เท่านั้นที่ reset password คนอื่นได้
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

  // ไม่อนุญาตให้ admin reset รหัสผ่านของ admin ด้วยกันเอง
  if (target.role.includes('admin')) {
    auditLog({ req, action: 'RESET_PASSWORD_FAIL', detail: `Tried to reset another admin`, status: 403 });
    return res.status(403).json({ error: 'You cannot reset password for another admin.' });
  }

  const hash = await bcrypt.hash(newPassword, Number(process.env.BCRYPT_SALT_ROUNDS) || 12);
  target.passwordHash = hash;
  await target.save();

  auditLog({ req, action: 'RESET_PASSWORD', detail: `Reset for user=${target.username}` });
  try {
    await sendMail(
      target.email,
      'Your password has been reset',
      `Your new password: ${newPassword}`
    );
  } catch (err) {
    auditLog({ req, action: 'RESET_PASSWORD_EMAIL_FAIL', detail: `to=${target.email}`, error: err.message, status: 500 });
  }

  res.json({ message: 'Password reset and email sent.' });
};

exports.changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const admin = await Admin.findById(req.user._id);

  if (!admin) {
    auditLog({ req, action: 'CHANGE_PASSWORD_FAIL', detail: 'User not found', status: 404 });
    return res.status(404).json({ error: 'User not found' });
  }

  // เช็ค oldPassword
  const isMatch = await bcrypt.compare(oldPassword, admin.passwordHash);
  if (!isMatch) {
    auditLog({ req, action: 'CHANGE_PASSWORD_FAIL', detail: 'Incorrect old password', status: 400 });
    return res.status(400).json({ error: 'Old password is incorrect' });
  }

  // เปลี่ยนรหัสผ่านใหม่
  admin.passwordHash = await bcrypt.hash(newPassword, Number(process.env.BCRYPT_SALT_ROUNDS) || 12);
  await admin.save();

  auditLog({ req, action: 'CHANGE_PASSWORD', detail: `User=${admin.username}` });
  res.json({ message: 'Password changed successfully' });
};

exports.updateStaff = async (req, res) => {
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

  // กัน admin แก้ admin ด้วยกันเอง
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
};

exports.uploadAvatar = async (req, res) => {
  console.log("FILE:", req.file);
  console.log("USER:", req.user);
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const admin = await Admin.findById(req.user._id);
  if (!admin) return res.status(404).json({ error: "User not found" });

  // ลบรูปเก่า (ถ้ามี)
  if (admin.avatar) {
    const oldPath = path.join(__dirname, "..", "uploads", "avatars", admin.avatar);
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }

  // เซฟชื่อไฟล์ใหม่ลง DB
  admin.avatar = req.file.filename;
  await admin.save();

  res.json({
    message: "Avatar uploaded successfully",
    filename: req.file.filename,
    url: `/uploads/avatars/${req.file.filename}`
  });
};
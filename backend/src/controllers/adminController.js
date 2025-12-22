const Admin = require('../models/admin');
const bcrypt = require('bcrypt');
const auditLog = require('../helpers/auditLog');
const { sendResetPasswordMail } = require('../utils/sendTicketMail');
const path = require("path");
const fs = require("fs");
const logger = require('../utils/logger');
const CronLog = require('../models/cronLog');
const { generateOTP, generateRef } = require('../utils/otp');
const sendMail = require('../utils/sendMail');
const { getOtpTemplate } = require('../utils/emailTemplates');

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

exports.requestActionOtp = async (req, res) => {
    try {
        const operator = await Admin.findById(req.user.id);
        if (!operator || !operator.email) return res.status(400).json({ error: 'ไม่พบอีเมลของผู้ดูแลระบบ' });

        const otp = generateOTP();
        const ref = generateRef();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        operator.actionOtp = otp;
        operator.actionRef = ref;
        operator.actionExpires = expiresAt;
        await operator.save();

        // ใช้ Template ลูกเสือ
        const htmlContent = getOtpTemplate(otp, ref, operator.username, 'Admin Confirm');

        await sendMail(
            operator.email, 
            `🔐 รหัส OTP ยืนยันรายการ (Ref: ${ref})`, 
            `รหัส OTP: ${otp} (Ref: ${ref})`, 
            htmlContent
        );

        res.json({ success: true, message: 'ส่ง OTP ไปยังอีเมลของคุณแล้ว', ref });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'ส่ง OTP ไม่สำเร็จ' });
    }
};

// ✅ 2. Reset Password ให้ User อื่น (Admin Tool)
exports.resetPassword = async (req, res) => {
  try {
    // ต้องเป็น Admin เท่านั้น
    if (!req.user.role.includes('admin')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { userId, newPassword, otp } = req.body;
    const targetUser = await Admin.findById(userId);
    const operator = await Admin.findById(req.user.id);

    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    // --- LOGIC แยก Role ---
    const isTargetAdmin = targetUser.role.includes('admin');

    if (isTargetAdmin) {
        // 🔒 กรณีแก้ให้ Admin: ต้องใช้ OTP ของ Operator
        if (!otp) {
            return res.status(400).json({ 
                error: 'REQUIRE_OTP', 
                message: 'การรีเซตรหัสผ่าน Admin ต้องยืนยัน OTP ของคุณก่อน' 
            });
        }

        // ตรวจสอบ OTP ที่ตัว Operator
        if (!operator.actionOtp || operator.actionOtp !== otp) {
            return res.status(400).json({ error: 'รหัส OTP ไม่ถูกต้อง' });
        }
        if (operator.actionExpires < new Date()) {
            return res.status(400).json({ error: 'รหัส OTP หมดอายุ' });
        }

        // ใช้แล้วลบทิ้ง
        operator.actionOtp = undefined;
        operator.actionExpires = undefined;
        await operator.save();
    } 
    // 🔓 กรณีแก้ให้ Staff/Kiosk: ไม่ต้องทำอะไรเพิ่ม (ผ่านได้เลย)

    // บันทึกรหัสผ่านใหม่
    targetUser.passwordHash = await bcrypt.hash(newPassword, Number(process.env.BCRYPT_SALT_ROUNDS) || 12);
    await targetUser.save();

    auditLog({ 
        req, 
        action: 'ADMIN_RESET_PWD', 
        detail: `Target: ${targetUser.username} (${isTargetAdmin ? 'Admin' : 'Staff'})` 
    });
    
    // ส่งอีเมลแจ้งเจ้าตัวว่ารหัสเปลี่ยนแล้ว
    try {
      await sendResetPasswordMail(targetUser.email, newPassword, targetUser.username);
    } catch (e) { console.error("Email fail:", e); }

    res.json({ message: 'เปลี่ยนรหัสผ่านสำเร็จ (ส่งอีเมลแจ้งเรียบร้อย)' });

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
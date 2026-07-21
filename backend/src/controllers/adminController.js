const Admin = require('../models/admin');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const auditLog = require('../helpers/auditLog');
const { sendResetPasswordMail } = require('../utils/sendTicketMail');
const path = require("path");
const fs = require("fs");
const logger = require('../utils/logger');
const CronLog = require('../models/cronLog');
const Session = require('../models/session');
const { generateOTP, generateRef, hashOTP, verifyOTP } = require('../utils/otp');
const sendMail = require('../utils/sendMail');
const { getOtpTemplate } = require('../utils/emailTemplates');
const { serverError } = require('../utils/httpResponses');
const { isAdminLike, isSuperadmin } = require('../utils/permissions');
const {
  claimAvatarObject,
  deleteStoredObjectByReference,
  quarantineAvatarObject,
  storeImage,
} = require('../utils/objectStorage');

async function cleanupAvatarObject(reference, adminId) {
  if (!reference) return;
  try {
    await deleteStoredObjectByReference(reference);
  } catch (error) {
    await quarantineAvatarObject(reference, adminId).catch(() => {});
    throw error;
  }
}

function isStrongPassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

function rolesOfPayload(role) {
  if (role === undefined) return [];
  return (Array.isArray(role) ? role : [role]).filter(Boolean);
}

function wantsSystemAdminRole(role) {
  return rolesOfPayload(role).some((item) => ['superadmin', 'admin', 'org_admin'].includes(item));
}

function customPermissionsRequested(permissions) {
  return Array.isArray(permissions) ? permissions.length > 0 : permissions !== undefined && permissions !== null;
}

function assertCanWriteSensitiveUserAccess(req, res, payload = {}, targetUser = null) {
  const operatorIsSuperadmin = isSuperadmin(req.user);

  if (!operatorIsSuperadmin && wantsSystemAdminRole(payload.role)) {
    auditLog({ req, action: 'USER_ROLE_ESCALATION_BLOCK', detail: 'Non-superadmin attempted to assign system admin role', status: 403 });
    res.status(403).json({ error: 'เฉพาะ Superadmin เท่านั้นที่กำหนดสิทธิ์ผู้ดูแลระบบระดับสูงได้' });
    return false;
  }

  if (!operatorIsSuperadmin && customPermissionsRequested(payload.permissions)) {
    auditLog({ req, action: 'USER_PERMISSION_ESCALATION_BLOCK', detail: 'Non-superadmin attempted to set custom permissions', status: 403 });
    res.status(403).json({ error: 'เฉพาะ Superadmin เท่านั้นที่กำหนด permissions แบบกำหนดเองได้' });
    return false;
  }

  if (targetUser && isSuperadmin(targetUser) && !operatorIsSuperadmin) {
    auditLog({ req, action: 'SUPERADMIN_UPDATE_BLOCK', detail: `targetId=${targetUser._id}`, status: 403 });
    res.status(403).json({ error: 'เฉพาะ Superadmin เท่านั้นที่แก้ไขบัญชี Superadmin ได้' });
    return false;
  }

  if (targetUser && isAdminLike(targetUser) && !operatorIsSuperadmin && String(targetUser._id) !== String(req.user?._id)) {
    auditLog({ req, action: 'ADMIN_UPDATE_BLOCK', detail: `targetId=${targetUser._id}`, status: 403 });
    res.status(403).json({ error: 'เฉพาะ Superadmin เท่านั้นที่แก้ไขบัญชีผู้ดูแลระบบคนอื่นได้' });
    return false;
  }

  return true;
}

exports.createAdmin = async (req,res) => {
  try {
    const {username, password, role, email, fullName, permissions, organizationIds, eventIds} = req.body;
    if (!assertCanWriteSensitiveUserAccess(req, res, { role, permissions })) return;
    if (!isStrongPassword(password)) return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
    const exists = await Admin.findOne({ username });
    if (exists) {
      auditLog({ req, action: 'CREATE_ADMIN_FAIL', detail: `username=${username} exists`, status: 400 });
      return res.status(400).json({ error: 'Username exists' });
    }
    const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_SALT_ROUNDS) || 12);
    const admin = new Admin({ username, passwordHash, role, email, fullName, permissions, organizationIds, eventIds });
    await admin.save();

    auditLog({ req, action: 'CREATE_ADMIN', detail: `username=${username}` });
    logger.info(`[ADMIN][${req.user?.username || 'System'}] CREATE_ADMIN username=${username}`);

    res.json({ message: 'Admin created', admin: { ...admin.toObject(), passwordHash: undefined } });
  } catch (err) {
    logger.error(`Create Admin Error: ${err.message}`);
    serverError(res);
  }
};

exports.listAdmins = async (req, res) => {
  try {

    const admins = await Admin.find({}, '-passwordHash');
    auditLog({ req, action: 'LIST_ADMINS', detail: `Count=${admins.length}` });
    res.json(admins);
  } catch (err) {
    console.error('List Admins Error:', err);
    serverError(res, 'Failed to fetch admins list');
  }
};

exports.deleteAdmin = async (req, res) => {
  try {
    const targetId = req.params.id;
    const admin = await Admin.findById(targetId).select('+avatarObjectRef');

    if (!admin) {
      auditLog({ req, action: 'DELETE_ADMIN_FAIL', detail: `targetId=${targetId} not found`, status: 404 });
      return res.status(404).json({ error: 'User not found' });
    }


    if (req.user && req.user._id.toString() === targetId) {
      return res.status(400).json({ error: "You can't delete yourself!" });
    }


    if (isAdminLike(admin) && !isSuperadmin(req.user)) {
        auditLog({ req, action: 'DELETE_ADMIN_FAIL', detail: `Try to delete admin ${admin.username}`, status: 403 });
        return res.status(403).json({ error: 'ไม่ได้รับอนุญาตให้ลบบัญชีผู้ดูแลระบบ (Admin) ท่านอื่น' });
    }
    if (isSuperadmin(admin)) {
        auditLog({ req, action: 'DELETE_ADMIN_FAIL', detail: `Try to delete superadmin ${admin.username}`, status: 403 });
        return res.status(403).json({ error: 'ไม่สามารถลบบัญชี Superadmin ได้จากหน้านี้' });
    }


    await Admin.findByIdAndDelete(targetId);
    // Force session revocation for deleted admin
    await Session.updateMany({ userId: targetId }, { revoked: true });
    if (admin.avatarObjectRef) {
      await cleanupAvatarObject(admin.avatarObjectRef, admin._id).catch((cleanupError) => {
        console.error('[Admin] Deleted account avatar cleanup failed:', {
          code: String(cleanupError.code || 'ADMIN_AVATAR_CLEANUP_FAILED').slice(0, 80),
        });
      });
    }

    res.json({ message: 'User deleted successfully' });
    auditLog({ req, action: 'DELETE_ADMIN', detail: `targetId=${targetId}` });
  } catch (err) {
    serverError(res);
  }
};

exports.updateAdmin = async (req, res) => {
  try {

    const { role, email, fullName, registrationPoints, permissions, organizationIds, eventIds } = req.body;
    const targetUser = await Admin.findById(req.params.id);
    if (!targetUser) {
      auditLog({ req, action: 'UPDATE_ADMIN_FAIL', detail: `targetId=${req.params.id} not found`, status: 404 });
      return res.status(404).json({ error: 'Admin not found' });
    }
    if (!assertCanWriteSensitiveUserAccess(req, res, { role, permissions }, targetUser)) return;

    const updateData = { role, email, fullName };
    if (permissions !== undefined) updateData.permissions = permissions;
    if (organizationIds !== undefined) updateData.organizationIds = organizationIds;
    if (eventIds !== undefined) updateData.eventIds = eventIds;
    if (registrationPoints !== undefined) {
      updateData.registrationPoints = registrationPoints;
    }

    const admin = await Admin.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    // Force session revocation for security on any profile/role/permission update
    await Session.updateMany({ userId: req.params.id }, { revoked: true });

    auditLog({ req, action: 'UPDATE_ADMIN', detail: `targetId=${req.params.id}, role=${role}` });
    res.json({ message: 'Admin updated', admin });
  } catch (err) {
    serverError(res);
  }
};

exports.requestActionOtp = async (req, res) => {
    try {
        const operator = await Admin.findById(req.user.id);
        if (!operator || !operator.email) return res.status(400).json({ error: 'ไม่พบอีเมลของผู้ดูแลระบบ' });

        const otp = generateOTP();
        const ref = generateRef();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        operator.actionOtp = hashOTP(otp);
        operator.actionRef = ref;
        operator.actionExpires = expiresAt;
        operator.actionAttempts = 0;
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
    if (!isAdminLike(req.user)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { userId, newPassword, otp } = req.body;
    if (!isStrongPassword(newPassword)) return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
    const targetUser = await Admin.findById(userId);
    const operator = await Admin.findById(req.user.id);

    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    if (isSuperadmin(targetUser) && !isSuperadmin(req.user)) {
      auditLog({ req, action: 'RESET_SUPERADMIN_PASSWORD_BLOCK', detail: `targetId=${targetUser._id}`, status: 403 });
      return res.status(403).json({ error: 'เฉพาะ Superadmin เท่านั้นที่รีเซ็ตรหัสผ่านบัญชี Superadmin ได้' });
    }

    // --- LOGIC แยก Role ---
    const isTargetAdmin = isAdminLike(targetUser);

    if (isTargetAdmin) {
        // 🔒 กรณีแก้ให้ Admin: ต้องใช้ OTP ของ Operator
        if (!otp) {
            return res.status(400).json({
                error: 'REQUIRE_OTP',
                message: 'การรีเซตรหัสผ่าน Admin ต้องยืนยัน OTP ของคุณก่อน'
            });
        }

        // ตรวจสอบ OTP ที่ตัว Operator
        if ((operator.actionAttempts || 0) >= 5) {
            return res.status(429).json({ error: 'กรอกรหัส OTP ผิดเกินกำหนด กรุณาขอรหัสใหม่' });
        }

        if (!verifyOTP(otp, operator.actionOtp)) {
            operator.actionAttempts = (operator.actionAttempts || 0) + 1;
            await operator.save();
            return res.status(400).json({ error: 'รหัส OTP ไม่ถูกต้อง' });
        }
        if (!operator.actionExpires || operator.actionExpires < new Date()) {
            return res.status(400).json({ error: 'รหัส OTP หมดอายุ' });
        }

        // ใช้แล้วลบทิ้ง
        operator.actionOtp = undefined;
        operator.actionExpires = undefined;
        operator.actionAttempts = 0;
        await operator.save();
    }
    // 🔓 กรณีแก้ให้ Staff/Kiosk: ไม่ต้องทำอะไรเพิ่ม (ผ่านได้เลย)

    // บันทึกรหัสผ่านใหม่
    targetUser.passwordHash = await bcrypt.hash(newPassword, Number(process.env.BCRYPT_SALT_ROUNDS) || 12);
    targetUser.mustChangePassword = true;
    await targetUser.save();
    await Session.updateMany({ userId: targetUser._id }, { revoked: true });

    auditLog({
        req,
        action: 'ADMIN_RESET_PWD',
        detail: `Target: ${targetUser.username} (${isTargetAdmin ? 'Admin' : 'Staff'})`
    });

    // ส่งอีเมลแจ้งเจ้าตัวว่ารหัสเปลี่ยนแล้ว
    try {
      await sendResetPasswordMail(targetUser.email, targetUser.username);
    } catch (e) { console.error("Email fail:", e); }

    res.json({ message: 'เปลี่ยนรหัสผ่านสำเร็จ (ส่งอีเมลแจ้งเรียบร้อย)' });

  } catch (err) {
    console.error(err);
    serverError(res);
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!isStrongPassword(newPassword)) return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
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
    admin.mustChangePassword = false;
    await admin.save();

    auditLog({ req, action: 'CHANGE_PASSWORD', detail: `User=${admin.username}` });
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    serverError(res);
  }
};

exports.updateStaff = async (req, res) => {
  try {
    if (!isAdminLike(req.user)) {
      auditLog({ req, action: 'UPDATE_STAFF_FAIL', detail: 'Not authorized', status: 403 });
      return res.status(403).json({ error: 'You do not have permission to update staff.' });
    }

    const { email, fullName, registrationPoints } = req.body;
    const staff = await Admin.findById(req.params.id);

    if (!staff) {
      auditLog({ req, action: 'UPDATE_STAFF_FAIL', detail: `Staff not found id=${req.params.id}`, status: 404 });
      return res.status(404).json({ error: 'Staff not found' });
    }

    if (isAdminLike(staff) && !isSuperadmin(req.user) && !req.user._id.equals(staff._id)) {
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
    serverError(res);
  }
};

exports.uploadAvatar = async (req, res) => {
  let stored = null;
  let persisted = false;
  let dbSession = null;
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const admin = await Admin.findById(req.user._id).select('+avatarObjectRef');
    if (!admin) return res.status(404).json({ error: "User not found" });

    stored = await storeImage({
      buffer: req.file.buffer,
      declaredMimeType: req.file.mimetype,
      purpose: 'avatar',
      uploadedBy: admin._id,
    });

    let oldObjectRef = '';
    let oldLegacyAvatar = '';
    dbSession = await mongoose.startSession();
    await dbSession.withTransaction(async () => {
      const currentAdmin = await Admin.findById(req.user._id).select('+avatarObjectRef').session(dbSession);
      if (!currentAdmin) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
      }
      oldObjectRef = currentAdmin.avatarObjectRef;
      oldLegacyAvatar = currentAdmin.avatarUrl && !currentAdmin.avatarUrl.includes('/')
        ? currentAdmin.avatarUrl
        : '';
      await claimAvatarObject(stored.reference, { adminId: currentAdmin._id, session: dbSession });
      currentAdmin.avatarUrl = stored.url;
      currentAdmin.avatarObjectRef = stored.reference;
      await currentAdmin.save({ session: dbSession });
    });
    persisted = true;

    if (oldObjectRef) {
      await cleanupAvatarObject(oldObjectRef, admin._id).catch((cleanupError) => {
        console.error('[Admin] Replaced avatar cleanup deferred:', {
          code: String(cleanupError.code || 'REPLACED_AVATAR_CLEANUP_FAILED').slice(0, 80),
        });
      });
    }
    if (oldLegacyAvatar) {
      const oldPath = path.join(__dirname, "..", "uploads", "avatars", oldLegacyAvatar);
      try {
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch (cleanupError) {
        console.error('Legacy avatar cleanup failed:', { code: cleanupError.code || 'LEGACY_AVATAR_CLEANUP_FAILED' });
      }
    }

    res.json({
      message: "Avatar uploaded successfully",
      reference: stored.reference,
      url: stored.url,
      optimization: stored.optimization,
    });
  } catch (err) {
    if (!persisted && stored?.reference) await deleteStoredObjectByReference(stored.reference).catch(() => {});
    console.error("Upload Avatar Error:", { code: err.code || 'AVATAR_UPLOAD_FAILED' });
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to upload avatar" });
  } finally {
    if (dbSession) dbSession.endSession();
  }
};

exports.getCronLogs = async (req, res) => {
  try {
    const logs = await CronLog.find().sort({ startTime: -1 }).limit(50);
    res.json(logs);
  } catch (err) {
    serverError(res);
  }
};

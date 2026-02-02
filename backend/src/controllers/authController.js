const Admin = require('../models/admin');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Session = require('../models/session');
const auditLog = require('../helpers/auditLog');
const ms = require('ms');
const verifyTurnstile = require('../utils/verifyTurnstile');
const { generateOTP, generateRef } = require('../utils/otp');
const sendMail = require('../utils/sendMail');
const { getOtpTemplate } = require('../utils/emailTemplates');
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.LOGIN_CLIENT_ID);
const { getPublicKey, decryptData } = require('../utils/cryptoService'); // ✅ Import

// --- Get Public Key ---
exports.getPublicKey = (req, res) => {
    res.json({ publicKey: getPublicKey() });
};

// --- Login ---
exports.login = async (req, res) => {
    let { username, password, cfToken } = req.body;

    // 1. Verify Turnstile
    const isHuman = await verifyTurnstile(cfToken, req.ip);
    if (!isHuman) {
        auditLog({ req, action: 'LOGIN_BOT_BLOCK', detail: 'Turnstile failed', status: 400 });
        return res.status(400).json({ 
            error: 'Security Check Failed', 
            message: 'ระบบตรวจสอบพบความผิดปกติ กรุณาลองใหม่อีกครั้ง' 
        });
    }

    // ✅ 2. Decrypt Password (E2EE)
    // รับรหัสผ่านที่ถูก Encrypt มาแล้วจาก Frontend
    const decryptedPassword = decryptData(password);
    
    if (decryptedPassword) {
        password = decryptedPassword;
    } else {
        // 🔒 บังคับ E2EE: ถ้าส่งแบบ Plain Text หรือ Key ผิด ให้ Reject ทันที
        auditLog({ req, action: 'LOGIN_FAIL', detail: 'Encryption required / Decrypt failed', status: 400 });
        return res.status(400).json({ 
            error: 'Decryption failed', 
            message: 'ระบบความปลอดภัยขัดข้อง (การเข้ารหัสล้มเหลว)' 
        });
    }

    const admin = await Admin.findOne({ username });
    if (!admin) {
        auditLog({ req, action: 'LOGIN_FAIL', detail: 'User not found', status: 401 });
        return res.status(401).json({ error: 'User not found' });
    }
    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
        auditLog({ req, action: 'LOGIN_FAIL', detail: 'Invalid credentials', status: 401 });
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 3. Session Management
    const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '4h';
    const expiresInMs = ms(jwtExpiresIn);
    const expiresAt = new Date(Date.now() + expiresInMs);

    await Session.deleteMany({ userId: admin._id, expiresAt: { $lt: new Date() } });

    const activeSessionCount = await Session.countDocuments({
        userId: admin._id, revoked: false, expiresAt: { $gt: new Date() }
    });
    if (activeSessionCount >= 3) {
        auditLog({ req, action: 'LOGIN_FAIL', detail: 'Too many sessions', status: 400 });
        return res.status(400).json({ error: 'Login from too many devices (Max 3)' });
    }

    const payload = { id: admin._id, role: admin.role };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: jwtExpiresIn });

    await Session.create({
        userId: admin._id, token, userAgent: req.headers['user-agent'], ip: req.ip, revoked: false, expiresAt
    });

    auditLog({ req, action: 'LOGIN', detail: 'Login success' });

    // ✅ 4. Set HttpOnly Cookie (ปลอดภัยจาก XSS)
    res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // ใช้ HTTPS ใน Prod
        sameSite: 'strict', // ป้องกัน CSRF
        maxAge: expiresInMs
    });

    res.json({
        message: 'Login successful',
        // ไม่ส่ง token กลับไปใน JSON แล้วเพื่อความปลอดภัย
        admin: {
            id: admin._id, username: admin.username, role: admin.role,
            email: admin.email, fullName: admin.fullName, avatarUrl: admin.avatarUrl
        }
    });
};

// --- Get Me ---
exports.getMe = async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const admin = await Admin.findById(req.user.id);
  if (!admin) return res.status(404).json({ error: 'User not found' });
  res.json({
    id: admin._id, username: admin.username, role: admin.role,
    email: admin.email, fullName: admin.fullName, avatarUrl: admin.avatarUrl,
  });
};

// --- Verify (Kiosk) ---
exports.verify = async (req, res) => {
    let { username, password } = req.body;
    
    // Decrypt Password ถ้า Kiosk ส่งแบบ Encrypted มา (เผื่อไว้)
    const decrypted = decryptData(password);
    if(decrypted) password = decrypted;

    try {
        const admin = await Admin.findOne({ username });
        if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
            auditLog({ req, action: 'KIOSK_UNLOCK_FAIL', detail: `Auth failed: ${username}`, status: 400 });
            return res.status(400).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }

        const allowedRoles = ['admin', 'staff'];
        const hasPermission = admin.role.some(r => allowedRoles.includes(r));
        if (!hasPermission) return res.status(403).json({ error: 'ไม่มีสิทธิ์ปลดล็อคเครื่อง' });

        auditLog({ req, action: 'KIOSK_UNLOCK', detail: `Unlocked by ${username}` });
        res.json({ success: true, message: 'Verified' });
    } catch (err) {
        res.status(500).json({ error: 'Server Error' });
    }
};

exports.googleLogin = async (req, res) => {
    const { token } = req.body;

    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.LOGIN_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { email, sub: googleId, picture } = payload;

        const admin = await Admin.findOne({ email });

        if (!admin) {
            auditLog({ req, action: 'GOOGLE_LOGIN_FAIL', detail: `Email not found: ${email}`, status: 401 });
            return res.status(401).json({ 
                error: 'ไม่พบอีเมลในระบบ', 
                message: 'กรุณาติดต่อผู้ดูแลระบบเพื่อสร้างบัญชีก่อนใช้งาน' 
            });
        }

        if (!admin.googleId) {
            admin.googleId = googleId;
            if (!admin.avatarUrl) admin.avatarUrl = picture;
            await admin.save();
            auditLog({ req, action: 'GOOGLE_BIND', detail: `Linked ${email} with Google` });
        }

        const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '4h';
        const expiresInMs = ms(jwtExpiresIn);
        const expiresAt = new Date(Date.now() + expiresInMs);

        await Session.deleteMany({ userId: admin._id, expiresAt: { $lt: new Date() } });

        const activeSessionCount = await Session.countDocuments({
            userId: admin._id, revoked: false, expiresAt: { $gt: new Date() }
        });
        if (activeSessionCount >= 3) {
             return res.status(400).json({ error: 'Login from too many devices (Max 3)' });
        }

        const jwtPayload = { id: admin._id, role: admin.role };
        const jwtToken = jwt.sign(jwtPayload, process.env.JWT_SECRET, { expiresIn: jwtExpiresIn });

        await Session.create({
            userId: admin._id, token: jwtToken, userAgent: req.headers['user-agent'], ip: req.ip, revoked: false, expiresAt
        });

        auditLog({ req, action: 'LOGIN_GOOGLE', detail: 'Login success via Google' });

        // ✅ Set Cookie
        res.cookie('token', jwtToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: expiresInMs
        });

        res.json({
            message: 'Login successful',
            admin: {
                id: admin._id, username: admin.username, role: admin.role,
                email: admin.email, fullName: admin.fullName, avatarUrl: admin.avatarUrl
            }
        });

    } catch (err) {
        console.error("Google Login Error:", err);
        res.status(400).json({ error: 'Google Login Failed', message: 'Token ไม่ถูกต้องหรือหมดอายุ' });
    }
};

// --- FORGOT PASSWORD SECTION (เหมือนเดิม) ---
exports.requestPasswordReset = async (req, res) => {
    try {
        const { username } = req.body;
        const admin = await Admin.findOne({ $or: [{ username }, { email: username }] });

        if (!admin) return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้งาน' });
        if (!admin.email) return res.status(400).json({ error: 'บัญชีนี้ยังไม่ได้ลงทะเบียนอีเมล' });

        const otp = generateOTP(); 
        const ref = generateRef(); 
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        admin.resetPasswordOtp = otp;
        admin.resetPasswordRef = ref;
        admin.resetPasswordExpires = expiresAt;
        await admin.save();

        const htmlContent = getOtpTemplate(otp, ref, admin.username, 'ลืมรหัสผ่าน');

        await sendMail(
            admin.email, 
            `🔑 รหัส OTP เปลี่ยนรหัสผ่าน (Ref: ${ref})`, 
            `OTP: ${otp} (Ref: ${ref})`,
            htmlContent
        );

        auditLog({ req, action: 'REQUEST_RESET_PWD', detail: `User: ${admin.username}` });
        res.json({ success: true, message: 'ส่ง OTP ไปยังอีเมลแล้ว', ref });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'ส่งอีเมลไม่สำเร็จ' });
    }
};

exports.resetPasswordWithOtp = async (req, res) => {
    try {
        let { username, otp, newPassword } = req.body;
        
        // ถ้ามีการส่ง password แบบ Encrypt ในหน้ารีเซต ก็ต้อง decrypt ตรงนี้ด้วย (เบื้องต้นปล่อยผ่านไว้ก่อน)
        // const decrypted = decryptData(newPassword);
        // if(decrypted) newPassword = decrypted;

        const admin = await Admin.findOne({ $or: [{ username }, { email: username }] });

        if (!admin) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

        if (!admin.resetPasswordOtp || admin.resetPasswordOtp !== otp) {
            return res.status(400).json({ error: 'รหัส OTP ไม่ถูกต้อง' });
        }
        if (admin.resetPasswordExpires < new Date()) {
            return res.status(400).json({ error: 'รหัส OTP หมดอายุ' });
        }

        admin.passwordHash = await bcrypt.hash(newPassword, Number(process.env.BCRYPT_SALT_ROUNDS) || 12);
        
        admin.resetPasswordOtp = undefined;
        admin.resetPasswordRef = undefined;
        admin.resetPasswordExpires = undefined;
        await admin.save();

        auditLog({ req, action: 'RESET_PWD_SUCCESS', detail: `User: ${admin.username}` });
        res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' });

    } catch (err) {
        res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
};
const Admin = require('../models/admin');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Session = require('../models/session');
const ApiLog = require('../models/apilog');
const auditLog = require('../helpers/auditLog');
const ms = require('ms');
const verifyTurnstile = require('../utils/verifyTurnstile'); // ตรวจสอบว่ามีไฟล์นี้แล้ว

exports.login = async (req, res) => {
    const { username, password, cfToken } = req.body;

    // 1. Human Verification (Turnstile)
    // ป้องกันบอทก่อนที่จะเริ่มเช็ค Database
    const isHuman = await verifyTurnstile(cfToken, req.ip);
    if (!isHuman) {
        auditLog({ req, action: 'LOGIN_BOT_BLOCK', detail: 'Turnstile verification failed', status: 400 });
        return res.status(400).json({ 
            error: 'Security Check Failed', 
            message: 'ระบบตรวจสอบพบความผิดปกติ (Turnstile Failed) กรุณาลองใหม่อีกครั้ง' 
        });
    }

    const admin = await Admin.findOne({ username });
    if (!admin) {
        auditLog({ req, action: 'LOGIN_FAIL', detail: 'User not found', status: 400 });
        return res.status(400).json({ error: 'User not found' });
    }
    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
        auditLog({ req, action: 'LOGIN_FAIL', detail: 'Invalid credentials', status: 400 });
        return res.status(400).json({ error: 'Invalid credentials' });
    }

    // --- Session Management ---
    const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '4h';
    const expiresInMs = ms(jwtExpiresIn);
    const expiresAt = new Date(Date.now() + expiresInMs);

    // เคลียร์ session เก่าที่หมดอายุ
    await Session.deleteMany({ userId: admin._id, expiresAt: { $lt: new Date() } });

    // จำกัดจำนวนเครื่องที่ล็อกอินพร้อมกัน (Optional)
    const activeSessionCount = await Session.countDocuments({
        userId: admin._id,
        revoked: false,
        expiresAt: { $gt: new Date() }
    });
    if (activeSessionCount >= 3) {
        auditLog({ req, action: 'LOGIN_FAIL', detail: 'Too many active sessions', status: 400 });
        return res.status(400).json({ error: 'Login from too many devices (Max 3)' });
    }

    // สร้าง Token
    const payload = { id: admin._id, role: admin.role };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: jwtExpiresIn });

    // บันทึก Session
    await Session.create({
        userId: admin._id,
        token,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        revoked: false,
        expiresAt
    });

    res.json({
        token,
        admin: {
            id: admin._id,
            username: admin.username,
            role: admin.role,
            email: admin.email,
            fullName: admin.fullName
        }
    });
    auditLog({ req, action: 'LOGIN', detail: 'Login success' });
};

exports.getMe = async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const admin = await Admin.findById(req.user.id);
  if (!admin) return res.status(404).json({ error: 'User not found' });

  res.json({
    id: admin._id,
    username: admin.username,
    role: admin.role,
    email: admin.email,
    fullName: admin.fullName,
    avartarUrl: admin.avatarUrl,
  });
};

// exports.login = async (req, res) => {
//     const {username, password} = req.body;
//     const admin = await Admin.findOne({username});
//     if (!admin) {
//     auditLog({ req, action: 'LOGIN_FAIL', detail: 'User not found', status: 400 });
//     return res.status(400).json({ error: 'User not found' });
//     }
//     const isMatch = await bcrypt.compare(password, admin.passwordHash);
//     if (!isMatch) {
//     auditLog({ req, action: 'LOGIN_FAIL', detail: 'Invalid credentials', status: 400 });
//     return res.status(400).json({ error: 'Invalid credentials' });
//     }

//     const payload = { id: admin._id, role: admin.role };
//     const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN});
//     await Session.create({
//         userId: admin._id,
//         token,
//         userAgent: req.headers['user-agent'],
//         ip: req.ip
//     });
//     res.json({
//         token,
//         admin: {
//             id: admin._id,
//             username: admin.username,
//             role: admin.role,
//             email: admin.email,
//             fullName: admin.fullName
//         }
//     });
//     auditLog({ req, action: 'LOGIN', detail: 'Login success' });
// };



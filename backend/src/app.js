const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser'); // ✅ 1. นำเข้า cookie-parser

// 1. นำเข้า Middleware และ Helpers
const rateLimit = require('express-rate-limit');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const auditLog = require('./helpers/auditLog');

// 2. นำเข้า Routes ต่างๆ
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const sessionRoutes = require('./routes/session');
const participantFieldRoutes = require('./routes/participantFields');
const participantRoutes = require('./routes/participants');
const registrationPointRoutes = require('./routes/registrationPoints');
const donationsRoutes = require('./routes/donationRoutes');
const systemSettingRoutes = require('./routes/systemSettingRoutes');
const packageRoutes = require('./routes/packageRoutes');
const dashboardRoutes = require('./routes/dashboard');

const app = express();

// Trust Proxy จำเป็นมากถ้าระบบของคุณรันอยู่หลัง Nginx หรือ Load Balancer เพื่อให้ Rate Limit อ่าน IP จริงได้
app.set('trust proxy', 1);

app.use(express.json());
app.use(cookieParser()); // ✅ 2. เปิดใช้งาน cookie-parser

// 3. ตั้งค่า CORS (Cross-Origin Resource Sharing)
const rawOrigin = process.env.CORS_ORIGIN;
let originOption;

if (rawOrigin === '*') {
  originOption = true; 
} else {
  originOption = rawOrigin.split(',').map(o => o.trim());
}

const corsOptions = {
  origin: originOption, 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // ✅ 3. ต้องเป็น true เพื่อให้อนุญาตการส่ง Cookie ข้ามโดเมนได้
};
app.use(cors(corsOptions));

// 4. ตั้งค่า Rate Limit ป้องกันการสแปม (Brute-force)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 นาที
  max: 3000, 
  standardHeaders: true, 
  legacyHeaders: false, 
  message: { error: "ยิง Request ถี่เกินไป กรุณารอสักครู่ (Too many requests)" }
});

// นำ apiLimiter ไปครอบทุก Route ที่ขึ้นต้นด้วย /api
app.use('/api', apiLimiter);

// 5. บันทึก Log การยิง Request เข้ามา
app.use(requestLogger);

// 6. เสิร์ฟไฟล์ Static (เช่น ไฟล์อัปโหลด)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 7. ลงทะเบียน API Endpoints (Routes)
app.use('/api/auth', authRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/participant-fields', participantFieldRoutes);
app.use('/api/participants', participantRoutes);
app.use('/api/registration-points', registrationPointRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/donations', donationsRoutes);

// เส้นทางตั้งค่าระบบและจัดการแพ็กเกจ
app.use('/api/settings', systemSettingRoutes);
app.use('/api/packages', packageRoutes);

// 8. จัดการ Error (Global Error Handler) ต้องอยู่ล่างสุดเสมอ!
app.use((err, req, res, next) => {
  auditLog({
    req,
    action: 'ERROR',
    detail: '',
    status: err.statusCode || 500,
    error: err.stack || String(err)
  }).catch(console.error); 

  errorHandler(err, req, res, next);
});

module.exports = app;
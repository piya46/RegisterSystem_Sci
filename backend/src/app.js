const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const sessionRoutes = require('./routes/session');
const requestLogger = require('./middleware/requestLogger');
const auditLog = require('./helpers/auditLog');
const participantFieldRoutes = require('./routes/participantFields');
const participantRoutes = require('./routes/participants');
const registrationPointRoutes = require('./routes/registrationPoints');
const donationsRoutes = require('./routes/donationRoutes')
const path = require('path');
const rateLimit = require('express-rate-limit'); 

const app = express();

// 1. Trust Proxy: จำเป็นสำหรับ Production ที่อยู่หลัง Load Balancer/Proxy
app.set('trust proxy', 1);

app.use(express.json());

// --- [เริ่มส่วนที่แก้ไข] จัดการ CORS ให้รองรับหลาย Domain ---
const rawOrigin = process.env.CORS_ORIGIN || '*';
let originOption;

if (rawOrigin === '*') {
  originOption = true; // อนุญาตทั้งหมด (หรือจะใช้ '*' ก็ได้)
} else {
  // ถ้ามีเครื่องหมายจุลภาค (,) ให้แยกเป็น Array
  originOption = rawOrigin.split(',').map(o => o.trim());
}

const corsOptions = {
  origin: originOption, 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // แนะนำให้เปิดเพื่อรองรับ Cookie/Auth Header ข้ามโดเมน
};
app.use(cors(corsOptions));
// --- [จบส่วนที่แก้ไข] ---

// 3. Rate Limiting: จำกัดการยิง API
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 300, 
  standardHeaders: true, 
  legacyHeaders: false, 
  message: "Too many requests from this IP, please try again after 15 minutes"
});
app.use(limiter);

app.use(requestLogger);

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/participant-fields', participantFieldRoutes);
app.use('/api/participants', participantRoutes);
app.use('/api/registration-points', registrationPointRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/donations', donationsRoutes);

app.use((err, req, res, next) => {
  auditLog({
    req,
    action: 'ERROR',
    detail: '',
    status: 500,
    error: err.stack || String(err)
  });
  console.error(err.stack); 
  res.status(500).json({ error: 'Internal Server Error' });
});

module.exports = app;
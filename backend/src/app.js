const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const rateLimit = require('express-rate-limit');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const auditLog = require('./helpers/auditLog');
const { csrfProtection } = require('./utils/csrf');

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
// [เพิ่ม] Routes ใหม่
const prizeRoutes = require('./routes/prizes');
const publicRoutes = require('./routes/public');

const app = express();
app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const rawOrigin = process.env.CORS_ORIGIN;
const devOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://[::1]:5173'
];
const defaultOrigins = devOrigins;
const allowedOrigins = rawOrigin
  ? rawOrigin.split(',').map(o => o.trim()).filter(Boolean)
  : defaultOrigins;
const allowAnyOrigin = rawOrigin === '*' && process.env.NODE_ENV !== 'production';
const effectiveAllowedOrigins = process.env.NODE_ENV === 'production'
  ? allowedOrigins
  : [...new Set([...allowedOrigins, ...devOrigins])];

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowAnyOrigin || effectiveAllowedOrigins.includes(origin)) return cb(null, true);
    const error = new Error('Not allowed by CORS');
    error.statusCode = 403;
    return cb(error);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  credentials: true
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'พยายามเข้าสู่ระบบถี่เกินไป กรุณารอสักครู่' }
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'ขอรหัสยืนยันถี่เกินไป กรุณารอสักครู่' }
});

const publicWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'ส่งข้อมูลถี่เกินไป กรุณารอสักครู่' }
});

const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'เรียกดูข้อมูลถี่เกินไป กรุณารอสักครู่' }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "ยิง Request ถี่เกินไป กรุณารอสักครู่" }
});
app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/google-login', authLimiter);
app.use('/api/auth/verify', authLimiter);
app.use('/api/auth/forgot-password', resetLimiter);
app.use('/api/auth/reset-password-otp', resetLimiter);
app.use('/api/participants/resend-ticket', publicWriteLimiter);
app.use('/api/donations', (req, res, next) => (
  req.method === 'POST' ? publicWriteLimiter(req, res, next) : next()
));
app.use('/api/public', publicReadLimiter);
app.use('/api', csrfProtection);
app.use(requestLogger);
app.use('/uploads/avatars', express.static(path.join(__dirname, 'uploads', 'avatars'), {
  dotfiles: 'deny',
  index: false,
  maxAge: '1h',
  setHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}));

app.use('/api/auth', authRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/participant-fields', participantFieldRoutes);
app.use('/api/participants', participantRoutes);
app.use('/api/registration-points', registrationPointRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/donations', donationsRoutes);
app.use('/api/settings', systemSettingRoutes);
app.use('/api/packages', packageRoutes);
// [เพิ่ม] ลงทะเบียน Route ใหม่
app.use('/api/prizes', prizeRoutes);
app.use('/api/public', publicRoutes);

app.use((err, req, res, next) => {
  auditLog({ req, action: 'ERROR', detail: '', status: err.statusCode || 500, error: err.stack || String(err) });
  errorHandler(err, req, res, next);
});

module.exports = app;

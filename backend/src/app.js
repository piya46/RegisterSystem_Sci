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
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');

const app = express();

app.set('trust proxy', 1);

// ✅ Security Headers: Config ให้รองรับ Google Login Popup
app.use(helmet({
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }, 
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }    
}));

// CSP: อนุญาต script จาก Google และ Cloudflare
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com", "https://accounts.google.com"],
    frameSrc: ["https://challenges.cloudflare.com", "https://accounts.google.com"],
    imgSrc: ["'self'", "data:", "https://*.googleusercontent.com", "https://lh3.googleusercontent.com"], 
    connectSrc: ["'self'", "https://accounts.google.com", "https://challenges.cloudflare.com"],
  },
}));

app.use(express.json());
app.use(cookieParser()); // ✅ อ่าน Cookies
app.use(mongoSanitize()); // กัน NoSQL Injection
app.use(hpp()); // กัน HTTP Parameter Pollution

const rawOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
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
  credentials: true // ✅ อนุญาตให้รับ-ส่ง Cookies ข้าม Domain/Port
};
app.use(cors(corsOptions));

// 1. Global Rate Limiter (ทั่วไป)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 1000, 
  standardHeaders: true, 
  legacyHeaders: false, 
});
app.use(globalLimiter);

// 2. Auth Rate Limiter (เข้มงวดสำหรับการ Login)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20, 
    message: { error: "Too many login attempts, please try again later" }
});

app.use(requestLogger);

// Apply Auth Limiter เฉพาะ Login Route
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/google-login', authLimiter);

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
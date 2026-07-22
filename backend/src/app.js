const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const lineRoutes = require('./routes/lineRoutes');

const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const auditLog = require('./helpers/auditLog');
const { csrfProtection } = require('./utils/csrf');
const { publicReadiness } = require('./utils/systemHealth');
const { configureFrontendHosting } = require('./utils/frontendHosting');
const { resolveTrustProxy } = require('./utils/trustProxy');

const authRoutes = require('./routes/auth');
const participantAuthRoutes = require('./routes/participantAuthRoutes');
const adminRoutes = require('./routes/admin');
const sessionRoutes = require('./routes/session');
const participantFieldRoutes = require('./routes/participantFields');
const participantRoutes = require('./routes/participants');
const registrationPointRoutes = require('./routes/registrationPoints');
const donationsRoutes = require('./routes/donationRoutes');
const systemSettingRoutes = require('./routes/systemSettingRoutes');
const eventRoutes = require('./routes/events');
const packageRoutes = require('./routes/packageRoutes');
const dashboardRoutes = require('./routes/dashboard');
const prizeRoutes = require('./routes/prizes');
const publicRoutes = require('./routes/public');
const walletRoutes = require('./routes/wallets');
const uploadRoutes = require('./routes/uploadRoutes');
const receiptRoutes = require('./routes/receiptRoutes');

const app = express();
app.set('trust proxy', resolveTrustProxy());

const isProduction = process.env.NODE_ENV === 'production';
const scriptSrc = ["'self'", 'https://challenges.cloudflare.com', 'https://accounts.google.com'];
if (!isProduction) scriptSrc.push("'unsafe-inline'", "'unsafe-eval'");
const connectSrc = isProduction ? ["'self'", 'https:', 'wss:'] : ["'self'", 'https:', 'http:', 'ws:', 'wss:'];
const imgSrc = isProduction ? ["'self'", 'data:', 'https:'] : ["'self'", 'data:', 'https:', 'http:'];

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc,
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", 'https://accounts.google.com'],
      imgSrc,
      connectSrc,
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'", 'https://challenges.cloudflare.com', 'https://accounts.google.com'],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: 'no-referrer' },
  xssFilter: true
}));
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    if (req.originalUrl === '/api/line/webhook') {
      req.rawBody = Buffer.from(buf);
    }
  }
}));
app.use(cookieParser());

app.get('/health/live', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    status: 'ok',
    release: process.env.RELEASE_ID || null,
    timestamp: new Date().toISOString(),
  });
});
app.get('/health/ready', (req, res) => {
  const readiness = publicReadiness();
  res.setHeader('Cache-Control', 'no-store');
  res.status(readiness.ready ? 200 : 503).json(readiness);
});

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-CF-Token', 'Idempotency-Key', 'X-Guest-Token'],
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
app.use('/api/participant-auth/line/login', authLimiter);
app.use('/api/participant-auth/line/start', authLimiter);
app.use('/api/participant-auth/line/link/start', authLimiter);
app.use('/api/participant-auth/liff/verify', authLimiter);
app.use('/api/auth/forgot-password', resetLimiter);
app.use('/api/auth/reset-password-otp', resetLimiter);
app.use('/api/participant-auth/email/request-otp', resetLimiter);
app.use('/api/participant-auth/email/verify-otp', resetLimiter);
app.use('/api/participants/public', publicWriteLimiter);
app.use('/api/participants/resend-ticket', resetLimiter);
app.use('/api/public/events/:slug/reuse/request-otp', resetLimiter);
app.use('/api/public/events/:slug/reuse/confirm', resetLimiter);
app.use('/api/donations', (req, res, next) => (
  req.method === 'POST' ? publicWriteLimiter(req, res, next) : next()
));
app.use('/api/public', publicReadLimiter);

// Webhooks and LINE integrations should be before CSRF
app.use('/api/line', lineRoutes);

app.use('/api', csrfProtection);
app.use(requestLogger);
const usingGcsObjectStorage = String(process.env.OBJECT_STORAGE_PROVIDER || 'local').toLowerCase() === 'gcs';
const legacyUploadsPublic = process.env.LEGACY_UPLOADS_PUBLIC_ENABLED === undefined
  ? (!isProduction || !usingGcsObjectStorage)
  : process.env.LEGACY_UPLOADS_PUBLIC_ENABLED === 'true';
if (legacyUploadsPublic) {
  app.use('/uploads/avatars', express.static(path.join(__dirname, 'uploads', 'avatars'), {
    dotfiles: 'deny',
    index: false,
    maxAge: '1h',
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }));
  app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
    dotfiles: 'deny',
    index: false,
    maxAge: '1h',
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }));
}

app.use('/api/auth', authRoutes);
app.use('/api/participant-auth', participantAuthRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/participant-fields', participantFieldRoutes);
app.use('/api/participants', participantRoutes);
app.use('/api/registration-points', registrationPointRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/donations', donationsRoutes);
const paymentLimiter = rateLimit({
  windowMs: 3 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'ทำรายการถี่เกินไป กรุณารอ 3 วินาที' }
});

app.use('/api/settings', systemSettingRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/prizes', prizeRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/wallets/pay', paymentLimiter);
app.use('/api/wallets', walletRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/receipts', receiptRoutes);

configureFrontendHosting(app);

app.use((err, req, res, next) => {
  auditLog({
    req,
    action: 'ERROR',
    detail: '',
    status: err.statusCode || 500,
    error: process.env.NODE_ENV === 'development' ? (err.stack || String(err)) : (err.message || String(err))
  });
  errorHandler(err, req, res, next);
});

module.exports = app;

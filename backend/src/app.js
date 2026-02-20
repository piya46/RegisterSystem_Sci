const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');

const rateLimit = require('express-rate-limit');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const auditLog = require('./helpers/auditLog');

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

app.use(express.json());
app.use(cookieParser()); 

const rawOrigin = process.env.CORS_ORIGIN;
let originOption = rawOrigin === '*' ? true : rawOrigin.split(',').map(o => o.trim());

app.use(cors({
  origin: originOption, 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true 
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 3000, 
  standardHeaders: true, 
  legacyHeaders: false, 
  message: { error: "ยิง Request ถี่เกินไป กรุณารอสักครู่" }
});
app.use('/api', apiLimiter);
app.use(requestLogger);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
  auditLog({ req, action: 'ERROR', detail: '', status: err.statusCode || 500, error: err.stack || String(err) }).catch(console.error); 
  errorHandler(err, req, res, next);
});

module.exports = app;
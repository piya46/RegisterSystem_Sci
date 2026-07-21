const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const auth = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const uploadController = require('../controllers/uploadController');
const verifyTurnstile = require('../utils/verifyTurnstile');

const router = express.Router();
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) return cb(null, true);
    const error = new Error('รองรับเฉพาะไฟล์รูปภาพ JPEG, PNG, GIF หรือ WebP');
    error.statusCode = 400;
    return cb(error);
  },
});

const publicUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'อัปโหลดถี่เกินไป กรุณารอสักครู่' },
});

const publicFileLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'เรียกดูไฟล์ถี่เกินไป กรุณารอสักครู่' },
});

async function requirePublicUploadTurnstile(req, res, next) {
  try {
    const token = req.get('x-cf-token');
    const isHuman = await verifyTurnstile(token, req.ip, { expectedAction: 'public_slip_upload' });
    if (!isHuman && process.env.NODE_ENV === 'production') {
      return res.status(400).json({ error: 'ไม่ผ่านการตรวจสอบความปลอดภัย กรุณาลองใหม่อีกครั้ง' });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

router.get('/public/files/:publicId', publicFileLimiter, uploadController.publicFile);
router.get('/local/files/:publicId', publicFileLimiter, uploadController.localSignedFile);
router.post('/access', auth, requirePermission('event:read'), uploadController.privateAccess);
router.get('/status', auth, requirePermission('infra:manage'), uploadController.storageStatus);
router.post(
  '/slips',
  auth,
  requirePermission('event:manage'),
  upload.single('file'),
  uploadController.uploadAdminSlip
);
router.post(
  '/',
  auth,
  requirePermission('event:manage'),
  upload.single('file'),
  uploadController.uploadEventMedia
);
router.post(
  '/public',
  publicUploadLimiter,
  requirePublicUploadTurnstile,
  upload.single('file'),
  uploadController.uploadPublicSlip
);

module.exports = router;

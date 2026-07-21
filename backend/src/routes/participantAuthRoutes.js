const express = require('express');
const rateLimit = require('express-rate-limit');
const participantAuth = require('../middleware/participantAuth');
const participantAuthController = require('../controllers/participantAuthController');
const lineAuthController = require('../controllers/lineAuthController');

const router = express.Router();

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'ขอรหัสยืนยันถี่เกินไป กรุณารอสักครู่' },
});

router.get('/providers', participantAuthController.providers);
router.post('/email/request-otp', otpLimiter, participantAuthController.requestEmailOtp);
router.post('/email/verify-otp', otpLimiter, participantAuthController.verifyEmailOtp);
router.post('/line/start', lineAuthController.startLineLogin);
router.post('/line/link/start', participantAuth, lineAuthController.startLineLink);
router.post('/line/login', lineAuthController.lineLogin);
router.post('/liff/verify', lineAuthController.lineLogin);
router.post('/line/link', participantAuth, lineAuthController.linkLineAccount);
router.post('/line/unlink', participantAuth, lineAuthController.unlinkLineAccount);
router.get('/me', participantAuth, participantAuthController.me);
router.post('/refresh', participantAuth, participantAuthController.refresh);
router.post('/switch-event', participantAuth, participantAuthController.switchEvent);
router.get('/sessions', participantAuth, participantAuthController.listSessions);
router.post('/sessions/:id/revoke', participantAuth, participantAuthController.revokeSession);
router.post('/step-up/request-otp', otpLimiter, participantAuth, participantAuthController.requestStepUpOtp);
router.post('/step-up/verify-otp', otpLimiter, participantAuth, participantAuthController.verifyStepUpOtp);
router.post('/logout', participantAuth, participantAuthController.logout);
router.post('/logout-all', participantAuth, participantAuthController.logoutAll);

module.exports = router;

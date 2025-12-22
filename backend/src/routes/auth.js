const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authController = require('../controllers/authController');

// POST /api/auth/login
router.post('/login', authController.login);
router.post('/google-login', authController.googleLogin);
router.get('/me', auth, authController.getMe);

router.post('/verify', authController.verify);
router.post('/forgot-password', authController.requestPasswordReset);     // ขอ OTP
router.post('/reset-password-otp', authController.resetPasswordWithOtp);

module.exports = router;

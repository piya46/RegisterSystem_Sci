// backend/src/routes/public.js
const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const auth = require('../middleware/auth');

router.get('/report', publicController.getPublicReport);
router.get('/dashboard', publicController.getPublicDashboardStats);
router.post('/kiosk-token', auth, publicController.generateKioskToken);

// 🌟 Routes สำหรับ Self-Registration (Mobile)
router.post('/self-register-link', auth, publicController.generateSelfRegisterLink);
router.post('/request-short-session', publicController.requestShortSession); 

module.exports = router;
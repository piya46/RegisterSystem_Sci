// backend/src/routes/public.js
const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const auth = require('../middleware/auth');
const requireStaffOrAdmin = require('../middleware/requireStaffOrAdmin');
const prizeController = require('../controllers/prizeController');

router.get('/report', publicController.getPublicReport);
router.get('/dashboard', publicController.getPublicDashboardStats);
router.post('/kiosk-token', auth, requireStaffOrAdmin, publicController.generateKioskToken);

// 🌟 Routes สำหรับ Self-Registration (Mobile)
router.post('/self-register-link', auth, requireStaffOrAdmin, publicController.generateSelfRegisterLink);
router.post('/request-short-session', publicController.requestShortSession);

// 🌟 Public Prizes (For Public Lucky Draw Screen)
router.get('/prizes', prizeController.listPublicPrizes);


module.exports = router;

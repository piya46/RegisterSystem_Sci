// backend/src/routes/public.js
const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const auth = require('../middleware/auth');

// Public Link Report (No Auth)
router.get('/report', publicController.getPublicReport);

// 🌟 [เพิ่มใหม่] สถิติสำหรับหน้า Live Dashboard (No Auth)
router.get('/dashboard', publicController.getPublicDashboardStats);

// Kiosk Token Generation (Require Auth)
router.post('/kiosk-token', auth, publicController.generateKioskToken);

module.exports = router;
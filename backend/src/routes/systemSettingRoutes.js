const express = require('express');
const router = express.Router();
const systemSettingController = require('../controllers/systemSettingController');
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const requirePermission = require('../middleware/requirePermission');
const sqlMirrorController = require('../controllers/sqlMirrorController');

// Public - ไว้ให้ฝั่งหน้าเว็บเช็คสถานะการเปิด-ปิดได้
router.get('/', systemSettingController.getSettings);
router.get('/event-years', systemSettingController.getEventYears);

// Admin Only
router.get('/sql-mirror/status', auth, requirePermission('infra:manage'), sqlMirrorController.getStatus);
router.get('/sql-mirror/dead-letters', auth, requirePermission('infra:manage'), sqlMirrorController.listDeadLetters);
router.put('/', auth, requireAdmin, systemSettingController.updateSettings);

module.exports = router;

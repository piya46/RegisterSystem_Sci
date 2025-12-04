const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const ctrl = require('../controllers/registrationPointController');

// ดึงทั้งหมด (Admin เท่านั้น)
router.get('/', auth, ctrl.listAll);

// ดึงเฉพาะ enabled (Public หรือ kiosk)
router.get('/enabled', ctrl.listEnabled);

// เพิ่มจุด (Admin เท่านั้น)
router.post('/', auth, requireAdmin, ctrl.create);

// แก้ไขจุด (Admin เท่านั้น)
router.put('/:id', auth, requireAdmin, ctrl.update);

// ปิดใช้งานจุด (soft delete) (Admin เท่านั้น)
router.delete('/:id', auth, requireAdmin, ctrl.softDelete);

module.exports = router;

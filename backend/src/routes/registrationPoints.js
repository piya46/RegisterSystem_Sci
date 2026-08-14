const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const requireStaffOrAdmin = require('../middleware/requireStaffOrAdmin');
const ctrl = require('../controllers/registrationPointController');

// ดึงทั้งหมด (Staff/Admin เท่านั้น)
router.get('/', auth, requireStaffOrAdmin, ctrl.listAll);

// ดึงเฉพาะ enabled (Public หรือ kiosk)
router.get('/enabled', ctrl.listEnabled);

// เพิ่มจุดใน event scope
router.post('/', auth, requirePermission('event:manage'), ctrl.create);

// แก้ไขจุดใน event scope
router.put('/:id', auth, requirePermission('event:manage'), ctrl.update);

// ปิดใช้งานจุด (soft delete) ใน event scope
router.delete('/:id', auth, requirePermission('event:manage'), ctrl.softDelete);

module.exports = router;

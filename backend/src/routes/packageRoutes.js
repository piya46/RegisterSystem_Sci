const express = require('express');
const router = express.Router();
const packageController = require('../controllers/packageController');
const auth = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');

// Public - สำหรับดึงแพ็กเกจไปแสดงหน้าเว็บ
router.get('/', packageController.getAllPackages);

// Admin Only
router.post('/', auth, requirePermission('event:manage'), packageController.createPackage);
router.put('/:id', auth, requirePermission('event:manage'), packageController.updatePackage);
router.delete('/:id', auth, requirePermission('event:manage'), packageController.deletePackage);

module.exports = router;

const express = require('express');
const router = express.Router();
const packageController = require('../controllers/packageController');
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');

// Public - สำหรับดึงแพ็กเกจไปแสดงหน้าเว็บ
router.get('/', packageController.getAllPackages);

// Admin Only
router.post('/', auth, requireAdmin, packageController.createPackage);
router.put('/:id', auth, requireAdmin, packageController.updatePackage);
router.delete('/:id', auth, requireAdmin, packageController.deletePackage);

module.exports = router;
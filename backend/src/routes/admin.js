const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const adminController = require('../controllers/adminController');
const uploadAvatar = require("../utils/upload");

// CRUD เจ้าหน้าที่ (Admin เท่านั้น)
router.post('/', auth, requireAdmin, adminController.createAdmin);
router.get('/', auth, requireAdmin, adminController.listAdmins);
router.delete('/:id', auth, requireAdmin, adminController.deleteAdmin);
router.put('/:id', auth, requireAdmin, adminController.updateAdmin);
router.post('/reset-password', auth, requireAdmin, adminController.resetPassword);
router.post('/change-password', auth, adminController.changePassword);
router.post("/upload-avatar", auth, uploadAvatar.single("avatar"), adminController.uploadAvatar);


module.exports = router;
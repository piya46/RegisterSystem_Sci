const express = require('express');
const router = express.Router();
const donationController = require('../controllers/donationController');
const auth = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const requirePermission = require('../middleware/requirePermission');

// บันทึกการบริจาค (Public)
router.post('/', optionalAuth, donationController.createDonation);

// ดูข้อมูลสรุปสำหรับ Admin
router.get('/summary', auth, requirePermission('event:read'), donationController.getDonationSummary);

// [เพิ่มใหม่] จัดการ (แก้ไข/ลบ) ข้อมูลโดย Admin
router.put('/:id', auth, requirePermission('event:manage'), donationController.updateDonation);
router.delete('/:id', auth, requirePermission('event:manage'), donationController.deleteDonation);

module.exports = router;

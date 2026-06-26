const express = require('express');
const router = express.Router();
const donationController = require('../controllers/donationController');
const auth = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const requireAdmin = require('../middleware/requireAdmin'); 

// บันทึกการบริจาค (Public)
router.post('/', optionalAuth, donationController.createDonation);

// ดูข้อมูลสรุปสำหรับ Admin
router.get('/summary', auth, requireAdmin, donationController.getDonationSummary);

// [เพิ่มใหม่] จัดการ (แก้ไข/ลบ) ข้อมูลโดย Admin
router.put('/:id', auth, requireAdmin, donationController.updateDonation);
router.delete('/:id', auth, requireAdmin, donationController.deleteDonation);

module.exports = router;

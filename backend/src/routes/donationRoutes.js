const express = require('express');
const router = express.Router();
const donationController = require('../controllers/donationController');


router.post('/create', donationController.createDonation);

// GET: /api/donations/summary -> สำหรับดูสรุปยอด (ควรมี Middleware เช็ค Admin ก่อนถ้าจำเป็น)
router.get('/summary', donationController.getDonationSummary);

module.exports = router;
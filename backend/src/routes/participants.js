const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const requireKioskOrStaff = require('../middleware/requireKioskOrStaff');
const participantController = require('../controllers/participantController');

// 1. ลงทะเบียนล่วงหน้า (public ไม่ต้องล็อกอิน)
router.post('/public', participantController.createParticipant);

// 2. ลงทะเบียน onsite (staff, kiosk เท่านั้น)
router.post('/register-onsite', auth, requireKioskOrStaff, participantController.createParticipantByStaff);

// 3. ตรวจสอบ/ค้นหา/รายงาน (admin เท่านั้น)
router.get('/', auth, requireAdmin, participantController.listParticipants);
router.get('/search', auth, requireAdmin, participantController.searchParticipants);
router.put('/:id', auth, requireAdmin, participantController.updateParticipant);
router.delete('/:id', auth, requireAdmin, participantController.deleteParticipant);

// 4. check-in (staff, kiosk เท่านั้น)
router.post('/checkin-by-qr', auth, requireKioskOrStaff, participantController.checkinByQr);

// 5. resend ticket (public ทุกคน)
router.post('/resend-ticket', participantController.resendTicket);

router.get('/export', auth, participantController.exportParticipants);

module.exports = router;

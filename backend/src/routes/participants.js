const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const requireKioskOrStaff = require('../middleware/requireKioskOrStaff');
const requireStaffOrAdmin = require('../middleware/requireStaffOrAdmin');
const requireRegistrationActor = require('../middleware/requireRegistrationActor');
const participantController = require('../controllers/participantController');
const { getReportData } = require('../services/reportService');
const { generatePDF } = require('../utils/pdfGenerator');
const { serverError } = require('../utils/httpResponses');
const { eventYearOrCurrentFromRequest } = require('../utils/eventYear');
const { auditSensitiveAccess } = require('../helpers/sensitiveAuditLog');

// 1. ลงทะเบียนล่วงหน้า (public ไม่ต้องล็อกอิน)
router.post('/public', participantController.createParticipant);

// 2. ลงทะเบียน onsite (staff, kiosk เท่านั้น)
router.post('/register-onsite', auth, requireRegistrationActor, participantController.createParticipantByStaff);

// 3. ตรวจสอบ/ค้นหา/รายงาน (admin เท่านั้น)
router.get('/', auth, requireAdmin, participantController.listParticipants);
router.get('/search', auth, requireStaffOrAdmin, participantController.searchParticipants);
router.put('/restore-prize/:id', auth, requireAdmin, participantController.restorePrizeRight);
router.put('/:id', auth, requireAdmin, participantController.updateParticipant);
router.delete('/:id', auth, requireAdmin, participantController.deleteParticipant);

// 4. check-in (staff, kiosk เท่านั้น)
router.post('/checkin-by-qr', auth, requireKioskOrStaff, participantController.checkinByQr);

// 5. resend ticket (public ทุกคน)
router.post('/resend-ticket', participantController.resendTicket);

router.get('/export', auth, requireAdmin, participantController.exportParticipants);

router.get('/download-report-pdf', auth, requireAdmin, async (req, res) => {
  try {
    const eventYear = await eventYearOrCurrentFromRequest(req);
    const data = await getReportData(eventYear);
    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_EXPORT_REPORT_PDF',
      purpose: 'admin_pdf_report',
      resource: 'participants,donations',
      eventYear,
      recordCount: data.count || 0,
      fields: ['participant.fields', 'participant.specialAssistance', 'donation.name', 'donation.amount'],
      extra: { format: 'pdf' },
    });
    const pdfBuffer = await generatePDF(data, req.user.username);
    
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=Report_Manual_${Date.now()}.pdf`
    });
    res.send(pdfBuffer);
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;

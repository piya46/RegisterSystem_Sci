const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const requireKioskOrStaff = require('../middleware/requireKioskOrStaff');
const requireStaffOrAdmin = require('../middleware/requireStaffOrAdmin');
const requireRegistrationActor = require('../middleware/requireRegistrationActor');
const participantController = require('../controllers/participantController');
const { getReportData } = require('../services/reportService');
const { generatePDF } = require('../utils/pdfGenerator');
const { serverError } = require('../utils/httpResponses');
const { eventScopeFromRequest } = require('../utils/eventYear');
const { auditSensitiveAccess } = require('../helpers/sensitiveAuditLog');

// 1. ลงทะเบียนล่วงหน้า (public ไม่ต้องล็อกอิน)
router.post('/public', participantController.createParticipant);

// 2. ลงทะเบียน onsite (staff, kiosk เท่านั้น)
router.post('/register-onsite', auth, requireRegistrationActor, participantController.createParticipantByStaff);

// 3. ตรวจสอบ/ค้นหา/รายงาน ตามสิทธิ์ระดับกิจกรรม
router.get('/', auth, requirePermission('participant:manage'), participantController.listParticipants);
router.get('/search', auth, requireStaffOrAdmin, participantController.searchParticipants);
router.put('/restore-prize/:id', auth, requirePermission('participant:manage'), participantController.restorePrizeRight);
router.put('/:id', auth, requirePermission('participant:manage'), participantController.updateParticipant);
router.delete('/:id', auth, requirePermission('participant:manage'), participantController.deleteParticipant);

// 4. check-in (staff, kiosk เท่านั้น)
router.post('/checkin-by-qr', auth, requireKioskOrStaff, participantController.checkinByQr);

// 5. resend ticket (public ทุกคน)
router.post('/resend-ticket', participantController.resendTicket);
router.post('/:id/resend-ticket', auth, requirePermission('participant:manage'), participantController.resendTicketByStaff);

router.get('/export', auth, requirePermission('participant:export'), participantController.exportParticipants);

router.get('/download-report-pdf', auth, requirePermission('participant:export'), async (req, res) => {
  let eventYear = null;
  try {
    const eventScope = await eventScopeFromRequest(req, { isDeleted: false }, { requireEventIdentity: true });
    eventYear = eventScope.eventYear;
    const data = await getReportData(eventYear, eventScope.eventId);
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
      'Content-Disposition': `attachment; filename=Report_Manual_${Date.now()}.pdf`,
      'X-Total-Count': data.count || 0,
      'X-Export-Status': 'completed'
    });
    res.send(pdfBuffer);
  } catch (err) {
    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_EXPORT_REPORT_PDF_FAIL',
      purpose: 'admin_pdf_report',
      resource: 'participants,donations',
      eventYear,
      recordCount: 0,
      fields: ['participant.fields', 'participant.specialAssistance', 'donation.name', 'donation.amount'],
      status: err.statusCode || 500,
      error: err.message,
      extra: { format: 'pdf' },
    });
    serverError(res, err);
  }
});

module.exports = router;

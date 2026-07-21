// backend/src/routes/public.js
const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const auth = require('../middleware/auth');
const requireStaffOrAdmin = require('../middleware/requireStaffOrAdmin');
const prizeController = require('../controllers/prizeController');
const eventController = require('../controllers/eventController');

router.get('/events/current', eventController.getPublicCurrentEvent);
router.get('/events/by-id/:eventId', eventController.getPublicEventById);
router.get('/events/:slug', eventController.getPublicEventBySlug);
router.post('/events/:slug/reuse/request-otp', publicController.requestRegistrationReuseOtp);
router.post('/events/:slug/reuse/confirm', publicController.confirmRegistrationReuseOtp);
router.get('/report', publicController.getPublicReport);
router.get('/dashboard', publicController.getPublicDashboardStats);
router.post('/kiosk-token', auth, requireStaffOrAdmin, publicController.generateKioskToken);
router.post('/kiosk-token/verify', publicController.verifyKioskToken);

// 🌟 Routes สำหรับ Self-Registration (Mobile)
router.post('/self-register-link', auth, requireStaffOrAdmin, publicController.generateSelfRegisterLink);
router.post('/request-short-session', publicController.requestShortSession);

// 🌟 Public Prizes (For Public Lucky Draw Screen)
router.get('/prizes', prizeController.listPublicPrizes);

// Public certificate APIs accept the opaque token in the body so it is not exposed in proxy URLs.
router.post('/certificates/verify', publicController.verifyCertificate);
router.post('/certificates/payload', publicController.getCertificatePayload);

// Transitional read-only routes. Raw Mongo participant IDs are rejected unless the legacy flag is enabled.
router.get('/verify/:verificationId', publicController.verifyCertificate);
router.get('/certificate/:verificationId', publicController.getCertificatePayload);


module.exports = router;

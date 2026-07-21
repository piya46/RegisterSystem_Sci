const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const participantAuth = require('../middleware/participantAuth');

// Balance can be checked by either a participant Bearer token or an x-guest-token.
router.get('/balance', walletController.getWalletBalance);
router.post('/guest-token', participantAuth, walletController.createGuestToken);
router.get('/vendor-quote', walletController.getVendorQuote);
router.get('/payment-status/:idempotencyKey', walletController.getPaymentStatus);
router.post('/pay', walletController.payToVendor); // Authorization handled inside based on participant or guestToken

module.exports = router;

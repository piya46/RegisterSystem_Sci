const express = require('express');
const router = express.Router();
const lineController = require('../controllers/lineController');
const lineAuthController = require('../controllers/lineAuthController');
const participantAuth = require('../middleware/participantAuth');

router.post('/login', lineController.lineLogin);
router.post('/link', participantAuth, lineAuthController.linkLineAccount);
router.post('/unlink', participantAuth, lineAuthController.unlinkLineAccount);
router.post('/webhook', lineController.lineWebhook);

module.exports = router;

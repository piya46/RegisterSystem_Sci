const express = require('express');
const router = express.Router();
const receiptController = require('../controllers/receiptController');
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');

router.post('/generate', auth, requireAdmin, receiptController.generateReceipt);

module.exports = router;

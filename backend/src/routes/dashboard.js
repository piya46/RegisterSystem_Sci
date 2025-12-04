const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const dashboardController = require('../controllers/dashboardController');

router.get('/summary', auth, requireAdmin, dashboardController.getDashboardSummary);

module.exports = router;

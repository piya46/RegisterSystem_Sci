const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const dashboardController = require('../controllers/dashboardController');

router.get('/summary', auth, requirePermission('event:read'), dashboardController.getDashboardSummary);

module.exports = router;

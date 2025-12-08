const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authController = require('../controllers/authController');

// POST /api/auth/login
router.post('/login', authController.login);
router.get('/me', auth, authController.getMe);

router.post('/verify', authController.verify);

module.exports = router;

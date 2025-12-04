const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');

router.get('/', auth, requireAdmin, sessionController.listSessions);
router.get('/:userId', auth, requireAdmin, sessionController.getSessionByUserId);
router.delete('/token/:token', auth, requireAdmin, sessionController.deleteSessionByToken);
router.delete('/user/:userId', auth, requireAdmin, sessionController.deleteSessionByUserId);
router.post('/logout', auth, sessionController.logout);

module.exports = router;

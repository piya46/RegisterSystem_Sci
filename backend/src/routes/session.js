const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');

router.get('/', auth, requireAdmin, sessionController.listSessions);
router.get('/:userId', auth, requireAdmin, sessionController.getSessionByUserId);
router.delete('/user/:userId', auth, requireAdmin, sessionController.deleteSessionByUserId);
router.delete('/:id', auth, requireAdmin, sessionController.deleteSessionById);
router.post('/logout', auth, sessionController.logout);
router.post('/revoke/:id', auth, requireAdmin, sessionController.revokeSession);
router.post('/revoke-all/:userId', auth, requireAdmin, sessionController.revokeAllSessionByUser);

module.exports = router;

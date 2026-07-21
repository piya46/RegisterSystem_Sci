const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const requireAdmin = require('../middleware/requireAdmin');
const participantFieldController = require('../controllers/participantFieldController');

router.post('/', auth, requireAdmin, participantFieldController.createField);
router.get('/', optionalAuth, participantFieldController.listFields);
router.put('/:id', auth, requireAdmin, participantFieldController.updateField);
router.delete('/:id', auth, requireAdmin, participantFieldController.deleteField);

module.exports = router;

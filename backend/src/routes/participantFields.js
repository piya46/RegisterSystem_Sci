const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const requirePermission = require('../middleware/requirePermission');
const participantFieldController = require('../controllers/participantFieldController');

router.post('/', auth, requirePermission('event:manage'), participantFieldController.createField);
router.get('/', optionalAuth, participantFieldController.listFields);
router.put('/:id', auth, requirePermission('event:manage'), participantFieldController.updateField);
router.delete('/:id', auth, requirePermission('event:manage'), participantFieldController.deleteField);

module.exports = router;

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const participantFieldController = require('../controllers/participantFieldController');

router.post('/', auth, requireAdmin, participantFieldController.createField);
router.get('/', participantFieldController.listFields);
router.put('/:id', auth, requireAdmin, participantFieldController.updateField);
router.delete('/:id', auth, requireAdmin, participantFieldController.deleteField);

module.exports = router;

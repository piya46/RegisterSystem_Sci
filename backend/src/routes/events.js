const express = require('express');
const auth = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const controller = require('../controllers/eventController');

const router = express.Router();

router.use(auth);
router.get('/current', requirePermission('event:read'), controller.getCurrentEvent);
router.get('/catalog', requirePermission('event:read'), controller.getCatalog);
router.get('/migration-preview', requirePermission('event:manage'), controller.getMigrationPreview);
router.post('/migrate-legacy', requirePermission('event:manage'), controller.runLegacyMigration);

router.post('/organizations', requirePermission('organization:manage'), controller.createOrganization);
router.put('/organizations/:id', requirePermission('organization:manage'), controller.updateOrganization);

router.post('/series', requirePermission('event:manage'), controller.createSeries);
router.put('/series/:id', requirePermission('event:manage'), controller.updateSeries);

router.post('/', requirePermission('event:manage'), controller.createEvent);
router.put('/:id', requirePermission('event:manage'), controller.updateEvent);
router.post('/:id/activate', requirePermission('event:manage'), controller.activateEvent);
router.post('/:id/publish', requirePermission('layout:manage'), controller.publishEvent);
router.post('/:id/status', requirePermission('event:manage'), controller.updateEventStatus);
router.put('/:id/layouts/:layoutKey', requirePermission('layout:manage'), controller.updateLayout);
router.post('/clone-settings', requirePermission('layout:manage'), controller.cloneSettings);

module.exports = router;

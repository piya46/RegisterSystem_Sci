const express = require('express');
const router = express.Router();
const prizeController = require('../controllers/prizeController');
const auth = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');

router.use(auth); // ต้อง Login ก่อนจัดการของรางวัล
router.get('/', requirePermission('event:read'), prizeController.listPrizes);
router.post('/', requirePermission('event:manage'), prizeController.createPrize);
router.delete('/:id', requirePermission('event:manage'), prizeController.deletePrize);
router.post('/draw/:prizeId', requirePermission('participant:manage'), prizeController.drawPrize);
router.post('/cancel', requirePermission('participant:manage'), prizeController.cancelWinner);

module.exports = router;

const express = require('express');
const router = express.Router();
const prizeController = require('../controllers/prizeController');
const auth = require('../middleware/auth');

router.use(auth); // ต้อง Login ก่อนจัดการของรางวัล
router.get('/', prizeController.listPrizes);
router.post('/', prizeController.createPrize);
router.delete('/:id', prizeController.deletePrize);
router.post('/draw/:prizeId', prizeController.drawPrize);
router.post('/cancel', prizeController.cancelWinner);

module.exports = router;
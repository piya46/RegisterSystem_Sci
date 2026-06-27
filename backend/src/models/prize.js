const mongoose = require('mongoose');

const prizeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  totalQuantity: { type: Number, required: true },
  remainingQuantity: { type: Number, required: true },
  image: { type: String, default: null },
  eventYear: { type: String, default: '', index: true },
  winners: [{
    participantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Participant' },
    wonAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Prize', prizeSchema);

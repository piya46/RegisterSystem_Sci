const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  items: [{
    itemName: String,
    sizes: [{
      size: String,
      stock: Number,
      sold: { type: Number, default: 0 }
    }]
  }],
  orderDeadline: { type: Date },
  pickupLocations: [{ type: String }],
  isDeliveryAvailable: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Package', packageSchema);
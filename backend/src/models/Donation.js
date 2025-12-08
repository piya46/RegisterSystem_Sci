const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
 
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false 
  },
  
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  amount: { type: Number, required: true, min: 1 }, 
  transferDateTime: { type: Date, required: true }, 
  
  source: { 
    type: String, 
    enum: ['PRE_REGISTER', 'SUPPORT_SYSTEM'], 
    default: 'PRE_REGISTER' 
  },


  isPackage: { type: Boolean, default: false },
  packageType: { type: String, default: "" }, 
  size: { type: String, default: "" },       

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Donation', donationSchema);
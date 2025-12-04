const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // ลบ options ที่ deprecated ออก เพราะ Mongoose v8+ จัดการให้อัตโนมัติแล้ว
    await mongoose.connect(process.env.MONGODB_URI);
    
    console.log('MongoDB connected!');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

module.exports = connectDB;
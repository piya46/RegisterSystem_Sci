// backend/src/utils/otp.js

// 1. สร้าง OTP 8 หลัก
exports.generateOTP = () => {
  // สุ่มเลขระหว่าง 10000000 ถึง 99999999
  return Math.floor(10000000 + Math.random() * 90000000).toString();
};

// 2. สร้าง Reference Code (ตัวอักษรผสมตัวเลข 4 หลัก) เช่น "A8K2"
exports.generateRef = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};
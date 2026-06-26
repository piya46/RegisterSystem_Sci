// backend/src/utils/otp.js
const crypto = require('crypto');

// 1. สร้าง OTP 8 หลัก
exports.generateOTP = () => {
  return crypto.randomInt(10000000, 100000000).toString();
};

// 2. สร้าง Reference Code (ตัวอักษรผสมตัวเลข 4 หลัก) เช่น "A8K2"
exports.generateRef = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return result;
};

exports.hashOTP = (otp) => {
  const secret = process.env.JWT_SECRET || process.env.OTP_SECRET;
  if (!secret) throw new Error('Missing OTP signing secret');
  return crypto.createHmac('sha256', secret).update(String(otp)).digest('hex');
};

exports.verifyOTP = (otp, hashedOtp) => {
  if (!otp || !hashedOtp) return false;
  const expected = exports.hashOTP(otp);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(String(hashedOtp), 'hex');
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};

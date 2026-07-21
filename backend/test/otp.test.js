const test = require('node:test');
const assert = require('node:assert/strict');
const { generateOTP, hashOTP, verifyOTP } = require('../src/utils/otp');

test('registration OTP contract uses eight digits and constant-time hash verification', () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-only-otp-secret';
  try {
    for (let index = 0; index < 50; index += 1) {
      const otp = generateOTP();
      assert.match(otp, /^\d{8}$/);
      const hash = hashOTP(otp);
      assert.equal(verifyOTP(otp, hash), true);
      assert.equal(verifyOTP('00000000', hash), otp === '00000000');
    }
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

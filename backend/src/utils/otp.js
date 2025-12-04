const otps = {}; // { userId: { otp, expiresAt } }

exports.generateOTP = function (userId) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otps[userId] = { otp, expiresAt: Date.now() + 5 * 60 * 1000 }; // 5 min
  return otp;
};

exports.verifyOTP = function (userId, code) {
  const entry = otps[userId];
  if (!entry || entry.expiresAt < Date.now() || entry.otp !== code) return false;
  delete otps[userId];
  return true;
};

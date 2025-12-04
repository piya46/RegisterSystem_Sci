const ApiLog = require('../models/apilog');

module.exports = async function mongoLogger(req, res, next) {
  // รอให้ response เสร็จ (เช่นได้ status code)
  res.on('finish', async () => {
    try {
      const log = new ApiLog({
        user: req.user ? req.user.username : 'Anonymous',
        userId: req.user ? String(req.user._id) : null,
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        action: '',         
        detail: ''
      });
      await log.save();
    } catch (err) {
      // อย่าทำให้ระบบล่มถ้า log error
      console.error('Mongo Logger Error:', err);
    }
  });
  next();
};

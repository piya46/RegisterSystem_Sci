const errorHandler = (err, req, res, next) => {
  console.error("🔥 [Error Log]:", err.message);
  
  const statusCode = err.statusCode || 500;
  const message = statusCode >= 500
    ? "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์"
    : (err.message || "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์");

  res.status(statusCode).json({
    success: false,
    message,
    // ซ่อน Stack trace ไว้เมื่ออยู่บน Production เพื่อความปลอดภัย
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

module.exports = errorHandler;

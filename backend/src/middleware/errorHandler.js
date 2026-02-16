const errorHandler = (err, req, res, next) => {
  console.error("🔥 [Error Log]:", err.message);
  
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์",
    // ซ่อน Stack trace ไว้เมื่ออยู่บน Production เพื่อความปลอดภัย
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

module.exports = errorHandler;
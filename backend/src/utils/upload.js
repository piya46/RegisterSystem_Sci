// utils/upload.js
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// สร้างโฟลเดอร์อัตโนมัติถ้ายังไม่มี
const avatarPath = path.join(__dirname, '..', 'uploads', 'avatars');
if (!fs.existsSync(avatarPath)) {
  fs.mkdirSync(avatarPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, avatarPath);
  },
  filename: (req, file, cb) => {
    // เก็บเป็น userId + นามสกุลเดิม
    const ext = path.extname(file.originalname);
    cb(null, `${req.user._id}${ext}`);
  }
});

// Optional: filter type
const fileFilter = (req, file, cb) => {
  if (/image\/(jpeg|jpg|png|gif)/.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const uploadAvatar = multer({ storage, fileFilter });

module.exports = uploadAvatar;
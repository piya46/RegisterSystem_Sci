// backend/src/utils/upload.js
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
    const extByMime = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif'
    };
    const ext = extByMime[file.mimetype];
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

// Optional: filter type
const fileFilter = (req, file, cb) => {
  if (['image/jpeg', 'image/png', 'image/gif'].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const uploadAvatar = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 }
});

module.exports = uploadAvatar;

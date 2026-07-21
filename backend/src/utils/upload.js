// backend/src/utils/upload.js
const multer = require('multer');

// Optional: filter type
const fileFilter = (req, file, cb) => {
  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 }
});

module.exports = uploadAvatar;

const path = require("path");
const multer = require("multer");

const env = require("../config/env");
const AppError = require("../utils/AppError");

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9-_]/g, "-").replace(/-+/g, "-").toLowerCase();
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, env.videoUploadDir);
  },
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname) || ".mp4";
    const baseName = path.basename(file.originalname, extension);
    const safeName = sanitizeFilename(baseName) || "video";
    cb(null, `${Date.now()}-${safeName}${extension}`);
  }
});

const upload = multer({
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("video/")) {
      cb(new AppError("Only video uploads are supported.", 400));
      return;
    }

    cb(null, true);
  },
  limits: {
    fileSize: 250 * 1024 * 1024
  },
  storage
});

module.exports = upload.single("video");


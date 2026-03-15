const path = require("path");
const multer = require("multer");

const env = require("../config/env");
const AppError = require("../utils/AppError");

const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska"
]);

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB

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
    if (!ALLOWED_VIDEO_MIME_TYPES.has(file.mimetype)) {
      cb(
        new AppError(
          "Unsupported video format. Allowed formats: mp4, webm, ogg, mov, avi, mkv.",
          400
        )
      );
      return;
    }

    cb(null, true);
  },
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES
  },
  storage
});

module.exports = (req, res, next) => {
  upload.single("video")(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof AppError) {
      next(err);
      return;
    }

    if (err.code === "LIMIT_FILE_SIZE") {
      next(new AppError("Video file is too large. Max size is 100MB.", 400));
      return;
    }

    next(new AppError("Failed to upload video file.", 400));
  });
};

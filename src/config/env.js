const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// `rootDir` is the server folder (the backend is self‑contained here)
const rootDir = path.resolve(__dirname, "..");
// Single `.env` file for the backend, placed in the `server` folder
const envFilePath = path.join(rootDir, ".env");

dotenv.config({ path: envFilePath });
const nodeEnv = process.env.NODE_ENV || "development";
const uploadRoot = path.join(rootDir, "uploads");
const legacyUploadRoot = path.join(rootDir, "src", "uploads");
const legacyVideoUploadDir = path.join(legacyUploadRoot, "videos");
const legacyThumbnailUploadDir = path.join(legacyUploadRoot, "thumbnails");
const videoUploadDir = path.join(uploadRoot, "videos");
const thumbnailUploadDir = path.join(uploadRoot, "thumbnails");
const configuredMongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "";
const mongoUri =
  configuredMongoUri.trim() || "mongodb://127.0.0.1:27017/thumbnail-generator";
const configuredClientUrls = process.env.CLIENT_URLS || process.env.CLIENT_URL || "";
const clientUrls = Array.from(
  new Set(
    (configuredClientUrls || "http://localhost:5173")
      .split(",")
      .map((value) => value.trim().replace(/\/$/, ""))
      .filter(Boolean)
  )
);
const startupValidationErrors = [];

if (nodeEnv === "production" && !configuredMongoUri.trim()) {
  startupValidationErrors.push(
    "Missing MONGODB_URI (or MONGO_URI). Render does not load server/.env automatically, so add this variable in your Render service settings."
  );
}

[uploadRoot, videoUploadDir, thumbnailUploadDir].forEach((directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
});

module.exports = {
  clientUrl: clientUrls[0] || "http://localhost:5173",
  clientUrls,
  clientUrlsUseFallback: !configuredClientUrls.trim(),
  envFilePath,
  mongoUri,
  mongoUriUsesFallback: !configuredMongoUri.trim(),
  nodeEnv,
  port: Number(process.env.PORT) || 5000,
  legacyUploadRoot,
  legacyThumbnailUploadDir,
  legacyVideoUploadDir,
  rootDir,
  startupValidationErrors,
  thumbnailUploadDir,
  uploadRoot,
  videoUploadDir
};

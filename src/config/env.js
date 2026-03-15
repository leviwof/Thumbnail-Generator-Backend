const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "../..");
const envFilePath = path.join(rootDir, ".env");

dotenv.config({ path: envFilePath });
const uploadRoot = path.join(rootDir, "uploads");
const legacyUploadRoot = path.join(rootDir, "src", "uploads");
const legacyVideoUploadDir = path.join(legacyUploadRoot, "videos");
const legacyThumbnailUploadDir = path.join(legacyUploadRoot, "thumbnails");
const videoUploadDir = path.join(uploadRoot, "videos");
const thumbnailUploadDir = path.join(uploadRoot, "thumbnails");
const configuredMongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "";
const mongoUri =
  configuredMongoUri.trim() || "mongodb://127.0.0.1:27017/thumbnail-generator";
const clientUrls = Array.from(
  new Set(
    (process.env.CLIENT_URLS || process.env.CLIENT_URL || "http://localhost:5173")
      .split(",")
      .map((value) => value.trim().replace(/\/$/, ""))
      .filter(Boolean)
  )
);

[uploadRoot, videoUploadDir, thumbnailUploadDir].forEach((directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
});

module.exports = {
  clientUrl: clientUrls[0] || "http://localhost:5173",
  clientUrls,
  envFilePath,
  mongoUri,
  mongoUriUsesFallback: !configuredMongoUri.trim(),
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 5000,
  legacyUploadRoot,
  legacyThumbnailUploadDir,
  legacyVideoUploadDir,
  rootDir,
  thumbnailUploadDir,
  uploadRoot,
  videoUploadDir
};

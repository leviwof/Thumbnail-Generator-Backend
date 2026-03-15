const express = require("express");

const thumbnailController = require("../controllers/thumbnailController");
const videoController = require("../controllers/videoController");
const uploadVideoFile = require("../middleware/uploadMiddleware");

const router = express.Router();

router.get("/", videoController.listVideos);
router.get("/:id", videoController.getVideoById);
router.delete("/:id", videoController.deleteVideo);
router.post("/upload", uploadVideoFile, videoController.uploadVideo);
router.post("/:id/thumbnails/generate", thumbnailController.generateThumbnails);
router.post("/:id/thumbnails/generate-sync", thumbnailController.generateThumbnailsSync);
router.post("/:id/thumbnails/select", thumbnailController.selectThumbnail);

module.exports = router;

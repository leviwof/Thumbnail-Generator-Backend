const express = require("express");

const thumbnailController = require("../controllers/thumbnailController");
const videoController = require("../controllers/videoController");
const uploadVideoFile = require("../middleware/uploadMiddleware");

const router = express.Router();

router.get("/", videoController.listVideos);
router.get("/:id", videoController.getVideoById);
router.delete("/:id", videoController.deleteVideo);
router.post("/upload", uploadVideoFile, videoController.uploadVideo);

// Synchronous: waits for thumbnails and returns them in the response.
router.post("/:id/thumbnails/generate", thumbnailController.generateThumbnails);

// Async: enqueues the job and returns 202 immediately.
router.post("/:id/thumbnails/generate-async", thumbnailController.generateThumbnailsAsync);

router.post("/:id/thumbnails/select", thumbnailController.selectThumbnail);

module.exports = router;

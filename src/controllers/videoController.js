const asyncHandler = require("../utils/asyncHandler");
const videoService = require("../services/videoService");
const { enqueueThumbnailJob } = require("../services/uploadQueueService");

function getBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

exports.uploadVideo = asyncHandler(async (req, res) => {
  const baseUrl = getBaseUrl(req);

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Video file is required."
    });
  }

  // Basic upload progress logging (request-level, good enough for Render logs)
  // eslint-disable-next-line no-console
  console.log("[upload] Incoming video upload", {
    filename: req.file.originalname,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size
  });

  const video = await videoService.createVideo({
    baseUrl,
    file: req.file,
    payload: req.body
  });

  // Enqueue thumbnail generation instead of blocking the upload response.
  enqueueThumbnailJob({ videoId: video.id, baseUrl });

  // eslint-disable-next-line no-console
  console.log("[upload] Video stored and thumbnail job enqueued", {
    videoId: video.id,
    url: video.videoUrl
  });

  return res.status(201).json({
    success: true,
    videoId: video.id,
    thumbnails: [],
    video
  });
});

exports.listVideos = asyncHandler(async (req, res) => {
  const videos = await videoService.listVideos(req.query);

  res.json({
    items: videos,
    total: videos.length
  });
});

exports.getVideoById = asyncHandler(async (req, res) => {
  const video = await videoService.getVideoById(req.params.id);

  res.json(video);
});

exports.deleteVideo = asyncHandler(async (req, res) => {
  const deletedVideo = await videoService.deleteVideo(req.params.id);

  res.json({
    message: "Video deleted successfully.",
    videoId: deletedVideo.id
  });
});

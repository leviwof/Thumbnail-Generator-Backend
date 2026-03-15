const asyncHandler = require("../utils/asyncHandler");
const videoService = require("../services/videoService");

function getBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

exports.uploadVideo = asyncHandler(async (req, res) => {
  const video = await videoService.createVideo({
    baseUrl: getBaseUrl(req),
    file: req.file,
    payload: req.body
  });

  res.status(201).json({
    message: "Video uploaded successfully.",
    videoId: video.id,
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

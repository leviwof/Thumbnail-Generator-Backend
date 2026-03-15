const asyncHandler = require("../utils/asyncHandler");
const { enqueueThumbnailJob } = require("../services/uploadQueueService");

function getBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function serializeThumbnail(thumbnail) {
  const normalizedThumbnail = thumbnail?.toObject ? thumbnail.toObject() : thumbnail;

  if (!normalizedThumbnail) {
    return null;
  }

  return {
    ...normalizedThumbnail,
    url: normalizedThumbnail.thumbnailUrl
  };
}

function serializeVideo(video) {
  const normalizedVideo = video?.toObject ? video.toObject() : video;

  if (!normalizedVideo) {
    return null;
  }

  return {
    ...normalizedVideo,
    primaryThumbnail: serializeThumbnail(normalizedVideo.primaryThumbnail)
  };
}

exports.generateThumbnails = asyncHandler(async (req, res) => {
  const baseUrl = getBaseUrl(req);

  enqueueThumbnailJob({ videoId: req.params.id, baseUrl });

  res.status(202).json({
    message: "Thumbnail generation has been enqueued and will complete shortly.",
    queued: true
  });
});

exports.selectThumbnail = asyncHandler(async (req, res) => {
  const video = await thumbnailService.selectPrimaryThumbnail(req.params.id, req.body.thumbnailId);

  res.json({
    message: "Primary thumbnail updated successfully.",
    video: serializeVideo(video)
  });
});

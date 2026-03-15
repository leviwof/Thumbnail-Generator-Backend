const asyncHandler = require("../utils/asyncHandler");
const { enqueueThumbnailJob } = require("../services/uploadQueueService");
const thumbnailService = require("../services/thumbnailService");

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

/**
 * POST /videos/:id/thumbnails/generate
 *
 * Synchronous endpoint — waits for ffmpeg to finish and returns the
 * full list of generated thumbnails so the frontend can display them
 * immediately without polling.
 *
 * Timeout on the request itself is managed by the client (axios) or
 * reverse proxy, not here; we let the service run to completion.
 */
exports.generateThumbnails = asyncHandler(async (req, res) => {
  const baseUrl = getBaseUrl(req);
  const videoId = req.params.id;

  const thumbnails = await thumbnailService.generateThumbnailsForVideo(videoId, baseUrl);

  res.status(200).json({
    videoId,
    count: thumbnails.length,
    thumbnails: thumbnails.map((t) => ({
      _id: t._id,
      thumbnailUrl: t.thumbnailUrl,
      url: t.thumbnailUrl,
      filename: t.filename,
      timestampSeconds: t.timestampSeconds,
      isPrimary: t.isPrimary,
      videoId: t.videoId
    }))
  });
});

/**
 * POST /videos/:id/thumbnails/generate-async
 *
 * Fire-and-forget variant: enqueues the job and returns 202 immediately.
 * The client can poll the video detail endpoint to get the thumbnails
 * once they are ready.
 */
exports.generateThumbnailsAsync = asyncHandler(async (req, res) => {
  const baseUrl = getBaseUrl(req);

  enqueueThumbnailJob({ videoId: req.params.id, baseUrl });

  res.status(202).json({
    message: "Thumbnail generation has been enqueued and will complete shortly.",
    queued: true
  });
});

/**
 * POST /videos/:id/thumbnails/select
 */
exports.selectThumbnail = asyncHandler(async (req, res) => {
  const video = await thumbnailService.selectPrimaryThumbnail(req.params.id, req.body.thumbnailId);

  res.json({
    message: "Primary thumbnail updated successfully.",
    video: serializeVideo(video)
  });
});

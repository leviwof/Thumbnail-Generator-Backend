const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");

const env = require("../config/env");
const Thumbnail = require("../models/Thumbnail");
const Video = require("../models/Video");
const AppError = require("../utils/AppError");

function buildAssetUrl(baseUrl, folder, filename) {
  return `${baseUrl}/uploads/${folder}/${filename}`;
}

function parseTags(input) {
  if (!input) {
    return [];
  }

  return Array.from(
    new Set(
      input
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

async function getVideoOrThrow(videoId) {
  if (!mongoose.isValidObjectId(videoId)) {
    throw new AppError("Invalid video id.", 400);
  }

  const video = await Video.findById(videoId).populate("primaryThumbnail");

  if (!video) {
    throw new AppError("Video not found.", 404);
  }

  return video;
}

exports.createVideo = async ({ payload, file, baseUrl }) => {
  if (!payload.title || !payload.title.trim()) {
    throw new AppError("Title is required.", 400);
  }

  if (!file) {
    throw new AppError("Video file is required.", 400);
  }

  const video = await Video.create({
    description: payload.description?.trim() || "",
    mimeType: file.mimetype,
    size: file.size,
    tags: parseTags(payload.tags),
    title: payload.title.trim(),
    videoFilename: file.filename,
    videoUrl: buildAssetUrl(baseUrl, "videos", file.filename)
  });

  console.log("Saved video:", {
    collection: Video.collection.name,
    database: mongoose.connection.name,
    id: video.id,
    title: video.title,
    videoUrl: video.videoUrl
  });

  return video;
};

exports.listVideos = async ({ search = "", tag = "" }) => {
  const query = {};

  if (search.trim()) {
    query.title = { $regex: search.trim(), $options: "i" };
  }

  if (tag.trim()) {
    query.tags = tag.trim().toLowerCase();
  }

  return Video.find(query).populate("primaryThumbnail").sort({ createdAt: -1 }).lean();
};

exports.getVideoById = async (videoId) => {
  const video = await getVideoOrThrow(videoId);
  const thumbnails = await Thumbnail.find({ videoId: video.id }).sort({ createdAt: 1 }).lean();

  return {
    ...video.toObject(),
    thumbnails
  };
};

async function unlinkIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

exports.deleteVideo = async (videoId) => {
  const video = await getVideoOrThrow(videoId);
  const thumbnails = await Thumbnail.find({ videoId: video.id });

  const thumbnailPaths = thumbnails.flatMap((thumbnail) => [
    path.join(env.thumbnailUploadDir, thumbnail.filename),
    path.join(env.legacyThumbnailUploadDir, thumbnail.filename)
  ]);

  const videoPaths = [
    path.join(env.videoUploadDir, video.videoFilename),
    path.join(env.legacyVideoUploadDir, video.videoFilename)
  ];

  await Promise.all([
    ...thumbnailPaths.map(unlinkIfExists),
    ...videoPaths.map(unlinkIfExists)
  ]);

  await Thumbnail.deleteMany({ videoId: video.id });
  await Video.findByIdAndDelete(video.id);

  return { id: video.id };
};

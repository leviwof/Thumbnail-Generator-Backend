const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");

const env = require("../config/env");
const Thumbnail = require("../models/Thumbnail");
const Video = require("../models/Video");
const AppError = require("../utils/AppError");
const ffmpeg = require("../utils/ffmpeg");

const THUMBNAIL_TIMESTAMPS = [2, 5, 8, 10];
const THUMBNAIL_SIZE = "320x240";
const MIN_CAPTURE_GAP_SECONDS = 0.25;
const MIN_CAPTURE_TIMESTAMP_SECONDS = 0.1;

function buildAssetPath(folder, filename) {
  return `/uploads/${folder}/${filename}`;
}

function buildAssetUrl(baseUrl, folder, filename) {
  const assetPath = buildAssetPath(folder, filename);

  if (!baseUrl) {
    return assetPath;
  }

  return `${baseUrl.replace(/\/$/, "")}${assetPath}`;
}

function normalizePositiveNumber(value) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return 0;
  }

  return parsedValue;
}

function parseDurationTag(value) {
  if (typeof value !== "string") {
    return 0;
  }

  const parts = value.split(":");

  if (parts.length !== 3) {
    return 0;
  }

  const [hours, minutes, seconds] = parts.map(Number);

  if (![hours, minutes, seconds].every(Number.isFinite)) {
    return 0;
  }

  return hours * 3600 + minutes * 60 + seconds;
}

function getFallbackTimestamps(duration, count = THUMBNAIL_TIMESTAMPS.length) {
  const safeDuration = normalizePositiveNumber(duration);

  if (!safeDuration) {
    return Array.from({ length: count }, (_value, index) =>
      Number((0.2 + index * 0.8).toFixed(2))
    );
  }

  const safeEnd = Math.max(0.05, safeDuration - 0.05);
  const step = safeEnd / (count + 1);

  return Array.from({ length: count }, (_value, index) =>
    Number(Math.min(safeEnd, step * (index + 1)).toFixed(2))
  );
}

function sanitizeTimestamps(timestamps) {
  return timestamps.filter((timestamp) => Number.isFinite(timestamp) && timestamp >= 0);
}

function resolveThumbnailTimestamps(duration) {
  const safeDuration = normalizePositiveNumber(duration);

  if (!safeDuration) {
    return THUMBNAIL_TIMESTAMPS;
  }

  const latestAllowedTimestamp = Math.max(
    MIN_CAPTURE_TIMESTAMP_SECONDS,
    safeDuration - MIN_CAPTURE_GAP_SECONDS
  );

  if (latestAllowedTimestamp >= THUMBNAIL_TIMESTAMPS[THUMBNAIL_TIMESTAMPS.length - 1]) {
    return THUMBNAIL_TIMESTAMPS;
  }

  if (latestAllowedTimestamp < THUMBNAIL_TIMESTAMPS.length * MIN_CAPTURE_GAP_SECONDS) {
    return getFallbackTimestamps(safeDuration, THUMBNAIL_TIMESTAMPS.length);
  }

  const resolvedTimestamps = [];

  THUMBNAIL_TIMESTAMPS.forEach((targetTimestamp, index) => {
    const remainingSlots = THUMBNAIL_TIMESTAMPS.length - index - 1;
    const minValue = resolvedTimestamps.length
      ? resolvedTimestamps[resolvedTimestamps.length - 1] + MIN_CAPTURE_GAP_SECONDS
      : MIN_CAPTURE_TIMESTAMP_SECONDS;
    const maxValue = Math.max(
      minValue,
      latestAllowedTimestamp - remainingSlots * MIN_CAPTURE_GAP_SECONDS
    );

    resolvedTimestamps.push(Number(Math.min(targetTimestamp, maxValue).toFixed(2)));
  });

  return sanitizeTimestamps(resolvedTimestamps);
}

async function getVideoOrThrow(videoId) {
  if (!mongoose.isValidObjectId(videoId)) {
    throw new AppError("Invalid video id.", 400);
  }

  const video = await Video.findById(videoId);

  if (!video) {
    throw new AppError("Video not found.", 404);
  }

  return video;
}

async function getDurationInSeconds(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (error, metadata) => {
      if (error) {
        reject(error);
        return;
      }

      const durations = [
        metadata?.format?.duration,
        ...(metadata?.streams || []).flatMap((stream) => [
          stream?.duration,
          stream?.tags?.DURATION
        ])
      ];

      const normalizedDuration =
        durations.map(normalizePositiveNumber).find(Boolean) ||
        durations.map(parseDurationTag).find(Boolean) ||
        0;

      resolve(normalizedDuration);
    });
  });
}

async function removeExistingThumbnails(videoId) {
  const existingThumbnails = await Thumbnail.find({ videoId });

  await Promise.all(
    existingThumbnails.map(async (thumbnail) => {
      const candidatePaths = [
        path.join(env.thumbnailUploadDir, thumbnail.filename),
        path.join(env.legacyThumbnailUploadDir, thumbnail.filename)
      ];

      await Promise.all(
        candidatePaths.map(async (filePath) => {
          try {
            await fs.unlink(filePath);
          } catch (error) {
            if (error.code !== "ENOENT") {
              throw error;
            }
          }
        })
      );
    })
  );

  await Thumbnail.deleteMany({ videoId });
}

async function resolveVideoFilePath(filename) {
  const candidatePaths = [
    path.join(env.videoUploadDir, filename),
    path.join(env.legacyVideoUploadDir, filename)
  ];

  for (const filePath of candidatePaths) {
    try {
      await fs.access(filePath);
      return filePath;
    } catch (_error) {
      continue;
    }
  }

  throw new AppError("Uploaded video file is missing on disk.", 404);
}

async function generateThumbnails(videoPath, videoId, timestamps) {
  const safeTimestamps = sanitizeTimestamps(timestamps);

  if (!safeTimestamps.length) {
    throw new AppError("Unable to determine valid timestamps for thumbnail generation.", 500);
  }

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .on("end", async () => {
        const filenames = safeTimestamps.map((_value, index) => `${videoId}-thumb-${index + 1}.png`);

        try {
          await Promise.all(
            filenames.map(async (filename) => {
              const thumbnailPath = path.join(env.thumbnailUploadDir, filename);

              await fs.access(thumbnailPath);
            })
          );

          resolve(filenames);
        } catch (error) {
          reject(
            new AppError(`Thumbnail generation completed but files were not created: ${error.message}`, 500)
          );
        }
      })
      .on("error", (error) => {
        reject(new AppError(`Thumbnail generation failed: ${error.message}`, 500));
      })
      .screenshots({
        filename: `${videoId}-thumb-%i.png`,
        folder: env.thumbnailUploadDir,
        size: THUMBNAIL_SIZE,
        timestamps: safeTimestamps.map(String)
      });
  });
}

exports.generateThumbnailsForVideo = async (videoId, baseUrl) => {
  const video = await getVideoOrThrow(videoId);
  const filePath = await resolveVideoFilePath(video.videoFilename);

  await fs.mkdir(env.thumbnailUploadDir, { recursive: true });
  await removeExistingThumbnails(video.id);

  let durationInSeconds = 0;

  try {
    durationInSeconds = await getDurationInSeconds(filePath);
  } catch (error) {
    console.error("Unable to read video metadata:", error);
    throw new AppError(`Unable to inspect uploaded video: ${error.message}`, 500);
  }

  const timestamps = resolveThumbnailTimestamps(durationInSeconds);

  if (!timestamps.length) {
    throw new AppError("Unable to determine valid timestamps for thumbnail generation.", 500);
  }

  const filenames = await generateThumbnails(filePath, video.id, timestamps);

  const thumbnails = await Thumbnail.insertMany(
    filenames.map((filename, index) => ({
      filename,
      isPrimary: index === 0,
      thumbnailUrl: buildAssetUrl(baseUrl, "thumbnails", filename),
      timestampSeconds: Number(timestamps[index]),
      videoId: video.id
    }))
  );

  thumbnails.forEach((thumbnail) => {
    console.log("Thumbnail saved:", {
      collection: Thumbnail.collection.name,
      database: mongoose.connection.name,
      id: thumbnail.id,
      thumbnailUrl: thumbnail.thumbnailUrl,
      videoId: String(thumbnail.videoId)
    });
  });

  video.primaryThumbnail = thumbnails[0]?._id || null;
  await video.save();

  return thumbnails;
};

exports.selectPrimaryThumbnail = async (videoId, thumbnailId) => {
  if (!mongoose.isValidObjectId(thumbnailId)) {
    throw new AppError("Invalid thumbnail id.", 400);
  }

  const video = await getVideoOrThrow(videoId);
  const thumbnail = await Thumbnail.findOne({ _id: thumbnailId, videoId: video.id });

  if (!thumbnail) {
    throw new AppError("Thumbnail not found for this video.", 404);
  }

  await Thumbnail.updateMany({ videoId: video.id }, { isPrimary: false });
  thumbnail.isPrimary = true;
  await thumbnail.save();

  video.primaryThumbnail = thumbnail.id;
  await video.save();

  return Video.findById(video.id).populate("primaryThumbnail");
};

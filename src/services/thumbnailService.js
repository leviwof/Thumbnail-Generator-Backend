const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");

const env = require("../config/env");
const Thumbnail = require("../models/Thumbnail");
const Video = require("../models/Video");
const AppError = require("../utils/AppError");
const ffmpeg = require("../utils/ffmpeg");

// ─── Configuration ────────────────────────────────────────────────────────────

// We always aim for exactly this many thumbnails.
const TARGET_THUMBNAIL_COUNT = 5;

// Render-friendly, lightweight 16:9 thumbnails.
const THUMBNAIL_SIZE = "320x180";
const MIN_CAPTURE_GAP_SECONDS = 0.15;
const MIN_CAPTURE_TIMESTAMP_SECONDS = 0.05;

// Timeout for ffprobe calls (ms). Prevents hanging on corrupt files.
const FFPROBE_TIMEOUT_MS = 15_000;

// Timeout for the screenshot extraction step (ms).
const SCREENSHOT_TIMEOUT_MS = 60_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Timestamp Resolution ─────────────────────────────────────────────────────

/**
 * Produce exactly `count` evenly-spaced timestamps across the video duration.
 * Works for any duration, including very short videos (<1 s).
 */
function computeTimestamps(duration, count = TARGET_THUMBNAIL_COUNT) {
  const safeDuration = normalizePositiveNumber(duration);

  // Ultra-short or unknown duration — return small fixed offsets so ffmpeg
  // can at least try to grab frames near the start.
  if (!safeDuration || safeDuration < 0.3) {
    return Array.from({ length: count }, (_v, i) =>
      Number((0.05 + i * 0.05).toFixed(3))
    );
  }

  // Leave a tiny buffer at the end to avoid seeking past EOF.
  const safeEnd = Math.max(MIN_CAPTURE_TIMESTAMP_SECONDS, safeDuration - 0.05);

  // For very short videos, compress the gap so we still hit `count` frames.
  const maxGap = safeEnd / (count + 1);
  const gap = Math.max(MIN_CAPTURE_GAP_SECONDS, maxGap);
  const step = Math.min(gap, safeEnd / (count + 1));

  const timestamps = [];
  for (let i = 0; i < count; i++) {
    const t = step * (i + 1);
    timestamps.push(Number(Math.min(t, safeEnd).toFixed(3)));
  }

  // De-duplicate (can happen for very short clips).
  return [...new Set(timestamps)];
}

// ─── Video Lookup ─────────────────────────────────────────────────────────────

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

// ─── FFprobe Duration ─────────────────────────────────────────────────────────

async function getDurationInSeconds(filePath) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AppError("ffprobe timed out while reading video metadata.", 500));
    }, FFPROBE_TIMEOUT_MS);

    ffmpeg.ffprobe(filePath, (error, metadata) => {
      clearTimeout(timer);

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

// ─── Existing Thumbnail Cleanup ───────────────────────────────────────────────

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

// ─── Resolve Source File ──────────────────────────────────────────────────────

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

// ─── Core Screenshot Extraction ───────────────────────────────────────────────

/**
 * Runs ffmpeg to extract exactly one screenshot per timestamp.
 *
 * Returns the list of filenames that were actually created on disk.
 * If a timestamp seek fails (e.g. beyond EOF), ffmpeg may produce fewer files
 * than requested — that's fine, we only persist what we can verify.
 */
async function generateThumbnails(videoPath, videoId, timestamps) {
  if (!timestamps.length) {
    throw new AppError("Unable to determine valid timestamps for thumbnail generation.", 500);
  }

  const expectedFilenames = timestamps.map(
    (_v, i) => `${videoId}-thumb-${i + 1}.png`
  );

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AppError("Thumbnail generation timed out.", 500));
    }, SCREENSHOT_TIMEOUT_MS);

    ffmpeg(videoPath)
      .on("end", async () => {
        clearTimeout(timer);

        // Verify which files were actually written to disk.
        const verified = [];
        for (const filename of expectedFilenames) {
          try {
            await fs.access(path.join(env.thumbnailUploadDir, filename));
            verified.push(filename);
          } catch (_error) {
            // File wasn't created — skip it.
          }
        }

        resolve(verified);
      })
      .on("error", (error) => {
        clearTimeout(timer);
        reject(new AppError(`Thumbnail generation failed: ${error.message}`, 500));
      })
      .screenshots({
        filename: `${videoId}-thumb-%i.png`,
        folder: env.thumbnailUploadDir,
        size: THUMBNAIL_SIZE,
        timestamps: timestamps.map(String)
      });
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

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

  console.log("[thumbnails] Video duration:", durationInSeconds, "seconds");

  const timestamps = computeTimestamps(durationInSeconds);

  console.log("[thumbnails] Target timestamps:", timestamps);

  if (!timestamps.length) {
    throw new AppError("Unable to determine valid timestamps for thumbnail generation.", 500);
  }

  let filenames = await generateThumbnails(filePath, video.id, timestamps);

  console.log("[thumbnails] Verified files on disk:", filenames.length, "of", timestamps.length);

  // ── Fallback: if fewer than TARGET_THUMBNAIL_COUNT files were created,
  //    retry with tighter timestamps near the start of the video. ───────
  if (filenames.length < TARGET_THUMBNAIL_COUNT && durationInSeconds > 0) {
    console.log("[thumbnails] Retrying with tighter timestamps for missing frames");

    const retryTimestamps = computeTimestamps(
      Math.min(durationInSeconds, 3),
      TARGET_THUMBNAIL_COUNT
    );

    // Remove the first batch and regenerate.
    await removeExistingThumbnails(video.id);
    filenames = await generateThumbnails(filePath, video.id, retryTimestamps);

    console.log("[thumbnails] Retry produced:", filenames.length, "files");
  }

  // ── Ensure at least 4 thumbnails by duplicating the last frame if needed.
  //    This guarantees the UI always shows a full grid. ─────────────────────
  if (filenames.length > 0 && filenames.length < 4) {
    const lastFilename = filenames[filenames.length - 1];
    const lastFilePath = path.join(env.thumbnailUploadDir, lastFilename);

    while (filenames.length < 4) {
      const idx = filenames.length + 1;
      const padFilename = `${video.id}-thumb-${idx}.png`;
      const padFilePath = path.join(env.thumbnailUploadDir, padFilename);

      try {
        await fs.copyFile(lastFilePath, padFilePath);
        filenames.push(padFilename);
      } catch (copyError) {
        console.error("[thumbnails] Failed to duplicate frame:", copyError);
        break;
      }
    }
  }

  if (!filenames.length) {
    throw new AppError(
      "Thumbnail generation completed but no frames were extracted. The video file may be corrupted or too short.",
      500
    );
  }

  // Build matching timestamps array (some may have been duplicated/padded).
  const finalTimestamps = filenames.map((_f, i) =>
    i < timestamps.length ? timestamps[i] : timestamps[timestamps.length - 1]
  );

  const thumbnails = await Thumbnail.insertMany(
    filenames.map((filename, index) => ({
      filename,
      isPrimary: index === 0,
      thumbnailUrl: buildAssetUrl(baseUrl, "thumbnails", filename),
      timestampSeconds: Number(finalTimestamps[index]) || 0,
      videoId: video.id
    }))
  );

  thumbnails.forEach((thumbnail) => {
    console.log("[thumbnails] Saved:", {
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

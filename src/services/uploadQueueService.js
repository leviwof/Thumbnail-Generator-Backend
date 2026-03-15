const thumbnailService = require("./thumbnailService");
const env = require("../config/env");

const queue = [];
let isProcessing = false;

async function processNext() {
  if (isProcessing || queue.length === 0) {
    return;
  }

  isProcessing = true;

  const job = queue.shift();

  if (!job) {
    isProcessing = false;
    return;
  }

  const { videoId, baseUrl } = job;

  try {
    if (env.nodeEnv !== "test") {
      // eslint-disable-next-line no-console
      console.log("[thumbnail-queue] Processing job", { videoId });
    }

    await thumbnailService.generateThumbnailsForVideo(videoId, baseUrl);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[thumbnail-queue] Failed to process job", { videoId, error });
  } finally {
    isProcessing = false;
    // Process the next job asynchronously to avoid deep recursion.
    setImmediate(processNext);
  }
}

exports.enqueueThumbnailJob = ({ videoId, baseUrl }) => {
  queue.push({ videoId, baseUrl });

  if (env.nodeEnv !== "test") {
    // eslint-disable-next-line no-console
    console.log("[thumbnail-queue] Enqueued job", {
      videoId,
      queueLength: queue.length
    });
  }

  void processNext();
};


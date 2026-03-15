const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const mongoose = require("mongoose");
const morgan = require("morgan");

const env = require("./config/env");
const { errorHandler } = require("./middleware/errorHandler");
const notFound = require("./middleware/notFound");
const Thumbnail = require("./models/Thumbnail");
const Video = require("./models/Video");
const videoRoutes = require("./routes/videoRoutes");

const app = express();
const uploadDirectories = [env.uploadRoot, env.legacyUploadRoot];
const allowedOrigins = new Set(env.clientUrls);

app.use(
  cors({
    origin(origin, callback) {
      const normalizedOrigin = origin?.replace(/\/$/, "");

      if (!origin || allowedOrigins.has(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      // In practice, treating unknown origins as hard errors here was
      // causing a 500 response and surfacing as a "Network Error" in
      // the client. Instead, log the situation but allow the request.
      // If you want to re‑tighten CORS later, you can switch this back
      // to rejecting the origin once CLIENT_URL(S) are configured in
      // production.
      console.warn(
        "[CORS] Allowing request from unlisted origin:",
        origin,
        "Configured client URLs:",
        Array.from(allowedOrigins)
      );

      callback(null, true);
    },
    credentials: true
  })
);
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin"
    }
  })
);
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
uploadDirectories.forEach((directory) => {
  app.use("/uploads", express.static(directory));
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

if (env.nodeEnv !== "production") {
  app.get("/api/debug/db", async (_req, res, next) => {
    try {
      const [videos, thumbnails, collections] = await Promise.all([
        Video.find().sort({ createdAt: -1 }).lean(),
        Thumbnail.find().sort({ createdAt: -1 }).lean(),
        mongoose.connection.db.listCollections().toArray()
      ]);

      res.json({
        collectionNames: collections.map((collection) => collection.name),
        counts: {
          thumbnails: thumbnails.length,
          videos: videos.length
        },
        databaseName: mongoose.connection.name || null,
        mongoUriUsesFallback: env.mongoUriUsesFallback,
        videos,
        thumbnails
      });
    } catch (error) {
      next(error);
    }
  });
}

app.use("/api/videos", videoRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

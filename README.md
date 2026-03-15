# 🎬 Thumbnail Generator API — Server

A robust Node.js + Express REST API for uploading videos, extracting real thumbnails
using **FFmpeg frame extraction**, and managing a MongoDB-backed video gallery.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running the Server](#running-the-server)
- [API Reference](#api-reference)
  - [Health Check](#health-check)
  - [Videos](#videos)
  - [Thumbnails](#thumbnails)
  - [Debug (Development Only)](#debug-development-only)
- [Database Schema](#database-schema)
  - [Video Collection](#video-collection)
  - [Thumbnail Collection](#thumbnail-collection)
  - [Indexes](#indexes)
- [Thumbnail Generation — Deep Dive](#thumbnail-generation--deep-dive)
  - [How It Works](#how-it-works)
  - [Timestamp Computation](#timestamp-computation)
  - [Fallback & Padding Strategy](#fallback--padding-strategy)
  - [Timeouts & Error Handling](#timeouts--error-handling)
- [File Upload Handling](#file-upload-handling)
- [CORS Configuration](#cors-configuration)
- [Error Handling](#error-handling)
- [Async Thumbnail Queue](#async-thumbnail-queue)
- [Deployment](#deployment)
  - [Render](#render)
  - [Railway](#railway)
  - [General Production Checklist](#general-production-checklist)
- [Known Trade-offs & Limitations](#known-trade-offs--limitations)
- [Scripts](#scripts)
- [License](#license)

---

## Tech Stack

| Component       | Technology                              |
|-----------------|-----------------------------------------|
| Runtime         | Node.js v18+                            |
| Framework       | Express 4                               |
| Database        | MongoDB (Mongoose ODM)                  |
| Video Processing| fluent-ffmpeg + ffmpeg-static + ffprobe-static |
| File Uploads    | Multer (disk storage)                   |
| Security        | Helmet, CORS                            |
| Logging         | Morgan (HTTP request logger)            |
| Environment     | dotenv                                  |
| Dev Tooling     | nodemon (auto-restart on changes)       |

---

## Architecture Overview

The server follows a strict **layered architecture** with separation of concerns:

```
HTTP Request
    │
    ▼
  Routes          → Declare endpoints, wire middleware
    │
    ▼
  Controllers     → Parse HTTP input, send HTTP responses
    │
    ▼
  Services        → Business logic, database operations, FFmpeg calls
    │
    ▼
  Models          → Mongoose schemas & indexes (Video, Thumbnail)
```

**Key principles:**
- Controllers never contain business logic — they delegate to service functions.
- Services never access `req` or `res` — they work with plain data and return results.
- Errors are thrown as `AppError` instances (with HTTP status codes) and caught by the centralized error handler middleware.
- All async route handlers are wrapped with `asyncHandler` to automatically forward thrown errors to Express.

---

## Project Structure

```
server/
├── .env                          # Environment variables (git-ignored)
├── .env.example                  # Template for .env
├── .gitignore
├── package.json
├── uploads/                      # Runtime file storage (git-ignored contents)
│   ├── videos/                   # Uploaded video files
│   └── thumbnails/               # Generated thumbnail PNGs
└── src/
    ├── server.js                 # Entry point — MongoDB connection & HTTP listener
    ├── app.js                    # Express app setup — middleware, routes, CORS
    ├── config/
    │   └── env.js                # Centralized env var parsing & validation
    ├── controllers/
    │   ├── videoController.js    # Handlers: upload, list, detail, delete
    │   └── thumbnailController.js # Handlers: generate (sync/async), select
    ├── middleware/
    │   ├── errorHandler.js       # Global error response formatter
    │   ├── notFound.js           # 404 catch-all for unmatched routes
    │   └── uploadMiddleware.js   # Multer config — file filter, size limit, naming
    ├── models/
    │   ├── Video.js              # Mongoose Video schema + indexes
    │   └── Thumbnail.js          # Mongoose Thumbnail schema + indexes
    ├── routes/
    │   └── videoRoutes.js        # All /api/videos/* route definitions
    ├── services/
    │   ├── videoService.js       # CRUD operations for videos
    │   ├── thumbnailService.js   # FFmpeg-based thumbnail generation & selection
    │   └── uploadQueueService.js # In-memory async job queue for thumbnails
    ├── uploads/                  # Legacy upload directory (backwards compat)
    └── utils/
        ├── AppError.js           # Custom error class with statusCode
        ├── asyncHandler.js       # Wraps async handlers for Express error forwarding
        └── ffmpeg.js             # FFmpeg/ffprobe path configuration
```

---

## Getting Started

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | v18+    | Required for modern JS features |
| **npm**     | v9+     | Comes with Node.js |
| **MongoDB** | v6+     | Local instance **or** MongoDB Atlas cloud cluster |
| **FFmpeg**  | —       | Installed automatically via `ffmpeg-static` npm package |

> **Note:** You do **not** need to install FFmpeg on your system. The `ffmpeg-static` and `ffprobe-static` packages bundle pre-built binaries that are configured automatically at startup.

### Installation

```bash
cd server
cp .env.example .env    # Create your environment file
npm install             # Install all dependencies
```

### Environment Variables

Create a `.env` file in the `server/` directory (or copy from `.env.example`):

| Variable         | Required | Default                                       | Description |
|------------------|----------|-----------------------------------------------|-------------|
| `PORT`           | No       | `5000`                                        | Port the API server listens on |
| `MONGODB_URI`    | **Yes**  | `mongodb://127.0.0.1:27017/thumbnail-generator` (dev only) | MongoDB connection string |
| `CLIENT_URL`     | No       | `http://localhost:5173`                       | Single frontend origin for CORS |
| `CLIENT_URLS`    | No       | —                                             | Comma-separated list of allowed frontend origins (overrides `CLIENT_URL`) |
| `NODE_ENV`       | No       | `development`                                 | Set to `production` for deployed environments |

**Example `.env`:**

```env
PORT=5000
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/video_gallery?retryWrites=true&w=majority
CLIENT_URL=http://localhost:5173
CLIENT_URLS=http://localhost:5173,https://your-frontend.vercel.app
NODE_ENV=development
```

> ⚠️ **Production note:** Cloud platforms like Render and Railway do **not** read `.env` files. You must set these variables in your platform's dashboard/environment settings.

### Running the Server

```bash
# Development (with auto-restart via nodemon)
npm run dev

# Production
npm start
```

The server starts on `http://localhost:5000` by default. You'll see log output confirming:
- MongoDB connection status
- Database name
- Available collections
- API port

---

## API Reference

### Health Check

| Method | Endpoint       | Description     | Response |
|--------|---------------|-----------------|----------|
| `GET`  | `/api/health` | Health check    | `{ "status": "ok" }` |

### Videos

| Method   | Endpoint              | Description | Request Body / Params |
|----------|-----------------------|-------------|----------------------|
| `GET`    | `/api/videos`         | List all videos with optional search & tag filtering | Query: `?search=keyword&tag=tagname` |
| `GET`    | `/api/videos/:id`     | Get video detail with all thumbnails | — |
| `POST`   | `/api/videos/upload`  | Upload a video with metadata | Multipart: `video` (file), `title` (required), `description`, `tags` (comma-separated) |
| `DELETE` | `/api/videos/:id`     | Delete a video and all its thumbnails + files | — |

#### Upload Video — Request Example

```bash
curl -X POST http://localhost:5000/api/videos/upload \
  -F "video=@my-video.mp4" \
  -F "title=My Awesome Video" \
  -F "description=A short demo clip" \
  -F "tags=demo,tutorial,tech"
```

#### Upload Video — Response Example

```json
{
  "success": true,
  "videoId": "65abc123def4567890abcdef",
  "thumbnails": [],
  "video": {
    "_id": "65abc123def4567890abcdef",
    "title": "My Awesome Video",
    "description": "A short demo clip",
    "tags": ["demo", "tutorial", "tech"],
    "videoUrl": "http://localhost:5000/uploads/videos/1710000000000-my-video.mp4",
    "videoFilename": "1710000000000-my-video.mp4",
    "mimeType": "video/mp4",
    "size": 15728640,
    "primaryThumbnail": null,
    "createdAt": "2026-03-16T00:00:00.000Z",
    "updatedAt": "2026-03-16T00:00:00.000Z"
  }
}
```

#### List Videos — Response Example

```json
{
  "items": [
    {
      "_id": "65abc123def4567890abcdef",
      "title": "My Awesome Video",
      "tags": ["demo", "tutorial"],
      "primaryThumbnail": {
        "_id": "65abc456def7890123abcdef",
        "thumbnailUrl": "/uploads/thumbnails/65abc123-thumb-1.png",
        "isPrimary": true
      }
    }
  ],
  "total": 1
}
```

#### Search & Filtering

Both filters are applied server-side via MongoDB queries:

- **Search by title**: Uses `$regex` with case-insensitive matching (`$options: "i"`)
- **Filter by tag**: Exact match on the `tags` array field

```
GET /api/videos?search=tutorial&tag=demo
```

### Thumbnails

| Method | Endpoint | Description | Request Body |
|--------|----------|-------------|-------------|
| `POST` | `/api/videos/:id/thumbnails/generate` | **Synchronous** — Extract 5 thumbnails and return them immediately | — |
| `POST` | `/api/videos/:id/thumbnails/generate-async` | **Async** — Enqueue generation job, return `202 Accepted` | — |
| `POST` | `/api/videos/:id/thumbnails/select` | Set a specific thumbnail as the primary thumbnail | `{ "thumbnailId": "<id>" }` |

#### Generate Thumbnails (Sync) — Response Example

```json
{
  "videoId": "65abc123def4567890abcdef",
  "count": 5,
  "thumbnails": [
    {
      "_id": "65def789abc0123456789abc",
      "thumbnailUrl": "http://localhost:5000/uploads/thumbnails/65abc123-thumb-1.png",
      "url": "http://localhost:5000/uploads/thumbnails/65abc123-thumb-1.png",
      "filename": "65abc123-thumb-1.png",
      "timestampSeconds": 3.5,
      "isPrimary": true,
      "videoId": "65abc123def4567890abcdef"
    }
  ]
}
```

### Debug (Development Only)

| Method | Endpoint          | Description | Available |
|--------|------------------|-------------|-----------|
| `GET`  | `/api/debug/db`  | Dump all videos, thumbnails, and collection info | `NODE_ENV !== "production"` only |

---

## Database Schema

### Video Collection

| Field              | Type                    | Required | Default  | Description |
|--------------------|-------------------------|----------|----------|-------------|
| `title`            | String                  | ✅       | —        | Video title (trimmed) |
| `description`      | String                  | No       | `""`     | Video description (trimmed) |
| `tags`             | [String]                | No       | `[]`     | Array of lowercase tag strings |
| `videoUrl`         | String                  | ✅       | —        | Full URL path to the uploaded video |
| `videoFilename`    | String                  | ✅       | —        | Filename on disk |
| `mimeType`         | String                  | ✅       | —        | MIME type (e.g., `video/mp4`) |
| `size`             | Number                  | ✅       | —        | File size in bytes |
| `primaryThumbnail` | ObjectId (ref: Thumbnail)| No      | `null`   | Reference to the selected primary thumbnail |
| `createdAt`        | Date                    | Auto     | —        | Mongoose timestamp |
| `updatedAt`        | Date                    | Auto     | —        | Mongoose timestamp |

### Thumbnail Collection

| Field               | Type                    | Required | Default  | Description |
|---------------------|-------------------------|----------|----------|-------------|
| `videoId`           | ObjectId (ref: Video)   | ✅       | —        | Parent video reference (indexed) |
| `thumbnailUrl`      | String                  | ✅       | —        | Full URL path to the thumbnail image |
| `filename`          | String                  | ✅       | —        | Filename on disk |
| `timestampSeconds`  | Number                  | ✅       | —        | Timestamp in the video where the frame was extracted |
| `isPrimary`         | Boolean                 | No       | `false`  | Whether this is the currently selected primary thumbnail |
| `createdAt`         | Date                    | Auto     | —        | Mongoose timestamp |
| `updatedAt`         | Date                    | Auto     | —        | Mongoose timestamp |

### Indexes

| Collection   | Index Fields                | Purpose |
|-------------|----------------------------|---------|
| Videos      | `{ createdAt: -1 }`        | Fast reverse-chronological sorting |
| Videos      | `{ tags: 1, createdAt: -1 }` | Efficient tag-based filtering |
| Thumbnails  | `{ videoId: 1 }`           | Fast lookup of thumbnails by video |
| Thumbnails  | `{ videoId: 1, isPrimary: 1 }` | Primary thumbnail lookup |

---

## Thumbnail Generation — Deep Dive

### How It Works

Thumbnails are generated using **real frame extraction** via FFmpeg (not placeholders or random images):

```
Video File → ffprobe (read duration) → Compute 5 timestamps → ffmpeg .screenshots()
           → Verify files on disk → Persist to MongoDB → Return to client
```

1. **Duration Detection**: `ffprobe` reads the video's duration from container/stream metadata. Multiple duration sources are checked (format, streams, duration tags).
2. **Timestamp Computation**: 5 evenly-spaced timestamps are computed across the full video timeline.
3. **Frame Extraction**: FFmpeg's `.screenshots()` API extracts PNG frames at each timestamp (320×180 px resolution, 16:9 aspect ratio).
4. **Disk Verification**: Each expected output file is verified on disk before being recorded in the database.
5. **Fallback**: If fewer than expected frames are produced, the system retries with tighter timestamps near the video start.
6. **Padding**: If still under 4 frames, the last successful frame is duplicated to guarantee a minimum of 4 thumbnails.

### Timestamp Computation

```
Duration: 60 seconds, Target: 5 thumbnails
Step = Duration / (Count + 1) = 60 / 6 = 10

Timestamps: [10, 20, 30, 40, 50]
```

For very short videos (< 0.3s), small fixed offsets are used: `[0.05, 0.10, 0.15, 0.20, 0.25]`.

### Fallback & Padding Strategy

| Condition                  | Action |
|---------------------------|--------|
| ffmpeg produces < 5 frames | Retry with timestamps in first 3 seconds |
| Retry produces < 4 frames | Duplicate last successful frame to reach 4 |
| 0 frames produced         | Throw error (video likely corrupt) |

### Timeouts & Error Handling

| Operation              | Timeout   | Error |
|------------------------|-----------|-------|
| `ffprobe` metadata read | 15 seconds | `AppError(500)` — "ffprobe timed out" |
| Screenshot extraction  | 60 seconds | `AppError(500)` — "Thumbnail generation timed out" |

---

## File Upload Handling

Video uploads are handled by **Multer** with the following configuration:

| Setting            | Value |
|--------------------|-------|
| Storage            | Disk (`server/uploads/videos/`) |
| Max file size      | **100 MB** |
| Filename format    | `{timestamp}-{sanitized-original-name}.{ext}` |
| Allowed MIME types | `video/mp4`, `video/webm`, `video/ogg`, `video/quicktime`, `video/x-msvideo`, `video/x-matroska` |

The upload directories are created automatically at startup if they don't exist.

---

## CORS Configuration

CORS is configured dynamically based on environment variables:

- **`CLIENT_URL`**: Single frontend origin (e.g., `http://localhost:5173`)
- **`CLIENT_URLS`**: Comma-separated list for multiple origins (e.g., `http://localhost:5173,https://app.vercel.app`)
- **Default**: Falls back to `http://localhost:5173` if neither is set
- **Behavior**: In the current implementation, unlisted origins are logged with a warning but **allowed** (to prevent opaque "Network Error" responses during development). This can be tightened for production.

---

## Error Handling

All errors flow through a centralized error handler middleware:

| Feature | Behavior |
|---------|----------|
| Custom `AppError` | Thrown with HTTP status code + message |
| `asyncHandler` wrapper | Automatically catches promise rejections in route handlers |
| 500 errors | Logged to console with full stack trace |
| Development mode | Includes `stack` and `errors` in JSON response |
| Production mode | Only returns `success: false` and `message` |
| 404 catch-all | Returns `{ message: "Route not found." }` for unmatched routes |

---

## Async Thumbnail Queue

The server includes a simple in-memory job queue (`uploadQueueService.js`) for the async generation endpoint:

- Jobs are processed **sequentially** (one at a time) to prevent FFmpeg from overwhelming system resources.
- The queue uses `setImmediate()` to process the next job, avoiding deep recursion.
- Job failures are logged but don't crash the process.

> ⚠️ This is an in-memory queue — jobs are lost if the server restarts. For production, consider using Bull/BullMQ with Redis.

---

## Deployment

### Render

1. Set the **Root Directory** to `server/`
2. Set **Build Command** to `npm install`
3. Set **Start Command** to `npm start`
4. Add environment variables in the Render dashboard:
   - `MONGODB_URI` (required)
   - `CLIENT_URL` or `CLIENT_URLS`
   - `NODE_ENV=production`
5. Ensure MongoDB Atlas **Network Access** allows Render's IP range (or set to `0.0.0.0/0`)

### Railway

1. Point Railway to the `server/` directory
2. Set environment variables in the Railway dashboard
3. Railway auto-detects the `start` script

### General Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure `MONGODB_URI` pointing to your Atlas cluster
- [ ] Set `CLIENT_URL` / `CLIENT_URLS` to your deployed frontend URL(s)
- [ ] Ensure MongoDB Atlas Network Access is configured for your hosting provider
- [ ] Consider a CDN or cloud storage (S3/GCS) for uploaded files at scale

---

## Known Trade-offs & Limitations

| Decision | Rationale |
|----------|-----------|
| **Local disk storage** | Simplicity for current scope. Production would use S3/GCS with signed URLs |
| **No pagination** | Gallery loads all videos. Add cursor-based pagination for large datasets |
| **No auth validation** | Backend doesn't validate JWT tokens — auth is frontend-only (Clerk) |
| **No video transcoding** | Uploaded videos are served as-is. Production would transcode to HLS/DASH |
| **In-memory job queue** | Simple and effective. Replace with Bull/Redis for persistence and scalability |
| **Synchronous generation default** | Provides immediate feedback; works well for files ≤ 100 MB |
| **ffmpeg-static bundle** | Avoids system-level FFmpeg install. May not support all codecs |

---

## Scripts

| Command         | Description |
|-----------------|-------------|
| `npm run dev`   | Start the server with nodemon (auto-restart on file changes) |
| `npm start`     | Start the server in production mode |

---

## License

This project is private and not published under a public license.

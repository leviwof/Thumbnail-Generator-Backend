const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: "",
      trim: true
    },
    tags: {
      type: [String],
      default: []
    },
    videoUrl: {
      type: String,
      required: true
    },
    videoFilename: {
      type: String,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    primaryThumbnail: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Thumbnail",
      default: null
    }
  },
  {
    timestamps: true
  }
);

videoSchema.index({ createdAt: -1 });
videoSchema.index({ tags: 1, createdAt: -1 });

module.exports = mongoose.model("Video", videoSchema);

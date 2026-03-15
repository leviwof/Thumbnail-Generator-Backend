const mongoose = require("mongoose");

const thumbnailSchema = new mongoose.Schema(
  {
    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Video",
      required: true,
      index: true
    },
    thumbnailUrl: {
      type: String,
      required: true,
      trim: true
    },
    filename: {
      type: String,
      required: true
    },
    timestampSeconds: {
      type: Number,
      required: true
    },
    isPrimary: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

thumbnailSchema.index({ videoId: 1, isPrimary: 1 });

module.exports = mongoose.model("Thumbnail", thumbnailSchema);


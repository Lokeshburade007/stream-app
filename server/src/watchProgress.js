import mongoose from "mongoose";

const WatchProgressSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  mediaId: { type: String, required: true, index: true },
  positionSeconds: { type: Number, required: true, default: 0 },
  durationSeconds: { type: Number, required: true, default: 0 },
  percentage: { type: Number, default: 0 },
  completed: { type: Boolean, default: false },
  device: { type: String, default: "Web Browser" },
  updatedAt: { type: Date, default: Date.now }
});

WatchProgressSchema.index({ userId: 1, mediaId: 1 }, { unique: true });

export const WatchProgress = mongoose.models.WatchProgress || mongoose.model("WatchProgress", WatchProgressSchema);

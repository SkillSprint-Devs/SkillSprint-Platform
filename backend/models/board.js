// models/board.js
import mongoose from "mongoose";

const { Schema } = mongoose;

// --- Sub-schemas ---

// 🗒️ Sticky Notes
const StickySchema = new Schema({
  text: { type: String, required: true },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  width: { type: Number, default: 200 },
  height: { type: Number, default: 200 },
  color: { type: String, default: "#fff59d" },
  ownerId: { type: Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// 💬 Comments
const CommentSchema = new Schema({
  text: { type: String, required: true },
  authorId: { type: Schema.Types.ObjectId, ref: "User" },
  stickyId: { type: Schema.Types.ObjectId, required: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// ✏️ Strokes
const StrokeSchema = new Schema({
  tool: {
    type: String,
    enum: ["pencil", "pen", "highlighter"],
    default: "pen",
  },
  color: String,
  width: Number,
  points: [{ x: Number, y: Number }],
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
});

// 🟢 Shapes
const ShapeSchema = new Schema({
  type: {
    type: String,
    enum: ["rectangle", "circle", "line", "arrow"],
    required: true,
  },
  start: { x: Number, y: Number },
  end: { x: Number, y: Number },
  color: String,
  width: Number,
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
});

// 🔔 Notifications
const NotificationSchema = new Schema({
  text: String,
  type: {
    type: String,
    enum: ["mention", "permission", "sticky", "comment", "reminder"],
    default: "reminder",
  },
  triggeredBy: { type: Schema.Types.ObjectId, ref: "User" },
  time: { type: Date, default: Date.now },
  readBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
});

// 🎥 Recordings
const RecordingSchema = new Schema({
  fileUrl: String,
  createdAt: { type: Date, default: Date.now },
  duration: Number,
  savedBy: { type: Schema.Types.ObjectId, ref: "User" },
});

// --- 🧠 Main Board Schema ---
const BoardSchema = new Schema(
  {
    name: { type: String, required: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],

    permissions: {
      editors: [{ type: Schema.Types.ObjectId, ref: "User" }],
      commenters: [{ type: Schema.Types.ObjectId, ref: "User" }],
      viewers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    },

    // Embedded arrays
    stickies: [StickySchema],
    comments: [CommentSchema],
    strokes: [StrokeSchema],
    shapes: [ShapeSchema],
    notifications: [NotificationSchema],
    recordings: [RecordingSchema],

    // Optional preview image
    lastSavedImage: { type: String },

    // Collaboration metadata
    activeUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    lastEditedBy: { type: Schema.Types.ObjectId, ref: "User" },

    // Public Share Link
    shareLink: {
      token: { type: String },
      role: { type: String, enum: ["viewer", "editor", "none"], default: "none" },
      isActive: { type: Boolean, default: false },
    },
  },
  { timestamps: true } // auto-manages createdAt + updatedAt
);

// --- Middleware ---
// Automatically update `updatedAt` on findOneAndUpdate too
BoardSchema.pre("findOneAndUpdate", function (next) {
  this.set({ updatedAt: Date.now() });
  next();
});

// Indexes for fast lookups
BoardSchema.index({ owner: 1 });
BoardSchema.index({ members: 1 });

// FIX: Safe export - prevents "Cannot overwrite model" error
const Board = mongoose.models.Board || mongoose.model("Board", BoardSchema);
export default Board;
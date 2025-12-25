import express from "express";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import multer from "multer";
import Board from "../models/board.js";
import Library from "../models/library.js";
import User from "../models/user.js";
import Notification from "../models/notification.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { sendBoardInvite } from "../utils/mailService.js";
import crypto from 'crypto'; // Needed for token generation if not already imported

import { storage } from "../config/cloudinary.js";

// Multer config for recordings
const upload = multer({ storage });

const router = express.Router();


// async wrapper to avoid repeating try/catch
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Keep permission helper inline for now
function hasPermission(board, userId, roles = []) {
  if (!board || !userId) return false;
  const id = userId.toString();
  if (roles.includes("owner") && board.owner?.toString() === id) return true;
  const perm = board.permissions || {};
  if (roles.includes("editor") && perm.editors?.some((e) => e.toString() === id))
    return true;
  if (roles.includes("commenter") && perm.commenters?.some((c) => c.toString() === id))
    return true;
  if (
    roles.includes("viewer") &&
    (perm.viewers?.some((v) => v.toString() === id) ||
      board.members?.some((m) => m.toString() === id))
  )
    return true;
  return false;
}

// socket emitter
function emitBoard(io, boardId, event, payload) {
  try {
    if (!io) return;
    io.to(boardId.toString()).emit(event, payload);
  } catch (e) {
    console.error("Emit error:", e);
  }
}


//Utility validation helpers


const ensureObjectId = (id) => {
  try {
    return mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
};


//  BOARD CRUD


// Create a new board
router.post(
  "/create",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim())
      return res.status(400).json({ success: false, message: "Name is required" });

    const owner = req.user.id;
    const newBoard = new Board({
      name: name.trim(),
      owner,
      members: [owner],
      permissions: { editors: [owner], commenters: [], viewers: [] },
    });

    await newBoard.save();

    const io = req.app.get("io");

    emitBoard(io, owner, "board:created", { board: newBoard });

    res.status(201).json({ success: true, data: newBoard });
  })
);


router.get(
  "/all",
  verifyToken,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const skip = (page - 1) * limit;

    const boards = await Board.find({
      $or: [
        { owner: userId },
        { members: userId },
        { "permissions.editors": userId },
        { "permissions.commenters": userId },
        { "permissions.viewers": userId },
      ],
    })
      .select("name owner createdAt updatedAt lastSavedImage")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({ success: true, data: boards, page, limit });
  })
);


// STICKIES CRUD


// Add sticky (owner/editor/commenter)
router.post(
  "/:id/sticky",
  verifyToken,
  asyncHandler(async (req, res) => {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor", "commenter"]))
      return res.status(403).json({ success: false, message: "Permission denied" });


    if (board.stickies && board.stickies.length >= 2000) {
      return res.status(400).json({ success: false, message: "Sticky limit reached" });
    }

    const {
      text,
      x = 0,
      y = 0,
      width = 200,
      height = 200,
      color = "#fff59d",
    } = req.body;

    // Text is no longer strictly required for placeholders
    const stickyText = text ? String(text) : "";

    const sticky = {
      text: stickyText,
      x: Number(x),
      y: Number(y),
      width: Number(width),
      height: Number(height),
      color: String(color),
      ownerId: req.user.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    board.stickies.push(sticky);
    await board.save();

    const newSticky = board.stickies[board.stickies.length - 1];
    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board:sticky:created", { sticky: newSticky });

    res.status(201).json({ success: true, data: newSticky });
  })
);

// Update sticky
router.put(
  "/:id/sticky/:stickyId",
  verifyToken,
  asyncHandler(async (req, res) => {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    const sticky = board.stickies.id(req.params.stickyId);
    if (!sticky) return res.status(404).json({ success: false, message: "Sticky not found" });

    // Only owner/editor or sticky owner can update
    if (
      !(
        hasPermission(board, req.user.id, ["owner", "editor"]) ||
        sticky.ownerId?.toString() === req.user.id
      )
    ) {
      return res.status(403).json({ success: false, message: "Permission denied" });
    }

    // Accept only white-listed fields to avoid accidental overwrite
    const updatable = ["text", "x", "y", "width", "height", "color"];
    updatable.forEach((k) => {
      if (req.body[k] !== undefined) {
        sticky[k] = req.body[k];
      }
    });
    sticky.updatedAt = Date.now();

    await board.save();

    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board:sticky:updated", { sticky });

    res.json({ success: true, data: sticky });
  })
);

// Delete sticky
router.delete(
  "/:id/sticky/:stickyId",
  verifyToken,
  asyncHandler(async (req, res) => {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    const sticky = board.stickies.id(req.params.stickyId);
    if (!sticky) return res.status(404).json({ success: false, message: "Sticky not found" });

    if (
      !(
        hasPermission(board, req.user.id, ["owner", "editor"]) ||
        sticky.ownerId?.toString() === req.user.id
      )
    ) {
      return res.status(403).json({ success: false, message: "Permission denied" });
    }

    sticky.remove();
    await board.save();

    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board:sticky:deleted", { stickyId: req.params.stickyId });

    res.json({ success: true, message: "Sticky deleted" });
  })
);

/* 
   COMMENTS CRUD
*/

// Get comments for board (sorted desc)
router.get(
  "/:id/comments",
  verifyToken,
  asyncHandler(async (req, res) => {
    const board = await Board.findById(req.params.id).populate("comments.authorId", "name avatarUrl colorTag");
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor", "commenter", "viewer"]))
      return res.status(403).json({ success: false, message: "Permission denied" });

    const sorted = [...board.comments].sort((a, b) => b.createdAt - a.createdAt);
    res.json({ success: true, data: sorted });
  })
);

// Add comment
router.post(
  "/:id/comment",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { text, stickyId } = req.body;
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor", "commenter"]))
      return res.status(403).json({ success: false, message: "Permission denied" });

    // Comment text can be empty momentarily or just a placeholder
    const commentText = text ? String(text) : "";

    // If stickyId provided, ensure it exists
    if (stickyId && !board.stickies.id(stickyId))
      return res.status(400).json({ success: false, message: "Invalid stickyId" });

    const comment = {
      text: commentText,
      authorId: req.user.id,
      stickyId: stickyId || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    board.comments.push(comment);
    await board.save();

    const newComment = board.comments[board.comments.length - 1];
    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board:comment:created", { comment: newComment });

    res.status(201).json({ success: true, data: newComment });
  })
);

// Update comment
router.put(
  "/:id/comment/:commentId",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { text } = req.body;
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    const comment = board.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, message: "Comment not found" });

    // Only author or board owner can edit
    if (comment.authorId.toString() !== req.user.id && board.owner.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Permission denied" });
    }

    if (text && String(text).trim()) comment.text = String(text);
    comment.updatedAt = Date.now();

    await board.save();

    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board:comment:updated", { comment });

    res.json({ success: true, data: comment });
  })
);

// Delete comment
router.delete(
  "/:id/comment/:commentId",
  verifyToken,
  asyncHandler(async (req, res) => {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    const comment = board.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, message: "Comment not found" });

    // Only author or board owner can delete
    if (comment.authorId.toString() !== req.user.id && board.owner.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Permission denied" });
    }

    comment.remove();
    await board.save();

    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board:comment:deleted", { commentId: req.params.commentId });

    res.json({ success: true, message: "Comment deleted" });
  })
);

/* 
   STROKES (drawing)
*/

// Add a stroke 
router.post(
  "/:id/stroke",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { tool = "pen", color, width, points } = req.body;
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor"]))
      return res.status(403).json({ success: false, message: "Permission denied" });


    if (!Array.isArray(points) || points.length === 0)
      return res.status(400).json({ success: false, message: "Points required" });


    if (board.strokes && board.strokes.length > 50000)
      return res.status(400).json({ success: false, message: "Too many strokes; consider cleaning history" });

    const stroke = {
      tool: String(tool),
      color: color || "#000",
      width: Number(width || 1),
      points: points.map((p) => ({ x: Number(p.x), y: Number(p.y) })),
      userId: req.user.id,
      createdAt: Date.now(),
    };

    board.strokes.push(stroke);
    await board.save();

    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board:stroke:added", { stroke });

    res.status(201).json({ success: true, data: stroke });
  })
);

// Delete stroke by id 
router.delete(
  "/:id/stroke/:strokeId",
  verifyToken,
  asyncHandler(async (req, res) => {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor"]))
      return res.status(403).json({ success: false, message: "Permission denied" });

    const stroke = board.strokes.id(req.params.strokeId);
    if (!stroke) return res.status(404).json({ success: false, message: "Stroke not found" });

    stroke.remove();
    await board.save();

    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board:stroke:removed", { strokeId: req.params.strokeId });

    res.json({ success: true, message: "Stroke removed" });
  })
);

/* 
   SHAPES
*/

// Add shape (owner/editor)
router.post(
  "/:id/shape",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { type, start, end, color, width } = req.body;
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor"]))
      return res.status(403).json({ success: false, message: "Permission denied" });

    if (!type || !["rectangle", "circle", "line", "arrow"].includes(type))
      return res.status(400).json({ success: false, message: "Invalid shape type" });

    const shape = {
      type,
      start: { x: Number(start?.x || 0), y: Number(start?.y || 0) },
      end: { x: Number(end?.x || 0), y: Number(end?.y || 0) },
      color: color || "#000",
      width: Number(width || 1),
      userId: req.user.id,
      createdAt: Date.now(),
    };

    board.shapes.push(shape);
    await board.save();

    const newShape = board.shapes[board.shapes.length - 1];
    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board:shape:added", { shape: newShape });

    res.status(201).json({ success: true, data: newShape });
  })
);

// Delete shape (owner/editor)
router.delete(
  "/:id/shape/:shapeId",
  verifyToken,
  asyncHandler(async (req, res) => {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor"]))
      return res.status(403).json({ success: false, message: "Permission denied" });

    const shape = board.shapes.id(req.params.shapeId);
    if (!shape) return res.status(404).json({ success: false, message: "Shape not found" });

    shape.remove();
    await board.save();

    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board:shape:removed", { shapeId: req.params.shapeId });

    res.json({ success: true, message: "Shape removed" });
  })
);

//NOTIFICATIONS

// Get notifications
router.get(
  "/:id/notifications",
  verifyToken,
  asyncHandler(async (req, res) => {
    const board = await Board.findById(req.params.id).select("notifications");
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor", "commenter", "viewer"]))
      return res.status(403).json({ success: false, message: "Permission denied" });

    res.json({ success: true, data: board.notifications || [] });
  })
);

// Add notification
router.post(
  "/:id/notification",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { text, type } = req.body;
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    // basic permission: any member can trigger notifications
    if (!hasPermission(board, req.user.id, ["owner", "editor", "commenter", "viewer"]))
      return res.status(403).json({ success: false, message: "Permission denied" });

    const notif = {
      text: String(text || ""),
      type: ["mention", "permission", "sticky", "comment", "reminder"].includes(type) ? type : "reminder",
      triggeredBy: req.user.id,
      time: Date.now(),
      readBy: [],
    };

    board.notifications.push(notif);
    await board.save();

    const newNotif = board.notifications[board.notifications.length - 1];
    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board:notification:added", { notification: newNotif });

    res.status(201).json({ success: true, data: newNotif });
  })
);

// Delete notification (owner or creator)
router.delete(
  "/:id/notification/:notifId",
  verifyToken,
  asyncHandler(async (req, res) => {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    const notif = board.notifications.id(req.params.notifId);
    if (!notif) return res.status(404).json({ success: false, message: "Notification not found" });

    if (board.owner.toString() !== req.user.id && notif.triggeredBy?.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Permission denied" });
    }

    notif.remove();
    await board.save();

    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board:notification:removed", { notifId: req.params.notifId });

    res.json({ success: true, message: "Notification deleted" });
  })
);

// Mark all notifications as read by current user
router.put(
  "/:id/notifications/read",
  verifyToken,
  asyncHandler(async (req, res) => {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor", "commenter", "viewer"]))
      return res.status(403).json({ success: false, message: "Permission denied" });

    const uid = req.user.id;
    board.notifications.forEach((n) => {
      if (!n.readBy.map(String).includes(uid)) {
        n.readBy.push(uid);
      }
    });

    await board.save();
    res.json({ success: true, message: "Notifications marked as read" });
  })
);

/* 
   RECORDINGS
*/

// Start recording (owner/editor)
router.post(
  "/:id/recording/start",
  verifyToken,
  asyncHandler(async (req, res) => {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor"]))
      return res.status(403).json({ success: false, message: "Permission denied" });

    const rec = {
      startedAt: Date.now(),
      endedAt: null,
      fileUrl: null,
      duration: null,
      savedBy: req.user.id,
      createdAt: Date.now(),
    };

    board.recordings.push(rec);
    await board.save();

    const newRec = board.recordings[board.recordings.length - 1];
    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board:recording:started", { recording: newRec });

    res.status(201).json({ success: true, data: newRec });
  })
);

// Stop recording (owner/editor or recording starter)
router.post(
  "/:id/recording/stop",
  verifyToken,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const { recordingId, duration } = req.body;
    if (!recordingId) return res.status(400).json({ success: false, message: "recordingId required" });

    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    const recording = board.recordings.id(recordingId);
    if (!recording) return res.status(404).json({ success: false, message: "Recording not found" });

    // only recorder starter or owner/editor can finalize
    if (recording.savedBy?.toString() !== req.user.id && !hasPermission(board, req.user.id, ["owner", "editor"])) {
      return res.status(403).json({ success: false, message: "Permission denied" });
    }

    recording.endedAt = Date.now();

    // If a file was uploaded, set the URL
    if (req.file) {
      recording.fileUrl = `${req.protocol}://${req.get("host")}/uploads/recordings/${req.file.filename}`;
    }

    if (duration !== undefined) recording.duration = Number(duration);

    await board.save();

    // Automatically add to Library
    try {
      const user = await User.findById(req.user.id);
      const libraryEntry = new Library({
        user_id: req.user.id,
        title: `Board Recording - ${board.name}`,
        description: `Automated recording from board "${board.name}"`,
        type: "Recording",
        file_url: recording.fileUrl,
        file_size: req.file ? req.file.size : 0,
        file_ext: req.file ? path.extname(req.file.originalname).toLowerCase() : ".webm",
        visibility: "Private",
        owner_name: user ? user.name : "Unknown",
      });
      await libraryEntry.save();
      console.log(`Recording auto-saved to Library for user ${req.user.id}`);
    } catch (err) {
      console.error("Error auto-saving recording to library:", err);
    }

    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board:recording:stopped", { recording });

    res.json({ success: true, data: recording });
  })
);

// Bulk Save Canvas State
router.post(
  "/:id/save-state",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { stickies, strokes, shapes, textBoxes, lastSavedImage } = req.body;
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor"]))
      return res.status(403).json({ success: false, message: "Permission denied" });

    if (stickies) board.stickies = stickies;
    if (strokes) board.strokes = strokes;
    if (shapes) board.shapes = shapes;
    if (textBoxes) board.textBoxes = textBoxes;
    if (lastSavedImage) board.lastSavedImage = lastSavedImage;

    await board.save();

    res.json({ success: true, message: "Board state saved successfully" });
  })
);

// Get recordings
router.get(
  "/:id/recordings",
  verifyToken,
  asyncHandler(async (req, res) => {
    const board = await Board.findById(req.params.id).select("recordings");
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor", "commenter", "viewer"]))
      return res.status(403).json({ success: false, message: "Permission denied" });

    res.json({ success: true, data: board.recordings || [] });
  })
);

// Delete recording (owner or recorder)
router.delete(
  "/:id/recording/:recId",
  verifyToken,
  asyncHandler(async (req, res) => {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    const rec = board.recordings.id(req.params.recId);
    if (!rec) return res.status(404).json({ success: false, message: "Recording not found" });

    if (board.owner.toString() !== req.user.id && rec.savedBy?.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Permission denied" });
    }

    rec.remove();
    await board.save();

    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board:recording:deleted", { recId: req.params.recId });

    res.json({ success: true, message: "Recording deleted" });
  })
);

// Get a single board (full)
router.get(
  "/:id",
  verifyToken,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const board = await Board.findById(id)
      .populate("owner", "name email avatarUrl colorTag")
      .populate("members", "name email avatarUrl colorTag")
      .populate("stickies.ownerId", "name avatarUrl colorTag")
      .populate("comments.authorId", "name avatarUrl colorTag");
    // Removed expensive strokes/shapes population for performance

    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor", "commenter", "viewer"]))
      return res.status(403).json({ success: false, message: "Access denied" });

    res.json({ success: true, data: board });
  })
);

// Update board metadata or permissions (owner only)
router.put(
  "/:id",
  verifyToken,
  asyncHandler(async (req, res) => {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    if (board.owner.toString() !== req.user.id)
      return res.status(403).json({ success: false, message: "Only owner can update board" });

    const { name, permissions, lastSavedImage } = req.body;
    if (typeof name === "string" && name.trim()) board.name = name.trim();
    if (permissions) board.permissions = permissions;
    if (lastSavedImage) board.lastSavedImage = lastSavedImage;

    await board.save();

    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board:permissions:updated", {
      boardId: req.params.id,
      permissions: board.permissions,
    });

    res.json({ success: true, data: board });
  })
);

// Delete board (owner only)
router.delete(
  "/:id",
  verifyToken,
  asyncHandler(async (req, res) => {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    if (board.owner.toString() !== req.user.id)
      return res.status(403).json({ success: false, message: "Only owner can delete board" });

    await board.deleteOne();

    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board:deleted", { boardId: req.params.id });

    res.json({ success: true, message: "Board deleted" });
  })
);

// Generate/Update Share Link
router.post(
  "/:id/share",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { role } = req.body; // role: 'viewer'|'editor'
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    if (board.owner.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Only owner can share" });
    }

    // Generate new token if not exists
    let token = board.shareLink?.token;
    if (!token) {
      const crypto = await import("crypto");
      token = crypto.randomBytes(16).toString("hex");
    }

    board.shareLink = {
      token,
      role: role || board.shareLink?.role || "viewer",
      isActive: true, // Always active if generating
    };

    await board.save();

    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board:share:updated", { shareLink: board.shareLink });

    res.json({ success: true, data: board.shareLink });
  })
);

// Invite to Board (New Endpoint)
router.post(
  "/:id/invite",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { userIds, role } = req.body; // userIds: [string]
    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ success: false, message: "userIds array required" });
    }

    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ success: false, message: "Board not found" });

    if (board.owner.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Only owner can invite" });
    }

    const inviter = await User.findById(req.user.id).select("name");

    // Generate unique share token if not exists (or reuse)
    let token = board.shareLink?.token;
    if (!token) {
      const crypto = await import("crypto");
      token = crypto.randomBytes(16).toString("hex");
      board.shareLink = {
        token,
        role: role || "viewer",
        isActive: true
      };
      await board.save();
    }

    // Determine share URL
    const shareUrl = `${req.protocol}://${req.get('host')}/board?join=${token}`;

    const sentInvites = [];

    // Process each user
    await Promise.all(userIds.map(async (uid) => {
      const user = await User.findById(uid);
      if (!user) return;

      // Add to permissions/members if desired? 
      // Typically invites just notify and send link. 
      // Actual permission added when they CLICK accept/join.
      // But we can preemptively add them if we want.
      // Let's stick to notification + email.

      // Email
      await sendBoardInvite(user.email, {
        inviterName: inviter.name,
        boardName: board.name,
        shareUrl
      });

      // In-App Notification
      const notif = new Notification({
        user_id: uid,
        title: "Board Invite",
        message: `${inviter.name} invited you to board "${board.name}"`,
        type: "invite",
        link: `/board?join=${token}`
      });
      await notif.save();

      // Socket Notification
      const io = req.app.get("io");
      if (io) {
        io.to(uid).emit("notification", notif);
      }

      sentInvites.push(uid);
    }));

    res.json({ success: true, message: `Invited ${sentInvites.length} users`, sentInvites });
  })
);

// Join Board via Token
router.post(
  "/join",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: "Token required" });

    const board = await Board.findOne({ "shareLink.token": token, "shareLink.isActive": true });
    if (!board) return res.status(404).json({ success: false, message: "Invalid or expired link" });

    const userId = req.user.id;
    const role = board.shareLink.role; // 'viewer' | 'editor'

    // Add to members if not present
    let changed = false;
    if (!board.members.some((m) => m.toString() === userId)) {
      board.members.push(userId);
      changed = true;
    }

    // Grant specific permission
    // Remove from other lists to avoid conflicts? Usually additive is fine, but cleaner to move.
    // For simplicity, just ensure they are in the target list.
    if (role === "editor") {
      if (!board.permissions.editors.some((id) => id.toString() === userId)) {
        board.permissions.editors.push(userId);
        changed = true;
      }
    } else {
      // Viewer
      if (!board.permissions.viewers.some((id) => id.toString() === userId)) {
        board.permissions.viewers.push(userId);
        changed = true;
      }
    }

    if (changed) {
      await board.save();

      // Create notification for user who joined
      try {
        const notification = new Notification({
          user_id: userId,
          title: "Board Access Granted",
          message: `You have joined the board "${board.name}" as ${role}`,
          type: "invite",
          link: `/board?id=${board._id}`,
        });
        await notification.save();

        const io = req.app.get("io");
        if (io) {
          io.to(userId.toString()).emit("notification", notification);
        }
      } catch (notifErr) {
        console.error("Failed to create board join notification:", notifErr);
      }

      const io = req.app.get("io");
      // Emit member joined
      // Re-read full user info? 
      // For now just partial
      emitBoard(io, board._id, "board:member:joined", { userId });
    }

    res.json({ success: true, data: { boardId: board._id } });
  })
);


export default router;

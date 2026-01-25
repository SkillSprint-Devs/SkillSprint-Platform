// routes/pair-programmingRoutes.js
import express from "express";
import mongoose from "mongoose";
import User from "../models/user.js";
import PairProgramming from "../models/pair-programming.js";
import Notification from "../models/notification.js";
import { updateStreak } from "../utils/streakHelper.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { exec } from "child_process";
import { sendPairProgrammingInvite } from "../utils/mailService.js";
import fs from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

import Invitation from "../models/Invitation.js";
const router = express.Router();
// console.log("RUNNER ROUTE FILE LOADED:", __filename);


function hasPermission(board, userId, roles = []) {
  if (!board) return false;
  const id = userId.toString();
  const normalizedRoles = roles.map(r => r.toLowerCase());

  const ownerId = board.owner?._id ? board.owner._id.toString() : board.owner.toString();
  const editors = (board.permissions?.editors || []).map(e => e._id ? e._id.toString() : e.toString());
  const commenters = (board.permissions?.commenters || []).map(c => c._id ? c._id.toString() : c.toString());
  const viewers = (board.permissions?.viewers || []).map(v => v._id ? v._id.toString() : v.toString());
  const members = (board.members || []).map(m => m._id ? m._id.toString() : m.toString());

  if (normalizedRoles.includes("owner") && ownerId === id) return true;
  if (normalizedRoles.includes("editor") && editors.includes(id)) return true;
  if (normalizedRoles.includes("commenter") && commenters.includes(id)) return true;
  if (normalizedRoles.includes("viewer") && (viewers.includes(id) || members.includes(id))) return true;
  return false;
}

function emitBoard(io, boardId, event, payload) {
  try {
    io.of("/pair-programming").to(boardId.toString()).emit(event, payload);
  } catch (e) {
    console.error("Emit error", e);
  }
}

/* ---------------- BOARD CRUD ---------------- */

router.post("/create", verifyToken, async (req, res) => {
  try {
    const { name, description } = req.body;
    const owner = req.user.id;

    const newBoard = new PairProgramming({
      name,
      description,
      owner,
      members: [owner],
      permissions: { editors: [owner], commenters: [], viewers: [] },
      folders: [
        {
          name: "src",
          files: [
            {
              name: "index.js",
              content: "// Start coding here\nconsole.log('Hello World!');",
              language: "js",
              comments: [],
              runs: [],
            },
          ],
          comments: [],
        },
      ],
      comments: [],
    });

    await newBoard.save();

    const io = req.app.get("io");
    emitBoard(io, newBoard._id, "board-created", { board: newBoard });

    res.status(201).json({ success: true, data: newBoard });
  } catch (err) {
    console.error("Error creating board:", err);
    res.status(500).json({ message: "Error creating board", error: err.message });
  }
});

router.get("/all", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const boards = await PairProgramming.find({
      $or: [
        { owner: userId },
        { members: userId },
        { "permissions.editors": userId },
        { "permissions.commenters": userId },
        { "permissions.viewers": userId },
      ],
    }).select("name owner createdAt updatedAt members")
      .populate("owner", "name profile_image");

    res.json(boards);
  } catch (err) {
    console.error("Error fetching boards:", err);
    res.status(500).json({ message: "Error fetching boards", error: err.message });
  }
});

router.get("/:id", verifyToken, async (req, res) => {
  try {
    console.log("GET /:id - Fetching board:", req.params.id);

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid Board ID" });
    }

    const board = await PairProgramming.findById(req.params.id)
      .populate("owner", "name email profile_image avatarUrl colorTag")
      .populate("members", "name email profile_image avatarUrl colorTag")
      .populate("permissions.editors", "name email profile_image avatarUrl colorTag")
      .populate("permissions.commenters", "name email profile_image avatarUrl colorTag")
      .populate("permissions.viewers", "name email profile_image avatarUrl colorTag")
      .populate("comments.authorId", "name email profile_image avatarUrl colorTag")
      // Also populate comments inside folders/files
      .populate("folders.files.comments.authorId", "name email profile_image avatarUrl colorTag");

    if (!board) {
      console.log("Board not found:", req.params.id);
      return res.status(404).json({ message: "Board not found" });
    }

    if (!hasPermission(board, req.user.id, ["owner", "editor", "commenter", "viewer"])) {
      console.log("Access denied for user:", req.user.id);
      return res.status(403).json({ message: "Access denied" });
    }

    console.log("Board found and returned:", board.name);
    res.json(board);
  } catch (err) {
    console.error("Error fetching board:", err);
    res.status(500).json({ message: "Error fetching board", error: err.message });
  }
});

router.put("/:id", verifyToken, async (req, res) => {
  try {
    const board = await PairProgramming.findById(req.params.id);
    if (!board) return res.status(404).json({ message: "Board not found" });
    if (board.owner.toString() !== req.user.id)
      return res.status(403).json({ message: "Only owner can update board" });

    const { name, description, permissions } = req.body;
    if (name) board.name = name;
    if (description) board.description = description;
    if (permissions) board.permissions = permissions;

    await board.save();

    const io = req.app.get("io");
    emitBoard(io, board._id, "board-updated", { board });

    res.json(board);
  } catch (err) {
    console.error("Error updating board:", err);
    res.status(500).json({ message: "Error updating board", error: err.message });
  }
});

router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const board = await PairProgramming.findById(req.params.id);
    if (!board) return res.status(404).json({ message: "Board not found" });
    if (board.owner.toString() !== req.user.id)
      return res.status(403).json({ message: "Only owner can delete board" });

    await board.deleteOne();
    const io = req.app.get("io");
    emitBoard(io, req.params.id, "board-deleted", { boardId: req.params.id });

    res.json({ message: "Board deleted" });
  } catch (err) {
    console.error("Error deleting board:", err);
    res.status(500).json({ message: "Error deleting board", error: err.message });
  }
});

import Chat from "../models/chat.js";

// ... existing code ...

// Search users to invite
router.get("/users/search", verifyToken, async (req, res) => {
  try {
    const { query } = req.query;
    const myId = req.user.id;

    if (!query || query.length < 2) return res.json([]);

    const users = await User.find({
      $and: [
        { _id: { $ne: myId } },
        {
          $or: [
            { name: { $regex: query, $options: "i" } },
            { email: { $regex: query, $options: "i" } },
          ]
        }
      ]
    }).select("name email profile_image avatarUrl colorTag").limit(10);

    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error searching users", error: err.message });
  }
});

// Generate Share Link
router.post("/:id/share", verifyToken, async (req, res) => {
  try {
    const { permission } = req.body;
    const board = await PairProgramming.findById(req.params.id);

    if (!board) return res.status(404).json({ message: "Board not found" });
    if (board.owner.toString() !== req.user.id)
      return res.status(403).json({ message: "Only owner can generate share links" });

    // Generate token
    const shareToken = crypto.randomBytes(32).toString('hex');

    // Defensive init
    if (!Array.isArray(board.shareLinks)) {
      board.shareLinks = [];
    }
    board.markModified('shareLinks');

    board.shareLinks.push({
      token: shareToken,
      permission: permission || 'viewer',
      createdBy: req.user.id,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });

    await board.save();

    const shareUrl = `${req.protocol}://${req.get('host')}/pair-programming.html?join=${shareToken}`;

    res.json({
      success: true,
      shareUrl
    });
  } catch (err) {
    console.error("Error generating share link:", err);
    res.status(500).json({ message: "Error generating share link", error: err.message });
  }
});

// Invite users
router.post("/:id/invite", verifyToken, async (req, res) => {
  try {
    const { userIds, permission } = req.body; // array of user IDs
    const board = await PairProgramming.findById(req.params.id);

    if (!board) return res.status(404).json({ message: "Board not found" });
    if (board.owner.toString() !== req.user.id)
      return res.status(403).json({ message: "Only owner can invite" });

    const inviter = await User.findById(req.user.id).select("name");

    // Generate token
    const shareToken = crypto.randomBytes(32).toString('hex');

    // Defensive init: Ensure it's an array
    if (!Array.isArray(board.shareLinks)) {
      board.shareLinks = [];
    }

    // Explicitly mark as modified if using Mongoose doc this way, just in case
    board.markModified('shareLinks');

    board.shareLinks.push({
      token: shareToken,
      permission: permission || 'viewer',
      createdBy: req.user.id,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });

    await board.save();

    const shareUrl = `${req.protocol}://${req.get('host')}/pair-programming.html?join=${shareToken}`;

    // Permission descriptions
    const permMap = {
      'viewer': "View Only",
      'editor': "Can Edit Files",
      'commenter': "Can Comment",
      'owner': "Full Access"
    };
    // The request asked for: View Only, Can Edit Files, Can Run/Execute Code, Can Manage Files/Project.
    // Our model supports 'editor', 'commenter', 'viewer'. 
    // Let's assume 'editor' = Can Edit + Run. 
    // We'll stick to our internal roles but describe them as requested.
    let permDesc = permMap[permission] || "View Only";
    if (permission === 'editor') permDesc = "Can Edit Files, Run Code";

    // ... inside loop ...
    // 1. Create Notifications & Send Emails & Create Invitations
    const notificationPromises = userIds.map(async (userId) => {
      // Fetch user details for email
      const invitee = await User.findById(userId).select("email name");

      // Create Invitation for Pending State
      const existingInv = await Invitation.findOne({
        sender: req.user.id,
        recipient: userId,
        projectType: 'PairProgramming',
        projectId: board._id,
        status: 'pending'
      });

      if (!existingInv) {
        await Invitation.create({
          sender: req.user.id,
          recipient: userId,
          projectType: 'PairProgramming',
          projectId: board._id,
          status: 'pending',
          permission: permission || 'viewer'
        });
      }

      if (invitee) {
        // Send Email
        await sendPairProgrammingInvite(invitee.email, {
          inviterName: inviter.name,
          projectName: board.name,
          shareUrl // Still useful if they want to direct join, but UI will direct to collaborations
        });
      }

      const notification = new Notification({
        user_id: userId,
        title: "Pair Programming Invite",
        message: `${inviter?.name || 'Someone'} invited you to join \"${board.name}\"`,
        type: "invite",
        link: `/collaborations.html`, // Redirect to collaborations to accept/decline
      });
      await notification.save();
      return notification;
    });
    const savedNotifications = await Promise.all(notificationPromises);

    // 2. Send Chat Messages (Direct Message)
    const chatMessages = userIds.map(userId => ({
      sender: req.user.id,
      recipient: userId,
      content: `I'm inviting you to collaborate on my project "${board.name}".\n\n**Permissions:** ${permDesc}\n\n[Click here to join](${shareUrl})`
    }));
    await Chat.insertMany(chatMessages);

    // Emit real-time events
    const io = req.app.get("io");
    userIds.forEach((userId, index) => {
      // Notification event
      io.to(userId.toString()).emit("notification", savedNotifications[index]);
      // Chat event (simple trigger to refresh chats if open)
      io.to(userId.toString()).emit("chat:message", {
        sender: req.user.id,
        content: chatMessages[index].content
      });
    });

    res.json({
      success: true,
      message: `Invited ${userIds.length} users via Chat & Notifications`,
      shareUrl
    });
  } catch (err) {
    console.error("Error inviting users:", err);
    res.status(500).json({ message: "Error inviting users", error: err.message });
  }
});

// Get user's followers for invite
router.get("/followers", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate("followers", "name email profilePicture");

    res.json(user.followers || []);
  } catch (err) {
    console.error("Error fetching followers:", err);
    res.status(500).json({ message: "Error fetching followers", error: err.message });
  }
});

/* ---------------- FOLDER CRUD ---------------- */

router.post("/:id/folder", verifyToken, async (req, res) => {
  try {
    const board = await PairProgramming.findById(req.params.id);
    if (!board) return res.status(404).json({ message: "Board not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor"]))
      return res.status(403).json({ message: "Permission denied" });

    const folder = { name: req.body.name, files: [] };
    board.folders.push(folder);
    await board.save();

    const newFolder = board.folders[board.folders.length - 1];
    const io = req.app.get("io");
    emitBoard(io, req.params.id, "folder-created", { folder: newFolder });

    res.status(201).json(newFolder);
  } catch (err) {
    console.error("Error creating folder:", err);
    res.status(500).json({ message: "Error creating folder", error: err.message });
  }
});

router.get("/:id/folder/:folderId", verifyToken, async (req, res) => {
  try {
    const board = await PairProgramming.findById(req.params.id);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const folder = board.folders.id(req.params.folderId);
    if (!folder) return res.status(404).json({ message: "Folder not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor", "commenter", "viewer"])) {
      return res.status(403).json({ message: "Permission denied" });
    }

    res.json(folder);
  } catch (err) {
    console.error("Error fetching folder:", err);
    res.status(500).json({ message: "Error fetching folder", error: err.message });
  }
});

router.put("/:id/folder/:folderId", verifyToken, async (req, res) => {
  try {
    const board = await PairProgramming.findById(req.params.id);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const folder = board.folders.id(req.params.folderId);
    if (!folder) return res.status(404).json({ message: "Folder not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor"]))
      return res.status(403).json({ message: "Permission denied" });

    if (req.body.name) folder.name = req.body.name;
    folder.updatedAt = Date.now();
    await board.save();

    const io = req.app.get("io");
    emitBoard(io, req.params.id, "folder-updated", { folder });

    res.json(folder);
  } catch (err) {
    console.error("Error updating folder:", err);
    res.status(500).json({ message: "Error updating folder", error: err.message });
  }
});

router.delete("/:id/folder/:folderId", verifyToken, async (req, res) => {
  try {
    const board = await PairProgramming.findById(req.params.id);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const folder = board.folders.id(req.params.folderId);
    if (!folder) return res.status(404).json({ message: "Folder not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor"]))
      return res.status(403).json({ message: "Permission denied" });

    folder.deleteOne();
    await board.save();

    const io = req.app.get("io");
    emitBoard(io, req.params.id, "folder-deleted", { folderId: req.params.folderId });

    res.json({ message: "Folder deleted" });
  } catch (err) {
    console.error("Error deleting folder:", err);
    res.status(500).json({ message: "Error deleting folder", error: err.message });
  }
});

/* ---------------- FILE CRUD ---------------- */

router.post("/:id/folder/:folderId/file", verifyToken, async (req, res) => {
  try {
    const { name, content, language } = req.body;
    const board = await PairProgramming.findById(req.params.id);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const folder = board.folders.id(req.params.folderId);
    if (!folder) return res.status(404).json({ message: "Folder not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor"]))
      return res.status(403).json({ message: "Permission denied" });

    const file = { name, content: content || "", language };
    folder.files.push(file);
    await board.save();

    const newFile = folder.files[folder.files.length - 1];
    const io = req.app.get("io");
    emitBoard(io, req.params.id, "file-created", { folderId: folder._id, file: newFile });

    res.status(201).json(newFile);
  } catch (err) {
    console.error("Error creating file:", err);
    res.status(500).json({ message: "Error creating file", error: err.message });
  }
});

router.get("/:id/folder/:folderId/file/:fileId", verifyToken, async (req, res) => {
  try {
    const board = await PairProgramming.findById(req.params.id);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const folder = board.folders.id(req.params.folderId);
    if (!folder) return res.status(404).json({ message: "Folder not found" });

    const file = folder.files.id(req.params.fileId);
    if (!file) return res.status(404).json({ message: "File not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor", "commenter", "viewer"]))
      return res.status(403).json({ message: "Permission denied" });

    res.json(file);
  } catch (err) {
    console.error("Error fetching file:", err);
    res.status(500).json({ message: "Error fetching file", error: err.message });
  }
});

router.put("/:id/folder/:folderId/file/:fileId", verifyToken, async (req, res) => {
  try {
    const { name, content, language } = req.body;
    const board = await PairProgramming.findById(req.params.id);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const folder = board.folders.id(req.params.folderId);
    if (!folder) return res.status(404).json({ message: "Folder not found" });

    const file = folder.files.id(req.params.fileId);
    if (!file) return res.status(404).json({ message: "File not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor"]))
      return res.status(403).json({ message: "Permission denied" });

    if (name) file.name = name;
    if (content !== undefined) file.content = content;
    if (language) file.language = language;
    file.updatedAt = Date.now();
    await board.save();

    const io = req.app.get("io");
    emitBoard(io, req.params.id, "file-updated", { folderId: folder._id, file });

    res.json(file);
  } catch (err) {
    console.error("Error updating file:", err);
    res.status(500).json({ message: "Error updating file", error: err.message });
  }
});

router.delete("/:id/folder/:folderId/file/:fileId", verifyToken, async (req, res) => {
  try {
    const board = await PairProgramming.findById(req.params.id);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const folder = board.folders.id(req.params.folderId);
    if (!folder) return res.status(404).json({ message: "Folder not found" });

    const file = folder.files.id(req.params.fileId);
    if (!file) return res.status(404).json({ message: "File not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor"]))
      return res.status(403).json({ message: "Permission denied" });

    file.deleteOne();
    await board.save();

    const io = req.app.get("io");
    emitBoard(io, req.params.id, "file-deleted", { folderId: folder._id, fileId: file._id });

    res.json({ message: "File deleted" });
  } catch (err) {
    console.error("Error deleting file:", err);
    res.status(500).json({ message: "Error deleting file", error: err.message });
  }
});

/* ---------------- COMMENT CRUD ---------------- */

router.post("/:id/comment", verifyToken, async (req, res) => {
  try {
    const { text, folderId, fileId, line } = req.body;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid Board ID" });
    }

    const board = await PairProgramming.findById(req.params.id);
    if (!board) return res.status(404).json({ message: "Board not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor", "commenter"]))
      return res.status(403).json({ message: "Permission denied" });

    const user = await User.findById(req.user.id).select("name");

    const comment = {
      text,
      line: line || null,
      authorId: req.user.id,
      authorName: user?.name || "Unknown",
    };

    if (folderId && fileId) {
      const folder = board.folders.id(folderId);
      if (!folder) return res.status(404).json({ message: "Folder not found" });
      const file = folder.files.id(fileId);
      if (!file) return res.status(404).json({ message: "File not found" });
      file.comments.push(comment);
    } else {
      board.comments.push(comment);
    }

    await board.save();

    // Re-fetch with population for the response and socket emit
    const updatedBoard = await PairProgramming.findById(req.params.id)
      .populate("comments.authorId", "name email profile_image avatarUrl colorTag")
      .populate("folders.files.comments.authorId", "name email profile_image avatarUrl colorTag");

    let savedComment;
    if (folderId && fileId) {
      const savedFolder = updatedBoard.folders.id(folderId);
      const savedFile = savedFolder.files.id(fileId);
      savedComment = savedFile.comments[savedFile.comments.length - 1];
    } else {
      savedComment = updatedBoard.comments[updatedBoard.comments.length - 1];
    }

    const io = req.app.get("io");
    emitBoard(io, req.params.id, "comment-created", { folderId, fileId, comment: savedComment });

    // --- NOTIFICATION LOGIC ---
    // Notify all members except author
    // Collect all involved users (owner, members, permissions)
    // For simplicity, let's just notify 'members' and 'owner' if they are not the author
    const recipients = new Set();
    if (board.owner && board.owner.toString() !== req.user.id) recipients.add(board.owner.toString());

    board.members.forEach(m => {
      const mid = m._id ? m._id.toString() : m.toString();
      if (mid !== req.user.id) recipients.add(mid);
    });

    // Also notify editors/viewers if they are not members (depending on schema usage, sometimes they overlap)
    // Safely checking just members+owner is usually enough for "team", but let's be thorough
    ["editors", "commenters", "viewers"].forEach(role => {
      if (board.permissions[role]) {
        board.permissions[role].forEach(u => {
          const uid = u._id ? u._id.toString() : u.toString();
          if (uid !== req.user.id) recipients.add(uid);
        });
      }
    });

    const notifPromises = Array.from(recipients).map(async (userId) => {
      const notification = new Notification({
        user_id: userId,
        title: "New Comment in Pair Programming",
        message: `${user?.name || "Someone"} commented on ${board.name}: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`,
        type: "comment",
        link: `/pair-programming.html?id=${board._id}`, // Redirect to board
      });
      await notification.save();

      // Real-time
      io.to(userId).emit("notification", notification);
      return notification;
    });

    await Promise.all(notifPromises);
    // --------------------------

    res.status(201).json(savedComment);
  } catch (err) {
    console.error("Error adding comment:", err);
    res.status(500).json({ message: "Error adding comment", error: err.message });
  }
});

router.get("/:id/comments", verifyToken, async (req, res) => {
  try {
    const { folderId, fileId } = req.query;

    const board = await PairProgramming.findById(req.params.id)
      .populate("comments.authorId", "name email profile_image avatarUrl colorTag")
      .populate("folders.files.comments.authorId", "name email profile_image avatarUrl colorTag");

    if (!board) return res.status(404).json({ message: "Board not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor", "commenter", "viewer"]))
      return res.status(403).json({ message: "Permission denied" });

    let comments;
    if (folderId && fileId) {
      const folder = board.folders.id(folderId);
      if (!folder) return res.status(404).json({ message: "Folder not found" });
      const file = folder.files.id(fileId);
      if (!file) return res.status(404).json({ message: "File not found" });
      comments = file.comments;
    } else {
      comments = board.comments;
    }

    res.json(comments);
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).json({ message: "Error fetching comments", error: err.message });
  }
});

// Update comment
router.put("/:boardId/comments/:commentId", verifyToken, async (req, res) => {
  try {
    const { text } = req.body;
    const { boardId, commentId } = req.params;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const board = await PairProgramming.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    // Find comment in board-level comments or file-level comments
    let comment = null;
    let found = false;

    // Check board-level comments
    comment = board.comments.id(commentId);
    if (comment) {
      found = true;
    } else {
      // Check file-level comments
      for (const folder of board.folders) {
        for (const file of folder.files) {
          comment = file.comments.id(commentId);
          if (comment) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    if (!found || !comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Check if user is the comment author
    const commentAuthorId = comment.authorId?._id ? comment.authorId._id.toString() : comment.authorId.toString();
    if (commentAuthorId !== req.user.id) {
      return res.status(403).json({ message: "You can only edit your own comments" });
    }

    // Update comment
    comment.text = text.trim();
    comment.updatedAt = new Date();
    await board.save();

    const io = req.app.get("io");
    emitBoard(io, boardId, "comment-updated", { commentId, text: comment.text });

    res.json({ success: true, comment });
  } catch (err) {
    console.error("Error updating comment:", err);
    res.status(500).json({ message: "Error updating comment", error: err.message });
  }
});

// Delete comment
router.delete("/:boardId/comments/:commentId", verifyToken, async (req, res) => {
  try {
    const { boardId, commentId } = req.params;

    const board = await PairProgramming.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    // Find and delete comment
    let comment = null;
    let found = false;

    // Check board-level comments
    comment = board.comments.id(commentId);
    if (comment) {
      const commentAuthorId = comment.authorId?._id ? comment.authorId._id.toString() : comment.authorId.toString();
      if (commentAuthorId !== req.user.id && board.owner.toString() !== req.user.id) {
        return res.status(403).json({ message: "You can only delete your own comments" });
      }
      comment.deleteOne();
      found = true;
    } else {
      // Check file-level comments
      for (const folder of board.folders) {
        for (const file of folder.files) {
          comment = file.comments.id(commentId);
          if (comment) {
            const commentAuthorId = comment.authorId?._id ? comment.authorId._id.toString() : comment.authorId.toString();
            if (commentAuthorId !== req.user.id && board.owner.toString() !== req.user.id) {
              return res.status(403).json({ message: "You can only delete your own comments" });
            }
            comment.deleteOne();
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    if (!found) {
      return res.status(404).json({ message: "Comment not found" });
    }

    await board.save();

    const io = req.app.get("io");
    emitBoard(io, boardId, "comment-deleted", { commentId });

    res.json({ success: true, message: "Comment deleted" });
  } catch (err) {
    console.error("Error deleting comment:", err);
    res.status(500).json({ message: "Error deleting comment", error: err.message });
  }
});

/* ---------------- RUN CODE (FIXED) ---------------- */

router.post("/:id/folder/:folderId/file/:fileId/run", verifyToken, async (req, res) => {
  try {
    console.log("POST /run - Executing code");

    const { code, language } = req.body;

    const board = await PairProgramming.findById(req.params.id);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const folder = board.folders.id(req.params.folderId);
    if (!folder) return res.status(404).json({ message: "Folder not found" });

    const file = folder.files.id(req.params.fileId);
    if (!file) return res.status(404).json({ message: "File not found" });

    if (!hasPermission(board, req.user.id, ["owner", "editor"]))
      return res.status(403).json({ message: "Permission denied" });

    // Prepare temp file - FIXED: Use os.tmpdir() instead of /tmp
    const tempId = uuidv4();
    let fileExt, command;

    switch (language) {
      case "js":
        fileExt = "js";
        command = "node";
        break;
      case "python":
        fileExt = "py";
        command = "python";
        break;
      case "php":
        fileExt = "php";
        command = "php";
        break;
      default:
        return res.status(400).json({ status: "error", error: "Unsupported language" });
    }

    // FIXED: Use os.tmpdir() for cross-platform compatibility
    const tempFilePath = path.join(os.tmpdir(), `${tempId}.${fileExt}`);

    console.log("Writing temp file:", tempFilePath);
    fs.writeFileSync(tempFilePath, code);

    // Execute code
    exec(`${command} "${tempFilePath}"`, { timeout: 5000 }, async (err, stdout, stderr) => {

      // Clean up temp file
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch (cleanupErr) {
        console.error("Warning: Failed to delete temp file:", cleanupErr);
      }

      const output = stdout || stderr || "";
      const status = err ? "error" : "success";
      const errorMsg = err ? (err.killed ? "Execution timed out" : err.message) : "";

      const runEntry = {
        code,
        language,
        output: output.trim(),
        error: errorMsg,
        status,
        executedAt: new Date(),
      };

      try {
        file.runs.push(runEntry);
        await board.save();

        const io = req.app.get("io");
        emitBoard(io, req.params.id, "file-run", { folderId: folder._id, fileId: file._id, run: runEntry });

        res.status(201).json(runEntry);
      } catch (saveErr) {
        console.error("Error saving run result:", saveErr);
        // If response hasn't been sent yet
        if (!res.headersSent) {
          res.status(500).json({ message: "Error saving run result", error: saveErr.message });
        }
      }
    });

  } catch (err) {
    console.error("Error running code:", err);
    res.status(500).json({ message: "Error running code", error: err.message });
  }
});

// Join Board via Token
router.post(
  "/join",
  verifyToken,
  async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ success: false, message: "Token required" });

      const board = await PairProgramming.findOne({
        "shareLinks": {
          $elemMatch: {
            token: token,
            expiresAt: { $gt: new Date() }
          }
        }
      });

      if (!board) return res.status(404).json({ success: false, message: "Invalid or expired link" });

      const userId = req.user.id;
      const shareLink = board.shareLinks.find(sl => sl.token === token);
      const permission = shareLink.permission || 'viewer';

      let changed = false;
      if (!board.members.includes(userId)) {
        board.members.push(userId);
        changed = true;
      }

      // Add specific permission
      const roleMap = {
        'editor': 'editors',
        'commenter': 'commenters',
        'viewer': 'viewers'
      };
      const listName = roleMap[permission] || 'viewers';

      if (!board.permissions[listName].includes(userId)) {
        board.permissions[listName].push(userId);
        changed = true;
      }

      if (changed) {
        await board.save();

        const notification = new Notification({
          user_id: userId,
          title: "Access Granted",
          message: `You have joined the project "${board.name}" as ${permission}`,
          type: "invite",
          link: `/pair-programming.html?id=${board._id}`,
        });
        await notification.save();

        const io = req.app.get("io");
        if (io) {
          io.to(userId.toString()).emit("notification", notification);
        }
      }

      res.json({ success: true, data: { boardId: board._id } });
    } catch (err) {
      console.error("Error joining board:", err);
      res.status(500).json({ success: false, message: "Error joining board", error: err.message });
    }
  }
);

export default router;
// routes/pair-programmingRoutes.js
import express from "express";
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

const router = express.Router();
// console.log("🔥 RUNNER ROUTE FILE LOADED:", __filename);


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
    console.error("❌ Error creating board:", err);
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
    }).select("name owner createdAt updatedAt members");

    res.json(boards);
  } catch (err) {
    console.error("❌ Error fetching boards:", err);
    res.status(500).json({ message: "Error fetching boards", error: err.message });
  }
});

router.get("/:id", verifyToken, async (req, res) => {
  try {
    console.log("📥 GET /:id - Fetching board:", req.params.id);

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid Board ID" });
    }

    const board = await PairProgramming.findById(req.params.id)
      .populate("owner", "name email")
      .populate("members", "name email")
      .populate("permissions.editors", "name email")
      .populate("permissions.commenters", "name email")
      .populate("permissions.viewers", "name email")
      .populate("comments.authorId", "name email");

    if (!board) {
      console.log("❌ Board not found:", req.params.id);
      return res.status(404).json({ message: "Board not found" });
    }

    if (!hasPermission(board, req.user.id, ["owner", "editor", "commenter", "viewer"])) {
      console.log("❌ Access denied for user:", req.user.id);
      return res.status(403).json({ message: "Access denied" });
    }

    console.log("✅ Board found and returned:", board.name);
    res.json(board);
  } catch (err) {
    console.error("❌ Error fetching board:", err);
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
    console.error("❌ Error updating board:", err);
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
    console.error("❌ Error deleting board:", err);
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

    if (!query) return res.json([]);

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
    }).select("name email profile_image role").limit(10);

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

    const shareUrl = `${req.protocol}://${req.get('host')}/pair-programming/join/${shareToken}`;

    res.json({
      success: true,
      shareUrl
    });
  } catch (err) {
    console.error("❌ Error generating share link:", err);
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

    const shareUrl = `${req.protocol}://${req.get('host')}/pair-programming/join/${shareToken}`;

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

    // 1. Create Notifications & Send Emails
    const notificationPromises = userIds.map(async (userId) => {
      // Fetch user details for email
      const invitee = await User.findById(userId).select("email name");
      if (invitee) {
        // Send Email
        await sendPairProgrammingInvite(invitee.email, {
          inviterName: inviter.name,
          projectName: board.name,
          shareUrl
        });
      }

      const notification = new Notification({
        user_id: userId,
        title: "Pair Programming Invite",
        message: `${inviter?.name || 'Someone'} invited you to \"${board.name}\"`,
        type: "invite",
        link: shareUrl,
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
    console.error("❌ Error inviting users:", err);
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
    console.error("❌ Error fetching followers:", err);
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
    console.error("❌ Error creating folder:", err);
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
    console.error("❌ Error fetching folder:", err);
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
    console.error("❌ Error updating folder:", err);
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
    console.error("❌ Error deleting folder:", err);
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
    console.error("❌ Error creating file:", err);
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
    console.error("❌ Error fetching file:", err);
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
    console.error("❌ Error updating file:", err);
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
    console.error("❌ Error deleting file:", err);
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

    const newComment = board.comments[board.comments.length - 1];
    const io = req.app.get("io");
    emitBoard(io, req.params.id, "comment-created", { folderId, fileId, comment: newComment });

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

    res.status(201).json(newComment);
  } catch (err) {
    console.error("❌ Error adding comment:", err);
    res.status(500).json({ message: "Error adding comment", error: err.message });
  }
});

router.get("/:id/comments", verifyToken, async (req, res) => {
  try {
    const { folderId, fileId } = req.query;

    const board = await PairProgramming.findById(req.params.id)
      .populate("comments.authorId", "name email");

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
    console.error("❌ Error fetching comments:", err);
    res.status(500).json({ message: "Error fetching comments", error: err.message });
  }
});

/* ---------------- RUN CODE (FIXED) ---------------- */

router.post("/:id/folder/:folderId/file/:fileId/run", verifyToken, async (req, res) => {
  try {
    console.log("📥 POST /run - Executing code");

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

    console.log("📝 Writing temp file:", tempFilePath);
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
    console.error("❌ Error running code:", err);
    res.status(500).json({ message: "Error running code", error: err.message });
  }
});

export default router;
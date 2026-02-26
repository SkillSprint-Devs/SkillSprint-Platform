import { verifyTokenSocket } from "../utils/verifyTokenSocket.js";
import PairProgramming from "../models/pair-programming.js";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import mongoose from "mongoose";
import User from "../models/user.js";

const USER_COLORS = [
  "#8C52FF", "#5CE1E6", "#7ED957", "#FF66C4", "#FFBD59",
  "#FF5757", "#CB6CE6", "#5271FF", "#00C2CB", "#00BF63"
];

// Module-level process map: boardId -> { process, tempPath }
// Must live outside socket handlers to survive reconnects and be shared correctly per-board.
const activeProcesses = new Map();

function hasSocketPermission(board, userId, roles = []) {
  const id = userId.toString();
  const normalizedRoles = roles.map(r => r.toLowerCase());

  // Ownership Check
  if (normalizedRoles.includes("owner") && board.owner.toString() === id) return true;

  // Generic Role Check (Driver/Navigator)
  if (board.members) {
    const member = board.members.find(m => (m.user?._id || m.user || m).toString() === id);
    if (member) {
      if (normalizedRoles.includes(member.role.toLowerCase())) return true;
    }
  }

  // legacy permission check
  if (normalizedRoles.includes("editor") && board.permissions?.editors?.some(e => e.toString() === id)) return true;
  if (normalizedRoles.includes("commenter") && board.permissions?.commenters?.some(c => c.toString() === id)) return true;
  if (normalizedRoles.includes("viewer") && board.permissions?.viewers?.some(v => (v._id || v).toString() === id)) return true;

  return false;
}

export default function pairProgrammingSocket(io) {
  const pair = io.of("/pair-programming");

  pair.use(verifyTokenSocket);

  pair.on("connection", (socket) => {
    console.log("Pair socket connected:", socket.user.id, "| Socket ID:", socket.id);

    socket.on("join-board", async ({ boardId }) => {
      console.log("User", socket.user.id, "joining board:", boardId);

      // DB SAFETY CHECK
      if (mongoose.connection.readyState !== 1) {
        return socket.emit("error", { message: "Database is connecting... please try again in a moment." });
      }

      try {
        const [board, userProfile] = await Promise.all([
          PairProgramming.findById(boardId),
          User.findById(socket.user.id).select("name colorTag profile_image")
        ]);

        if (!board) {
          console.log("Board not found:", boardId);
          socket.emit("error", { message: "Board not found" });
          return;
        }

        // AUTO-ASSIGN COLOR IF MISSING
        let color = userProfile?.colorTag;
        if (!color) {
          color = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
          // Async update in background, non-blocking for socket join
          User.findByIdAndUpdate(socket.user.id, { colorTag: color }).exec().catch(err => {
            console.error("Failed to auto-assign color:", err);
          });
        }

        // Cache profile on socket for faster broadcasts
        socket.userMeta = {
          userId: socket.user.id.toString(),
          name: userProfile?.name || "User",
          color: color || "#8C52FF"
        };

        // Sync back to joined user so their local state is updated
        socket.emit("user-meta", { name: socket.userMeta.name, color: socket.userMeta.color });

        if (!hasSocketPermission(board, socket.user.id, ["owner", "editor", "commenter", "viewer"])) {
          console.log("Permission denied for user:", socket.user.id);
          socket.emit("error", { message: "Permission denied" });
          return;
        }

        socket.join(boardId);
        console.log("User joined board room:", boardId);

        // INITIAL PRESENCE: Send list of online users to the joining user
        const room = pair.adapter.rooms.get(boardId);
        const onlineUsers = [];
        if (room) {
          for (const socketId of room) {
            const s = pair.sockets.get(socketId);
            if (s && s.user?.id) {
              onlineUsers.push(s.user.id.toString());
            }
          }
        }
        socket.emit("initial-presence", { userIds: onlineUsers });

        // Notify others in the room
        socket.to(boardId).emit("user-joined", { userId: socket.user.id.toString() });

        // Send confirmation to the user
        socket.emit("joined-board", { boardId, message: "Successfully joined board" });
      } catch (err) {
        console.error("Error joining board:", err);
        socket.emit("error", { message: "Failed to join board" });
      }
    });

    socket.on("leave-board", ({ boardId }) => {
      console.log("User", socket.user.id, "leaving board:", boardId);
      socket.leave(boardId);
      socket.to(boardId).emit("user-left", { userId: socket.user.id });
    });

    socket.on("cursor-update", ({ boardId, fileId, cursor, name, color }) => {
      // Backend is authoritative for name and color to prevent spoofing/stale data
      socket.to(boardId).emit("cursor-update", {
        userId: socket.user.id,
        fileId,
        cursor,
        name: socket.userMeta?.name || name || "User",
        color: socket.userMeta?.color || color || "#8C52FF"
      });
    });

    // --- TERMINAL HANDLERS ---

    socket.on("terminal:start", async ({ boardId, fileId, code, language }) => {
      console.log(`Starting terminal for board ${boardId}, lang: ${language}`);

      try {
        const board = await PairProgramming.findById(boardId);
        if (!board || !hasSocketPermission(board, socket.user.id, ["driver"])) {
          socket.emit("terminal:output", { data: "Permission denied. Only the Driver can run the terminal.\n" });
          return;
        }

        // Kill existing process for this board if any
        if (activeProcesses.has(boardId)) {
          console.log("Killing existing process for board:", boardId);
          const old = activeProcesses.get(boardId);
          if (old.process) old.process.kill();
          activeProcesses.delete(boardId);
        }

        // Write temp file
        const tempId = Math.random().toString(36).substring(7);
        let fileExt, command, args;

        switch (language) {
          case "js":
            fileExt = "js";
            command = "node";
            break;
          case "python":
            fileExt = "py";
            // On Windows, 'py' is often used as a launcher, try python first then py
            command = "python";
            break;
          case "php":
            fileExt = "php";
            command = "php";
            break;
          default:
            socket.emit("terminal:output", { data: "Unsupported language.\n" });
            return;
        }

        const tempFilePath = path.join(os.tmpdir(), `run_${tempId}.${fileExt}`);
        fs.writeFileSync(tempFilePath, code);

        args = [tempFilePath];
        // Special handling for python unbuffered output
        if (language === "python") {
          args.unshift("-u");
        }

        console.log(`[Terminal] Spawning: ${command}`, args);

        const isWin = process.platform === "win32";
        const child = spawn(command, args, { shell: isWin });

        activeProcesses.set(boardId, { process: child, tempPath: tempFilePath });

        // Stream Output
        child.stdout.on("data", (data) => {
          const out = data.toString();
          console.log(`[Terminal OUT] ${out.trim()}`);
          pair.to(boardId).emit("terminal:output", { data: out });
        });

        child.stderr.on("data", (data) => {
          const err = data.toString();
          console.log(`[Terminal ERR] ${err.trim()}`);
          pair.to(boardId).emit("terminal:output", { data: err });
        });

        child.on("close", (code, signal) => {
          console.log(`[Terminal] Process closed. Code: ${code}, Signal: ${signal}`);
          const msg = signal ? `\n[Process terminated by signal ${signal}]\n` : `\n[Process exited with code ${code}]\n`;
          pair.to(boardId).emit("terminal:output", { data: msg });

          // Cleanup
          try {
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          } catch (e) { console.error("[Terminal] Temp file cleanup failed", e); }

          activeProcesses.delete(boardId);
        });

        child.on("error", (err) => {
          console.error("[Terminal] Process Error:", err);
          let msg = `Error: ${err.message}\n`;
          if (err.code === 'ENOENT') {
            if (command === 'php') msg = "Error: PHP interpreter not found. Please ensure PHP is installed and in your system PATH.\n";
            if (command === 'python' || command === 'py') msg = "Error: Python interpreter not found. Please ensure Python installed and in your system PATH.\n";
          }
          pair.to(boardId).emit("terminal:output", { data: msg });
        });

      } catch (err) {
        console.error("[Terminal] Catch Error:", err);
        socket.emit("terminal:output", { data: `Server error: ${err.message}\n` });
      }
    });

    socket.on("terminal:input", async ({ boardId, data }) => {
      console.log(`[Terminal IN] Board: ${boardId} | Input: ${data}`);

      const board = await PairProgramming.findById(boardId);
      if (!board || !hasSocketPermission(board, socket.user.id, ["driver"])) {
        return; // Silently ignore if not driver
      }

      const active = activeProcesses.get(boardId);
      if (active && active.process) {
        try {
          active.process.stdin.write(data + "\n");
        } catch (err) {
          console.error("[Terminal] Write error:", err);
          socket.emit("terminal:output", { data: `\n[Error writing to process: ${err.message}]\n` });
        }
      } else {
        console.warn(`[Terminal] Input received but no active process for board: ${boardId}`);
        socket.emit("terminal:output", { data: "\n[No active process]\n" });
      }
    });

    socket.on("terminal:kill", ({ boardId }) => {
      const active = activeProcesses.get(boardId);
      if (active && active.process) {
        active.process.kill();
        pair.to(boardId).emit("terminal:output", { data: "\n[Process terminated by user]\n" });
      }
    });

    // --- END TERMINAL HANDLERS ---

    socket.on("content-update", async ({ boardId, fileId, patch }) => {
      console.log("Content update from:", socket.user.id, "for file:", fileId);

      try {
        const board = await PairProgramming.findById(boardId);
        if (!board) {
          console.log("Board not found");
          return;
        }

        if (!hasSocketPermission(board, socket.user.id, ["driver"])) {
          console.log("Permission denied for editing (not a driver)");
          socket.emit("error", { message: "Only the Driver can edit the code." });
          return;
        }

        // Broadcast to others
        socket.to(boardId).emit("content-update", {
          userId: socket.user.id,
          fileId,
          patch
        });

        // Debounced save
        if (!socket.debounceSave) socket.debounceSave = {};
        clearTimeout(socket.debounceSave[fileId]);

        socket.debounceSave[fileId] = setTimeout(async () => {
          try {
            console.log("Auto-saving file:", fileId);

            let targetFolder = null;
            let targetFile = null;

            for (const folder of board.folders) {
              const file = folder.files.id(fileId);
              if (file) {
                targetFolder = folder;
                targetFile = file;
                break;
              }
            }

            if (!targetFolder || !targetFile) {
              console.log("File not found in any folder");
              return;
            }

            targetFile.content = patch.text;
            await board.save();

            console.log("File auto-saved");
            pair.to(boardId).emit("file-saved", { fileId });
          } catch (saveErr) {
            console.error("Error auto-saving:", saveErr);
          }
        }, 2000);

      } catch (err) {
        console.error("Error handling content update:", err);
        socket.emit("error", { message: "Failed to update content" });
      }
    });

    socket.on("typing", async ({ boardId, fileId, status }) => {
      // Basic check for driver role for typing indicator
      const board = await PairProgramming.findById(boardId);
      if (board && hasSocketPermission(board, socket.user.id, ["driver"])) {
        socket.to(boardId).emit("typing", {
          userId: socket.user.id,
          fileId,
          status
        });
      }
    });

    socket.on("disconnect", () => {
      console.log("Pair socket disconnected:", socket.user.id);
    });

    socket.on("error", (err) => {
      console.error("Socket error:", err);
    });
  });
}
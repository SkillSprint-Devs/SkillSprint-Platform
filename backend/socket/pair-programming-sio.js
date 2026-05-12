import { verifyTokenSocket } from "../utils/verifyTokenSocket.js";
import PairProgramming from "../models/pair-programming.js";
import mongoose from "mongoose";
import User from "../models/user.js";

const USER_COLORS = [
  "#8C52FF", "#5CE1E6", "#7ED957", "#FF66C4", "#FFBD59",
  "#FF5757", "#CB6CE6", "#5271FF", "#00C2CB", "#00BF63"
];

const activeProcesses = new Map();

function hasSocketPermission(board, userId, roles = []) {
  const id = userId.toString();
  const normalizedRoles = roles.map(r => r.toLowerCase());

  if (normalizedRoles.includes("owner") && board.owner.toString() === id) return true;

  if (board.members) {
    const member = board.members.find(m => (m.user?._id || m.user || m).toString() === id);
    if (member) {
      if (normalizedRoles.includes(member.role.toLowerCase())) return true;
    }
  }

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

      if (mongoose.connection.readyState !== 1) {
        return socket.emit("error", { message: "Database is connecting... please try again in a moment." });
      }

      try {
        const [board, userProfile] = await Promise.all([
          PairProgramming.findById(boardId),
          User.findById(socket.user.id).select("name colorTag profile_image")
        ]);

        if (!board) {
          socket.emit("error", { message: "Board not found" });
          return;
        }

        let color = userProfile?.colorTag;
        if (!color) {
          color = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
          User.findByIdAndUpdate(socket.user.id, { colorTag: color }).exec().catch(err => {
            console.error("Failed to auto-assign color:", err);
          });
        }

        socket.userMeta = {
          userId: socket.user.id.toString(),
          name: userProfile?.name || "User",
          color: color || "#8C52FF"
        };

        socket.emit("user-meta", { name: socket.userMeta.name, color: socket.userMeta.color });

        if (!hasSocketPermission(board, socket.user.id, ["owner", "editor", "commenter", "viewer"])) {
          socket.emit("error", { message: "Permission denied" });
          return;
        }

        socket.join(boardId);

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
        socket.to(boardId).emit("user-joined", { userId: socket.user.id.toString() });
        socket.emit("joined-board", { boardId, message: "Successfully joined board" });
      } catch (err) {
        console.error("Error joining board:", err);
        socket.emit("error", { message: "Failed to join board" });
      }
    });

    socket.on("leave-board", ({ boardId }) => {
      socket.leave(boardId);
      socket.to(boardId).emit("user-left", { userId: socket.user.id });
    });

    socket.on("cursor-update", ({ boardId, fileId, cursor, name, color }) => {
      socket.to(boardId).emit("cursor-update", {
        userId: socket.user.id,
        fileId,
        cursor,
        name: socket.userMeta?.name || name || "User",
        color: socket.userMeta?.color || color || "#8C52FF"
      });
    });

    // --- TERMINAL HANDLERS (SECURE — Docker Execution Service) ---

    socket.on("terminal:start", async ({ boardId, fileId, code, language }) => {
      console.log(`[Socket] Starting execution for board ${boardId}, lang: ${language}`);

      try {
        const board = await PairProgramming.findById(boardId);
        if (!board || !hasSocketPermission(board, socket.user.id, ["driver"])) {
          socket.emit("terminal:output", { data: "Permission denied. Only the Driver can run code.\n" });
          return;
        }

        socket.emit("terminal:output", { data: `> Running ${language} code\n` });

        const EXECUTION_URL = process.env.EXECUTION_SERVICE_URL || "http://execution-service:4000";

        try {
          const response = await fetch(`${EXECUTION_URL}/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ language, code }),
            signal: AbortSignal.timeout(25_000),
          });

          if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            socket.emit("terminal:output", { data: `\n[Error] ${errBody.error || "Execution service error"}\n` });
            return;
          }

          const result = await response.json();
          const { stdout = "", stderr = "", exitCode, timedOut } = result;

          if (stdout) socket.emit("terminal:output", { data: stdout });
          if (stderr) socket.emit("terminal:output", { data: `\n[stderr]\n${stderr}` });

          if (timedOut) {
            socket.emit("terminal:output", { data: "\n[Process timed out after 10 seconds]\n" });
          } else {
            socket.emit("terminal:output", { data: `\n[Process exited with code ${exitCode}]\n` });
          }

          // Broadcast to everyone else in the room
          socket.to(boardId).emit("terminal:output", { data: stdout + (stderr ? `\n${stderr}` : "") });

        } catch (fetchErr) {
          console.error("[Socket Run] Service unreachable:", fetchErr.message);
          socket.emit("terminal:output", { data: "\n[Error] Code execution service is currently unavailable.\n" });
        }

      } catch (err) {
        console.error("[Socket Run] Catch Error:", err);
        socket.emit("terminal:output", { data: `\n[Server error] ${err.message}\n` });
      }
    });

    socket.on("terminal:input", () => {
      socket.emit("terminal:output", { data: "\n[Notice] Interactive input is not supported in this secure environment.\n" });
    });

    socket.on("terminal:kill", () => {
      // Containers are short-lived and auto-deleted
    });

    // --- END TERMINAL HANDLERS ---

    socket.on("content-update", async ({ boardId, fileId, patch }) => {
      try {
        const board = await PairProgramming.findById(boardId);
        if (!board) return;

        if (!hasSocketPermission(board, socket.user.id, ["driver"])) {
          socket.emit("error", { message: "Only the Driver can edit the code." });
          return;
        }

        socket.to(boardId).emit("content-update", { userId: socket.user.id, fileId, patch });

        if (!socket.debounceSave) socket.debounceSave = {};
        clearTimeout(socket.debounceSave[fileId]);

        socket.debounceSave[fileId] = setTimeout(async () => {
          try {
            let targetFile = null;
            for (const folder of board.folders) {
              const file = folder.files.id(fileId);
              if (file) { targetFile = file; break; }
            }
            if (targetFile) {
              targetFile.content = patch.text;
              await board.save();
              pair.to(boardId).emit("file-saved", { fileId });
            }
          } catch (saveErr) { console.error("Error auto-saving:", saveErr); }
        }, 2000);
      } catch (err) { console.error("Error handling content update:", err); }
    });

    socket.on("typing", async ({ boardId, fileId, status }) => {
      const board = await PairProgramming.findById(boardId);
      if (board && hasSocketPermission(board, socket.user.id, ["driver"])) {
        socket.to(boardId).emit("typing", { userId: socket.user.id, fileId, status });
      }
    });

    socket.on("disconnect", () => { });
    socket.on("error", (err) => { console.error("Socket error:", err); });
  });
}
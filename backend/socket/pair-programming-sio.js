import { verifyTokenSocket } from "../utils/verifyTokenSocket.js";
import PairProgramming from "../models/pair-programming.js";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

function hasSocketPermission(board, userId, roles = []) {
  const id = userId.toString();
  if (roles.includes("owner") && board.owner.toString() === id) return true;
  if (roles.includes("editor") && board.permissions?.editors?.some(e => e.toString() === id)) return true;
  if (roles.includes("commenter") && board.permissions?.commenters?.some(c => c.toString() === id)) return true;
  if (roles.includes("viewer") && board.permissions?.viewers?.some(v => v.toString() === id)) return true;
  if (roles.includes("viewer") && board.members?.some(m => m.toString() === id)) return true;
  return false;
}

export default function pairProgrammingSocket(io) {
  const pair = io.of("/pair-programming");

  pair.use(verifyTokenSocket);

  pair.on("connection", (socket) => {
    console.log("Pair socket connected:", socket.user.id, "| Socket ID:", socket.id);

    socket.on("join-board", async ({ boardId }) => {
      console.log("User", socket.user.id, "joining board:", boardId);

      try {
        const board = await PairProgramming.findById(boardId);
        if (!board) {
          console.log("Board not found:", boardId);
          socket.emit("error", { message: "Board not found" });
          return;
        }

        if (!hasSocketPermission(board, socket.user.id, ["owner", "editor", "commenter", "viewer"])) {
          console.log("Permission denied for user:", socket.user.id);
          socket.emit("error", { message: "Permission denied" });
          return;
        }

        socket.join(boardId);
        console.log("User joined board room:", boardId);

        // Notify others in the room
        socket.to(boardId).emit("user-joined", { userId: socket.user.id });

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

    socket.on("cursor-update", ({ boardId, fileId, cursor }) => {
      socket.to(boardId).emit("cursor-update", {
        userId: socket.user.id,
        fileId,
        cursor
      });
    });

    // --- TERMINAL HANDLERS ---

    // Map to store active processes: boardId -> { process, tempPath }
    if (!socket.adapter.processes) {
      socket.adapter.processes = new Map();
    }

    socket.on("terminal:start", async ({ boardId, fileId, code, language }) => {
      console.log(`Starting terminal for board ${boardId}, lang: ${language}`);

      try {
        const board = await PairProgramming.findById(boardId);
        if (!board || !hasSocketPermission(board, socket.user.id, ["owner", "editor"])) {
          socket.emit("terminal:output", { data: "Permission denied or board not found.\n" });
          return;
        }

        // Kill existing process for this board if any
        if (socket.adapter.processes.has(boardId)) {
          console.log("Killing existing process for board:", boardId);
          const old = socket.adapter.processes.get(boardId);
          if (old.process) old.process.kill();
          socket.adapter.processes.delete(boardId);
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
            command = "python"; // or python3 depending on env
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

        console.log("Spawning:", command, args);

        const child = spawn(command, args);

        socket.adapter.processes.set(boardId, { process: child, tempPath: tempFilePath });

        // Stream Output
        child.stdout.on("data", (data) => {
          pair.to(boardId).emit("terminal:output", { data: data.toString() });
        });

        child.stderr.on("data", (data) => {
          pair.to(boardId).emit("terminal:output", { data: data.toString() });
        });

        child.on("close", (code) => {
          console.log(`Process exited with code ${code}`);
          pair.to(boardId).emit("terminal:output", { data: `\n[Process exited with code ${code}]\n` });

          // Cleanup
          try {
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          } catch (e) { console.error("Temp file cleanup failed", e); }

          socket.adapter.processes.delete(boardId);
        });

        child.on("error", (err) => {
          pair.to(boardId).emit("terminal:output", { data: `Error: ${err.message}\n` });
        });

      } catch (err) {
        console.error("Terminal start error:", err);
        socket.emit("terminal:output", { data: `Server error: ${err.message}\n` });
      }
    });

    socket.on("terminal:input", ({ boardId, data }) => {
      const active = socket.adapter.processes.get(boardId);
      if (active && active.process) {
        try {
          active.process.stdin.write(data + "\n");
        } catch (err) {
          console.error("Write error:", err);
        }
      } else {
        socket.emit("terminal:output", { data: "\n[No active process]\n" });
      }
    });

    socket.on("terminal:kill", ({ boardId }) => {
      const active = socket.adapter.processes.get(boardId);
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

        if (!hasSocketPermission(board, socket.user.id, ["owner", "editor"])) {
          console.log("Permission denied for editing");
          socket.emit("error", { message: "Permission denied for editing" });
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

    socket.on("typing", ({ boardId, fileId, status }) => {
      socket.to(boardId).emit("typing", {
        userId: socket.user.id,
        fileId,
        status
      });
    });

    socket.on("disconnect", () => {
      console.log("Pair socket disconnected:", socket.user.id);
    });

    socket.on("error", (err) => {
      console.error("Socket error:", err);
    });
  });
}
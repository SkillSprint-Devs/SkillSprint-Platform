//backend/socket/pair-programming-sio.js
import { verifyTokenSocket } from "../utils/verifyTokenSocket.js";
import PairProgramming from "../models/pair-programming.js";

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

        if (!hasSocketPermission(board, socket.user.id, ["owner","editor","commenter","viewer"])) {
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

    socket.on("content-update", async ({ boardId, fileId, patch }) => {
      console.log("Content update from:", socket.user.id, "for file:", fileId);
      
      try {
        const board = await PairProgramming.findById(boardId);
        if (!board) {
          console.log("Board not found");
          return;
        }

        if (!hasSocketPermission(board, socket.user.id, ["owner","editor"])) {
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
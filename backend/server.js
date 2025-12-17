import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ROUTE IMPORTS 
import authRoutes from "./routes/authRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import postingRoutes from "./routes/postingRoutes.js";
import boardRoutes from "./routes/boardRoutes.js";
import Board from "./models/board.js";
import tasksRouter from "./routes/taskRoutes.js";
import pairProgrammingSocket from "./socket/pair-programming-sio.js";
import pairProgrammingRoutes from './routes/pair-programmingRoutes.js';
import chatRoutes from "./routes/chatRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import quizRoutes from "./routes/quizRoutes.js";
import certificateRoutes from "./routes/certificateRoutes.js";
import reminderRoutes from "./routes/reminderRoutes.js";
import { initTaskScheduler } from "./utils/taskScheduler.js";

const app = express();

// MIDDLEWARE 
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.originalUrl}`);
  next();
});

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: false,
  })
);

app.options(/.*/, cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));
app.use(express.static(path.join(__dirname, "../frontend"))); // Serve frontend static files

// DATABASE CONNECTION 
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch((err) => console.error("MongoDB Connection Failed:", err));

// SOCKET.IO SETUP 
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

app.set("io", io);

pairProgrammingSocket(io);

// Socket Authentication
io.use((socket, next) => {
  try {
    const raw = socket.handshake?.auth?.token || socket.handshake?.headers?.authorization;
    if (!raw) {
      return next(new Error("Authentication token required"));
    }

    const token = String(raw).startsWith("Bearer ") ? String(raw).split(" ")[1] : raw;
    const secret = process.env.JWT_SECRET || process.env.TOKEN_SECRET;
    if (!secret) {
      console.error("No JWT secret defined in env (JWT_SECRET/TOKEN_SECRET). Socket auth disabled.");
      return next(new Error("Server misconfiguration"));
    }

    jwt.verify(token, secret, (err, decoded) => {
      if (err) {
        console.warn("Socket auth failed:", err.message);
        return next(new Error("Invalid token"));
      }
      socket.data.user = decoded;
      socket.data.joinedBoards = new Set();
      return next();
    });
  } catch (e) {
    console.error("Socket auth error:", e);
    return next(new Error("Auth error"));
  }
});

const onlineUsers = new Map(); // userId -> Set<socketId>

io.on("connection", (socket) => {
  const user = socket.data.user || {};
  const userId = user.id || user._id || null;
  console.log("Socket connected:", socket.id, "user:", userId || "anonymous");

  if (userId) {
    socket.join(userId.toString());
  }

  // Global Presence Tracking
  if (userId) {
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
      // First socket for this user -> broadcast online
      io.emit("user:online", userId);
    }
    onlineUsers.get(userId).add(socket.id);

    // Send current list to the new user
    socket.emit("presence:list", Array.from(onlineUsers.keys()));
  }

  // joinBoard event
  socket.on("joinBoard", async (payload = {}) => {
    try {
      const boardId = payload?.boardId || payload;
      if (!boardId) return socket.emit("error", { message: "boardId required" });
      if (!userId) return socket.emit("error", { message: "unauthenticated" });

      socket.join(boardId.toString());
      socket.data.joinedBoards.add(boardId.toString());
      console.log(`Socket ${socket.id} (user ${userId}) joined board ${boardId}`);

      try {
        await Board.findByIdAndUpdate(
          boardId,
          { $addToSet: { activeUsers: mongoose.Types.ObjectId(userId) } },
          { new: true }
        );
      } catch (e) {
        console.error("Error updating Board.activeUsers on join:", e);
      }

      io.to(boardId.toString()).emit("board:user:joined", { boardId, userId, socketId: socket.id });

      //presence emit
      const board = await Board.findById(boardId)
        .populate("activeUsers", "name profile_image")
        .select("activeUsers");

      const activeUsers = board?.activeUsers?.map(u => ({
        _id: u._id,
        name: u.name,
        profile_image: u.profile_image,
      })) || [];

      io.to(boardId.toString()).emit("board:presence:update", { boardId, activeUsers });

    } catch (e) {
      console.error("joinBoard handler error:", e);
    }
  });

  // leaveBoard event
  socket.on("leaveBoard", async (payload = {}) => {
    try {
      const boardId = payload?.boardId || payload;
      if (!boardId) return;
      if (!userId) return;

      socket.leave(boardId.toString());
      socket.data.joinedBoards.delete(boardId.toString());
      console.log(`Socket ${socket.id} (user ${userId}) left board ${boardId}`);

      try {
        await Board.findByIdAndUpdate(
          boardId,
          { $pull: { activeUsers: mongoose.Types.ObjectId(userId) } },
          { new: true }
        );
      } catch (e) {
        console.error("Error updating Board.activeUsers on leave:", e);
      }

      io.to(boardId.toString()).emit("board:user:left", { boardId, userId, socketId: socket.id });

      //presence emit
      const board = await Board.findById(boardId)
        .populate("activeUsers", "name profile_image")
        .select("activeUsers");

      const activeUsers = board?.activeUsers?.map(u => ({
        _id: u._id,
        name: u.name,
        profile_image: u.profile_image,
      })) || [];

      io.to(boardId.toString()).emit("board:presence:update", { boardId, activeUsers });

    } catch (e) {
      console.error("leaveBoard handler error:", e);
    }
  });

  // disconnect handler
  socket.on("disconnect", async (reason) => {
    try {
      console.log("Socket disconnected:", socket.id, "reason:", reason);
      if (!userId) return;

      // Global Presence Cleanup
      if (onlineUsers.has(userId)) {
        const userSockets = onlineUsers.get(userId);
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit("user:offline", userId);
        }
      }

      const joined = Array.from(socket.data.joinedBoards || []);
      await Promise.all(
        joined.map(async (boardId) => {
          try {
            await Board.findByIdAndUpdate(
              boardId,
              { $pull: { activeUsers: mongoose.Types.ObjectId(userId) } },
              { new: true }
            );

            io.to(boardId.toString()).emit("board:user:left", { boardId, userId, socketId: socket.id });

            //presence emit
            const board = await Board.findById(boardId)
              .populate("activeUsers", "name profile_image")
              .select("activeUsers");

            const activeUsers = board?.activeUsers?.map(u => ({
              _id: u._id,
              name: u.name,
              profile_image: u.profile_image,
              status: onlineUsers.has(u._id.toString()) ? 'active' : 'inactive' // Basic Status
            })) || [];

            io.to(boardId.toString()).emit("board:presence:update", { boardId, activeUsers });

          } catch (e) {
            console.error("Error during disconnect cleanup for board", boardId, e);
          }
        })
      );
    } catch (e) {
      console.error("disconnect handler error:", e);
    }
  });
});

// ROUTES 
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/posting", postingRoutes);
app.use("/api/board", boardRoutes);
app.use("/api/tasks", tasksRouter);
app.use('/api/pair-programming', pairProgrammingRoutes);
app.use("/api/chat", chatRoutes);
console.log("Registering /api/notifications route...");
app.use("/api/notifications", notificationRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/reminders", reminderRoutes);

// central error handler for express routes 
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  const status = err.status || 500;
  res.status(status).json({ success: false, message: err.message || "Internal server error" });
});

// SERVER START 
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Initialize task reminder scheduler
  initTaskScheduler(io);
});

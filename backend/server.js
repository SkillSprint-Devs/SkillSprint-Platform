import dotenv from "dotenv";
dotenv.config();

// ── ENV VALIDATION ──────────────────────────────────────────────────────────
const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET", "CLIENT_URL"];
const MISSING_ENV = REQUIRED_ENV.filter((key) => !process.env[key]);
if (MISSING_ENV.length > 0) {
  console.error(`[Startup] Missing required environment variables: ${MISSING_ENV.join(", ")}`);
  console.error("[Startup] The server will continue, but features relying on these vars (email links, auth) may not work correctly.");
}
// ────────────────────────────────────────────────────────────────────────────

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
import libraryRoutes from "./routes/libraryRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import liveSessionRoutes from "./routes/liveSessionRoutes.js";
import Board from "./models/board.js";
import tasksRouter from "./routes/taskRoutes.js";
import pairProgrammingSocket from "./socket/pair-programming-sio.js";
import liveSessionSocket from "./socket/live-session-sio.js";
import pairProgrammingRoutes from './routes/pair-programmingRoutes.js';
import chatRoutes from "./routes/chatRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import quizRoutes from "./routes/quizRoutes.js";
import certificateRoutes from "./routes/certificateRoutes.js";
import reminderRoutes from "./routes/reminderRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import invitationRoutes from "./routes/invitationRoutes.js";
import errorRoutes from "./routes/errorRoutes.js";
import errorHandler from "./middleware/errorHandler.js";
import { initTaskScheduler } from "./utils/taskScheduler.js";
import ErrorLog from "./models/ErrorLog.js";

// --- CONSOLE ERROR INTERCEPTOR ---
// Captures all console.error calls and saves them to MongoDB
const originalConsoleError = console.error;
console.error = (...args) => {
  originalConsoleError.apply(console, args);

  try {
    const errorMessage = args.map(arg => {
      if (arg instanceof Error) return arg.stack || arg.message;
      if (typeof arg === 'object') {
        try { return JSON.stringify(arg); } catch (e) { return "[Object]"; }
      }
      return String(arg);
    }).join(' ');

    if (mongoose.connection.readyState === 1) {
      // Don't try to log "connection closed" errors into the DB (prevents infinite loops/noise)
      if (errorMessage.includes('connection <monitor> closed') ||
        errorMessage.includes('MongoServerSelectionError') ||
        errorMessage.includes('[Interceptor]')) {
        return;
      }

      // Use the model directly to avoid recursive calls if possible
      ErrorLog.create({
        errorMessage: errorMessage.substring(0, 5000),
        errorType: 'Backend',
        severity: 'Critical',
        stackTrace: new Error().stack?.substring(0, 2000),
        environment: process.env.NODE_ENV || 'Development',
        status: 'NEW'
      }).catch(_ => {
        // Silently fail using the lowest level output possible
        process.stderr.write(`[Interceptor] Storage Failed\n`);
      });
    }
  } catch (interceptErr) {
    process.stdout.write(`[Interceptor] Global Crash: ${interceptErr.message}\n`);
  }
};


const app = express();

// MIDDLEWARE 
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.originalUrl}`);
  next();
});

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: false,
  })
);

app.options(/.*/, cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// DATABASE CONNECTION 
mongoose.set('bufferCommands', false);

mongoose
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
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
  transports: ["websocket", "polling"], // Explicitly set transports
});

app.set("io", io);

pairProgrammingSocket(io);
liveSessionSocket(io);

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
      socket.data.user = {
        id: decoded.id || decoded._id || decoded.userId,
        role: decoded.role
      };
      socket.data.joinedBoards = new Set();
      return next();
    });
  } catch (e) {
    console.error("Socket auth error:", e);
    return next(new Error("Auth error"));
  }
});

const onlineUsers = new Map(); // userId -> Set<socketId>

// Expose onlineUsers to routes for admin dashboard
app.set('onlineUsers', onlineUsers);

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
          { $addToSet: { activeUsers: new mongoose.Types.ObjectId(userId) } },
          { new: true }
        );
      } catch (e) {
        console.error("Error updating Board.activeUsers on join:", e);
      }

      io.to(boardId.toString()).emit("board:user:joined", { boardId, userId, socketId: socket.id });

      //presence emit
      const board = await Board.findById(boardId)
        .populate("activeUsers", "name profile_image colorTag")
        .select("activeUsers");

      const activeUsers = board?.activeUsers?.map(u => ({
        _id: u._id,
        name: u.name,
        profile_image: u.profile_image,
        colorTag: u.colorTag
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
          { $pull: { activeUsers: new mongoose.Types.ObjectId(userId) } },
          { new: true }
        );
      } catch (e) {
        console.error("Error updating Board.activeUsers on leave:", e);
      }

      io.to(boardId.toString()).emit("board:user:left", { boardId, userId, socketId: socket.id });

      //presence emit
      const board = await Board.findById(boardId)
        .populate("activeUsers", "name profile_image colorTag")
        .select("activeUsers");

      const activeUsers = board?.activeUsers?.map(u => ({
        _id: u._id,
        name: u.name,
        profile_image: u.profile_image,
        colorTag: u.colorTag
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
              { $pull: { activeUsers: new mongoose.Types.ObjectId(userId) } },
              { new: true }
            );

            io.to(boardId.toString()).emit("board:user:left", { boardId, userId, socketId: socket.id });

            //presence emit
            const board = await Board.findById(boardId)
              .populate("activeUsers", "name profile_image colorTag")
              .select("activeUsers");

            const activeUsers = board?.activeUsers?.map(u => ({
              _id: u._id,
              name: u.name,
              profile_image: u.profile_image,
              colorTag: u.colorTag,
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
app.get("/api/status", (req, res) => {
  res.json({
    status: "ok",
    version: "1.2.0",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    mongodb_state: mongoose.connection.readyState,
    debug_time: new Date().toISOString()
  });
});

// TEST ROUTE: Trigger an error to test DB persistence
app.get("/api/test-error-log", (req, res) => {
  console.error("TEST_ERROR_LOG: This is a manual test error to verify DB persistence.");
  res.json({ message: "Error triggered. Check server console and ErrorLog DB collection." });
});
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/posting", postingRoutes);
app.use("/api/board", boardRoutes);
app.use("/api/library", libraryRoutes);
app.use("/api/wallet", walletRoutes);
console.log("Registering /api/live-sessions route...");
app.use("/api/live-sessions", liveSessionRoutes);
app.use("/api/tasks", tasksRouter);
app.use('/api/pair-programming', pairProgrammingRoutes);
app.use("/api/chat", chatRoutes);
console.log("Registering /api/notifications route...");
app.use("/api/notifications", notificationRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/reminders", reminderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/invitations", invitationRoutes);
app.use("/api/errors", errorRoutes);

// Favicon handler
app.get("/favicon.ico", (req, res) => res.status(204).end());

// JSON 404 for API (after all routes)
app.use("/api", (req, res) => {
  res.status(404).json({ message: `API endpoint not found: ${req.method} ${req.originalUrl}` });
});

app.use("/uploads", express.static("uploads"));
const frontendPath = path.join(__dirname, "../frontend");
console.log("Serving static files from:", frontendPath);
app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// Error handler middleware (at the end of all routes)
app.use(errorHandler);

// SERVER START
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://localhost:${PORT}/api/status`);

  // Initialize task reminder scheduler
  initTaskScheduler(io);
});

// GRACEFUL SHUTDOWN
const gracefulShutdown = () => {
  console.log("Received kill signal, shutting down gracefully...");
  server.close(() => {
    console.log("Closed out remaining connections.");
    mongoose.connection.close().then(() => {
      console.log("MongoDB connection closed.");
      process.exit(0);
    }).catch(err => {
      console.error("Error during MongoDB close:", err);
      process.exit(1);
    });
  });

  // Force close after 10s
  setTimeout(() => {
    console.error("Could not close connections in time, forcefully shutting down");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

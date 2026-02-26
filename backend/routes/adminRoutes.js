import express from "express";
import User from "../models/user.js";
import LiveSession from "../models/liveSession.js";
import ActivityLog from "../models/activityLog.js";
import PairProgramming from "../models/pair-programming.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Require valid JWT + admin role on all admin routes
const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
    }
    next();
};

router.use(verifyToken, requireAdmin);

// GET /api/admin/stats
router.get("/stats", async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();

        // Get REAL online users count from socket connections
        const onlineUsersMap = req.app.get('onlineUsers');
        const onlineUsers = onlineUsersMap ? onlineUsersMap.size : 0;

        // Count LIVE SESSIONS (not boards) with status = "live"
        const activeSessions = await LiveSession.countDocuments({ status: "live" });

        // Add projects count for future dashboard enhancement
        const totalProjects = await PairProgramming.countDocuments();

        res.json({
            success: true,
            stats: {
                totalUsers,
                onlineUsers,
                activeSessions,
                totalProjects
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/admin/activity
router.get("/activity", async (req, res) => {
    try {

        // Attempting to use ActivityLog if available, else fallback to Users (recently created)
        let activities = [];

        // Check if ActivityLog has data (assuming it logs signups, logins, etc.)
        const logs = await ActivityLog.find().sort({ createdAt: -1 }).limit(10).populate("user", "name role");

        if (logs && logs.length > 0) {
            activities = logs.map(log => ({
                text: log.action || "Action performed",
                subtext: log.details || "",
                time: log.createdAt,
                type: "info" // or determine based on action
            }));
        } else {
            // Fallback: Recent Users
            const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5);
            activities = recentUsers.map(u => ({
                text: "New User Joined",
                subtext: `${u.name} (${u.role || 'User'}) joined`,
                time: u.createdAt,
                type: "success"
            }));
        }

        res.json({ success: true, activities });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/admin/users-preview
router.get("/users-preview", async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 }).limit(5).select("name role isOnline createdAt");
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/admin/health
// Real system health monitoring
router.get("/health", async (req, res) => {
    try {
        const health = {
            status: "healthy",
            timestamp: new Date(),
            checks: {}
        };

        // 1. Database Connection Check
        const mongoose = (await import("mongoose")).default;
        const dbState = mongoose.connection.readyState;
        const dbStatus = {
            0: "disconnected",
            1: "connected",
            2: "connecting",
            3: "disconnecting"
        };

        health.checks.database = {
            status: dbState === 1 ? "healthy" : "unhealthy",
            state: dbStatus[dbState] || "unknown",
            healthy: dbState === 1
        };

        // 2. Error Rate Check (last hour)
        const ErrorLog = (await import("../models/ErrorLog.js")).default;
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentErrors = await ErrorLog.countDocuments({
            timestamp: { $gte: oneHourAgo },
            severity: { $in: ["High", "Critical"] }
        });

        health.checks.errorRate = {
            status: recentErrors < 10 ? "healthy" : recentErrors < 50 ? "warning" : "critical",
            count: recentErrors,
            period: "last_hour",
            healthy: recentErrors < 10
        };

        // 3. Memory Usage Check
        const memUsage = process.memoryUsage();
        const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
        const memPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

        health.checks.memory = {
            status: memPercent < 80 ? "healthy" : memPercent < 90 ? "warning" : "critical",
            usedMB: memUsedMB,
            totalMB: memTotalMB,
            percentage: memPercent,
            healthy: memPercent < 80
        };

        // 4. Uptime Check
        const uptimeSeconds = Math.floor(process.uptime());
        health.checks.uptime = {
            status: "healthy",
            seconds: uptimeSeconds,
            formatted: formatUptime(uptimeSeconds),
            healthy: true
        };

        // Overall Health Status
        const allHealthy = Object.values(health.checks).every(check => check.healthy);
        const anyWarning = Object.values(health.checks).some(check => check.status === "warning");
        const anyCritical = Object.values(health.checks).some(check => check.status === "critical");

        if (anyCritical) {
            health.status = "critical";
        } else if (anyWarning) {
            health.status = "degraded";
        } else if (allHealthy) {
            health.status = "healthy";
        } else {
            health.status = "unknown";
        }

        res.json({ success: true, health });
    } catch (err) {
        res.status(500).json({
            success: false,
            health: {
                status: "error",
                message: err.message
            }
        });
    }
});

// Helper function to format uptime
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
}

// POST /api/admin/make-admin
// Temporary endpoint to grant admin privileges
router.post("/make-admin", async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: "Email required" });
        }

        const user = await User.findOneAndUpdate(
            { email: email },
            { $set: { role: "admin" } },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.json({
            success: true,
            message: `User ${user.email} is now an admin`,
            user: { name: user.name, email: user.email, role: user.role }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;

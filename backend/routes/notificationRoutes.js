import express from "express";
import Notification from "../models/notification.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

console.log("Notification routes module loaded");

router.get("/ping", (req, res) => {
    res.json({ message: "pong" });
});

// GET all notifications for the user
router.get("/", verifyToken, async (req, res) => {
    try {
        const notifications = await Notification.find({ user_id: req.user.id })
            .sort({ created_at: -1 }); // Newest first
        res.json(notifications);
    } catch (err) {
        console.error("Error fetching notifications:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// POST a new notification (Manual/System)
router.post("/", verifyToken, async (req, res) => {
    try {
        const { title, message, type, link, user_id } = req.body;

        // Allow sending to self if no user_id provided, or specific user if admin (logic can be expanded)
        // For now, assuming self or validated logic.
        // If user_id is provided, use it. Otherwise default to current user? 
        // Actually, usually you post a notification FOR someone. 
        // The requester might be the system or another user. 
        // Let's assume the body contains the target user_id. 
        // If not provided, maybe default to self for testing.

        const targetUserId = user_id || req.user.id;

        if (!title || !message) {
            return res.status(400).json({ message: "Title and message are required" });
        }

        const notification = new Notification({
            user_id: targetUserId,
            title,
            message,
            type: type || "system",
            link: link || "",
        });

        await notification.save();

        const io = req.app.get("io");
        if (io) {
            io.to(targetUserId.toString()).emit("notification", notification);
        }

        res.status(201).json(notification);
    } catch (err) {
        console.error("Error creating notification:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// DELETE all notifications for the user
router.delete("/", verifyToken, async (req, res) => {
    try {
        await Notification.deleteMany({ user_id: req.user.id });
        res.json({ message: "All notifications cleared" });
    } catch (err) {
        console.error("Error clearing notifications:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// GET unread count
router.get("/unread-count", verifyToken, async (req, res) => {
    try {
        const count = await Notification.countDocuments({ user_id: req.user.id, is_read: false });
        res.json({ count });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// DELETE a notification (single)
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);

        if (!notification) {
            return res.status(404).json({ message: "Notification not found" });
        }

        // Ensure user owns the notification
        if (notification.user_id.toString() !== req.user.id) {
            return res.status(403).json({ message: "Not authorized" });
        }

        await notification.deleteOne();
        res.json({ message: "Notification removed" });
    } catch (err) {
        console.error("Error deleting notification:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// Mark as read (optional future use)
router.put("/:id/read", verifyToken, async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);
        if (!notification) return res.status(404).json({ message: "Not found" });

        if (notification.user_id.toString() !== req.user.id) {
            return res.status(403).json({ message: "Not authorized" });
        }

        notification.is_read = true;
        await notification.save();
        res.json(notification);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

export default router;

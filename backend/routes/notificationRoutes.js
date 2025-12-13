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

// DELETE a notification
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

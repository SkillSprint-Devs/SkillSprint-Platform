import express from "express";
import Reminder from "../models/reminder.js";
import Notification from "../models/notification.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/reminders - List all reminders for the user
router.get("/", verifyToken, async (req, res) => {
    try {
        const reminders = await Reminder.find({ user: req.user.id }).sort({
            completed: 1, // Uncompleted first
            dueDate: 1,   // Then by due date
            createdAt: -1 // Newest first if no due date
        });
        res.json(reminders);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// POST /api/reminders - Create a reminder
router.post("/", verifyToken, async (req, res) => {
    try {
        const { text, dueDate } = req.body;
        if (!text) return res.status(400).json({ message: "Text is required" });

        const reminder = new Reminder({
            user: req.user.id,
            text,
            dueDate: dueDate ? new Date(dueDate) : undefined
        });

        await reminder.save();

        // Create notification for reminder creation
        try {
            const notification = new Notification({
                user_id: req.user.id,
                title: "Reminder Set",
                message: `Reminder set: "${text}"`,
                type: "reminder",
                link: `/dashboard`, // or wherever reminders are viewed
            });
            await notification.save();

            const io = req.app.get("io");
            if (io) {
                io.to(req.user.id.toString()).emit("notification", notification);
            }
        } catch (notifErr) {
            console.error("Failed to create reminder notification:", notifErr);
        }

        res.status(201).json(reminder);
    } catch (err) {
        console.error("Create reminder error:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// PATCH /api/reminders/:id - Update reminder (toggle completed)
router.patch("/:id", verifyToken, async (req, res) => {
    try {
        const { completed } = req.body;
        const reminder = await Reminder.findOneAndUpdate(
            { _id: req.params.id, user: req.user.id },
            { completed },
            { new: true }
        );

        if (!reminder) return res.status(404).json({ message: "Reminder not found" });
        res.json(reminder);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// DELETE /api/reminders/:id - Delete reminder
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const result = await Reminder.deleteOne({ _id: req.params.id, user: req.user.id });
        if (result.deletedCount === 0) return res.status(404).json({ message: "Reminder not found" });
        res.json({ message: "Reminder deleted" });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

export default router;

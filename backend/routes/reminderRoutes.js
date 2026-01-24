import express from "express";
import Reminder from "../models/reminder.js";
import Notification from "../models/notification.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/reminders - List all reminders for the user
router.get("/", verifyToken, async (req, res) => {
    try {
        const reminders = await Reminder.find({ user_id: req.user.id }).sort({
            is_done: 1, // Uncompleted first
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
        const { text, dueDate, dueTime } = req.body;
        if (!text) return res.status(400).json({ message: "Text is required" });
        if (!dueTime) return res.status(400).json({ message: "Time is required for reminders" });

        const reminder = new Reminder({
            user_id: req.user.id,
            text,
            dueTime,
            dueDate: dueDate ? new Date(dueDate) : undefined
        });

        await reminder.save();

        // Create notification for reminder creation
        const io = req.app.get("io");
        try {
            const notification = new Notification({
                user_id: req.user.id,
                title: "Reminder Set",
                message: `Reminder set: "${text}"`,
                type: "reminder",
                link: `/dashboard`, // or wherever reminders are viewed
            });
            await notification.save();

            if (io) {
                io.to(req.user.id.toString()).emit("notification", notification);
                io.to(req.user.id.toString()).emit("reminder_created", reminder);
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

// PATCH /api/reminders/:id - Update reminder (toggle is_done)
router.patch("/:id", verifyToken, async (req, res) => {
    try {
        const { completed } = req.body; // Incoming still labeled 'completed' from JS, but map to 'is_done'
        const reminder = await Reminder.findOneAndUpdate(
            { _id: req.params.id, user_id: req.user.id },
            { is_done: completed },
            { new: true }
        );

        if (!reminder) return res.status(404).json({ message: "Reminder not found" });

        const io = req.app.get("io");
        if (io) {
            io.to(req.user.id.toString()).emit("reminder_updated", reminder);
        }

        res.json(reminder);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// DELETE /api/reminders/:id - Delete reminder
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        console.log(`[DELETE] Reminder ID: ${req.params.id} for User: ${req.user.id}`);
        // Ensure user_id is compared correctly (it's often stored as an ObjectId but req.user.id might be a string)
        const result = await Reminder.deleteOne({
            _id: req.params.id,
            user_id: req.user.id
        });

        if (result.deletedCount === 0) {
            console.warn(`Reminder ${req.params.id} not found or unauthorized for delete`);
            return res.status(404).json({ message: "Reminder not found" });
        }

        console.log(`Reminder ${req.params.id} deleted successfully`);

        const io = req.app.get("io");
        if (io) {
            io.to(req.user.id.toString()).emit("reminder_deleted", { reminderId: req.params.id });
        }

        res.json({ message: "Reminder deleted" });
    } catch (err) {
        console.error("Delete reminder error:", err);
        res.status(500).json({ message: "Server error" });
    }
});

export default router;

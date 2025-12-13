import express from "express";
import jwt from "jsonwebtoken";

// import all models
import User from "../models/user.js";
import Project from "../models/project.js";
import Task from "../models/task.js";
import Wallet from "../models/wallet.js";
import Reminder from "../models/reminder.js";
import Notification from "../models/notification.js";
import ActivityLog from "../models/activityLog.js";
import Library from "../models/library.js";

import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

/*
   GET — Dashboard Data
*/
router.get("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;


    const user = await User.findById(userId).select(
      "name role credits_remaining credits_earned total_hours_spent profile_image email"
    );
    if (!user) return res.status(404).json({ message: "User not found" });


    const notifications =
      (await Notification.find({ user_id: userId })
        .sort({ created_at: -1 })
        .limit(5)) || [];


    const tasks =
      (await Task.find({ user: userId, status: { $ne: "completed" } })
        .sort({ created_at: -1 })
        .limit(3)) || [];


    const walletEntries = (await Wallet.find({ user_id: userId })) || [];
    const earned = walletEntries
      .filter((t) => t.credit_type === "earned")
      .reduce((sum, t) => sum + t.amount, 0);
    const spent = walletEntries
      .filter((t) => t.credit_type === "spent")
      .reduce((sum, t) => sum + t.amount, 0);

    const wallet = {
      remaining_time: user.credits_remaining || 0,
      earned,
      spent,
    };


    const reminders =
      (await Reminder.find({ user_id: userId, is_done: false })
        .sort({ date_time: 1 })
        .limit(3)) || [];

    const activity =
      (await ActivityLog.find({ user_id: userId })
        .sort({ date: -1 })
        .limit(7)) || [];


    const projects =
      (await Project.find({ created_by: userId })
        .sort({ created_at: -1 })
        .limit(3)) || [];


    const library =
      (await Library.find({ user_id: userId })
        .sort({ date_earned: -1 })
        .limit(3)) || [];


    res.json({
      user,
      wallet,
      notifications,
      tasks,
      reminders,
      activity,
      projects,
      library,
    });
  } catch (error) {
    console.error("Dashboard fetch error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

export default router;
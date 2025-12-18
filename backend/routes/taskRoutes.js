import express from "express";
import Task from "../models/task.js";
import Notification from "../models/notification.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();


// ========================================================
// CREATE NEW TASK
// ========================================================
router.post("/", verifyToken, async (req, res) => {
  try {
    const { title, description, priority, status, dueDate, subTasks } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: "Title and Description are required" });
    }

    //  attach logged-in user to the new task
    const task = await Task.create({
      title,
      description,
      priority,
      status,
      dueDate,
      subTasks: subTasks || [],
      user: req.user.id   // <--- IMPORTANT
    });

    // Create notification for task creation
    try {
      const notification = new Notification({
        user_id: req.user.id,
        title: "Task Created",
        message: `Your task "${title}" has been created`,
        type: "task",
        link: `/task`,
      });
      await notification.save();

      const io = req.app.get("io");
      if (io) {
        io.to(req.user.id.toString()).emit("notification", notification);
      }
    } catch (notifErr) {
      console.error("Failed to create task notification:", notifErr);
    }

    res.status(201).json(task);
  } catch (err) {
    console.error("Create task error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


// ========================================================
// GET ALL TASKS FOR CURRENT USER
// ========================================================
// router.get("/", verifyToken, async (req, res) => {
//   try {
//      // Filter by user so each user only sees their own tasks
//     const tasks = await Task.find({
//       user: req.user.id,                 // <--- IMPORTANT
//       status: { $ne: "completed" }
//     }).sort({ createdAt: -1 });

//     res.json(tasks);
//   } catch (err) {
//     console.error("Get tasks error:", err);
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// });

// In your GET route, add support for status query
router.get("/", verifyToken, async (req, res) => {
  const { status } = req.query;
  const query = { user: req.user.id };

  if (status === 'completed') {
    query.status = 'completed';
  } else {
    query.status = { $ne: "completed" };
  }

  const tasks = await Task.find(query).sort({ createdAt: -1 });
  res.json(tasks);
});

// ========================================================
// GET SINGLE TASK FOR CURRENT USER
// ========================================================
router.get("/:id", verifyToken, async (req, res) => {
  try {
    // Ensures users can't access others’ tasks
    const task = await Task.findOne({
      _id: req.params.id,
      user: req.user.id   // <--- IMPORTANT
    });

    if (!task) return res.status(404).json({ message: "Task not found" });

    res.json(task);
  } catch (err) {
    console.error("Get task error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


// ========================================================
// UPDATE TASK (ONLY USER'S OWN TASK)
// ========================================================
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const updates = req.body;

    // Basic validation
    if (updates.status) {
      const validStatuses = ["open", "in_progress", "completed"];
      if (!validStatuses.includes(updates.status)) {
        return res.status(400).json({ message: `Invalid status.` });
      }
    }

    //  user scoping + secure update
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },  // <--- IMPORTANT
      updates,
      { new: true }
    );

    if (!task) return res.status(404).json({ message: "Task not found" });

    // Create notification for task update (only for status changes)
    if (updates.status) {
      try {
        const statusMessages = {
          "open": "reopened",
          "in_progress": "is now in progress",
          "completed": "has been completed"
        };
        const notification = new Notification({
          user_id: req.user.id,
          title: "Task Updated",
          message: `Your task "${task.title}" ${statusMessages[updates.status] || 'was updated'}`,
          type: "task",
          link: `/task`,
        });
        await notification.save();

        const io = req.app.get("io");
        if (io) {
          io.to(req.user.id.toString()).emit("notification", notification);
        }
      } catch (notifErr) {
        console.error("Failed to create task update notification:", notifErr);
      }
    }

    res.json(task);
  } catch (err) {
    console.error("Update task error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


// ========================================================
// DELETE TASK (ONLY USER'S OWN TASK)
// ========================================================
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    //  user scoping for delete
    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id   // <--- IMPORTANT
    });

    if (!task) return res.status(404).json({ message: "Task not found" });

    res.json({ message: "Task deleted successfully" });
  } catch (err) {
    console.error("Delete task error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


// ========================================================
// MARK TASK AS COMPLETED (USER ONLY)
// ========================================================
router.post("/:id/complete", verifyToken, async (req, res) => {
  try {
    //  ensure only owner can complete the task
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },  // <--- IMPORTANT
      { status: "completed" },
      { new: true }
    );

    if (!task) return res.status(404).json({ message: "Task not found" });

    res.json(task);
  } catch (err) {
    console.error("Mark complete error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


export default router;
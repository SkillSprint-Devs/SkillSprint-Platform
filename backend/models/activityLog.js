import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId, // FK → Users._id
    ref: "User",
    required: true,
  },
  date: {
    type: Date,
    default: Date.now, // log date automatically
  },
  hours_spent: {
    type: Number,
    required: true,
    min: 0,
  },
  category: {
    type: String, // e.g. "Task", "Learning"
    required: true,
    enum: ["Task", "Learning", "Collaboration"], // optional set of categories
  },
});

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);

export default ActivityLog;

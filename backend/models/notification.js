import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId, // FK - Users._id
    ref: "User",
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ["system", "chat", "task", "invite", "reminder", "general"],
    default: "system"
  },
  link: {
    type: String, // could store related project/task id or URL
    default: "",
  },
  is_read: {
    type: Boolean,
    default: false,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;

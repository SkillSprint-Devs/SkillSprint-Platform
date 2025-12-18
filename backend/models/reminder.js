import mongoose from "mongoose";

const reminderSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true
  },
  dueTime: {
    type: String
  },
  dueDate: {
    type: Date
  },
  is_done: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Reminder = mongoose.model("Reminder", reminderSchema);
export default Reminder;

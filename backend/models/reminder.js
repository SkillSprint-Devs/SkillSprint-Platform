import mongoose from "mongoose";

const reminderSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId, // FK - Users._id
    ref: "User",
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  date_time: {
    type: Date,
    required: true,
  },
  is_done: {
    type: Boolean,
    default: false,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

const Reminder = mongoose.model("Reminder", reminderSchema);

export default Reminder;

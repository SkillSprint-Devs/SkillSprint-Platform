import mongoose from "mongoose";

const taskSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // add this!
  title: { type: String, required: [true, 'Title is required'], trim: true },
  description: { type: String, required: [true, 'Description is required'], trim: true },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  status: { type: String, enum: ['open', 'in_progress', 'completed'], default: 'open' },
  dueDate: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Automatically update updatedAt before save
taskSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Task = mongoose.model("Task", taskSchema);

export default Task;


// import mongoose from "mongoose";

// const taskSchema = new mongoose.Schema({
//   title: {
//     type: String,
//     required: true,
//   },
//   description: {
//     type: String,
//     default: "",
//   },
//   assigned_by: {
//     type: mongoose.Schema.Types.ObjectId, // FK - Users._id
//     ref: "User",
//     required: true,
//   },
//   assigned_to: {
//     type: mongoose.Schema.Types.ObjectId, // FK - Users._id
//     ref: "User",
//     required: true,
//   },
//   type: {
//     type: String,
//     enum: ["internship-task", "collaboration"],
//     default: "collaboration",
//   },
//   status: {
//     type: String,
//     enum: ["pending", "in-progress", "completed"],
//     default: "pending",
//   },
//   progress: {
//     type: Number,
//     min: 0,
//     max: 100,
//     default: 0,
//   },
//   due_date: {
//     type: Date,
//     required: false,
//   },
//   category: {
//     type: String,
//     default: "",
//   },
//   project_id: {
//     type: mongoose.Schema.Types.ObjectId, // FK - Projects._id
//     ref: "Project",
//     required: false,
//   },
//   created_at: {
//     type: Date,
//     default: Date.now,
//   },
// });

// const Task = mongoose.model("Task", taskSchema);

// export default Task;

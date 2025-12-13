import mongoose from "mongoose";

const projectSchema = new mongoose.Schema({
  project_name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: "",
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId, // FK - Users._id
    ref: "User",
    required: true,
  },
  status: {
    type: String,
    enum: ["active", "completed"],
    default: "active",
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

const Project = mongoose.model("Project", projectSchema);

export default Project;

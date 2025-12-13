import mongoose from "mongoose";

const projectMemberSchema = new mongoose.Schema({
  project_id: {
    type: mongoose.Schema.Types.ObjectId, // FK - Projects._id
    ref: "Project",
    required: true,
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId, // FK - Users._id
    ref: "User",
    required: true,
  },
  role: {
    type: String,
    enum: ["collaborator", "viewer"],
    default: "viewer",
  },
  joined_at: {
    type: Date,
    default: Date.now,
  },
});

const ProjectMember = mongoose.model("ProjectMember", projectMemberSchema);

export default ProjectMember;

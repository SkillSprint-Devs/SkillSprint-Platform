import mongoose from "mongoose";

const librarySchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId, // FK - Users._id
    ref: "User",
    required: true,
  },
  title: {
    type: String,
    required: true, // resource or course name
  },
  description: {
    type: String,
    default: "",
  },
  type: {
    type: String,
    required: true,
    enum: ["Note", "Recording", "Document", "Other"],
  },
  file_url: {
    type: String,
    default: "", // link to file or certificate
  },
  file_size: {
    type: Number, // in bytes
    default: 0,
  },
  file_ext: {
    type: String, // e.g., ".pdf", ".mp4"
    default: "",
  },
  visibility: {
    type: String,
    enum: ["Public", "Private"],
    default: "Private",
  },
  owner_name: {
    type: String,
    default: "Unknown",
  },
  date_added: {
    type: Date,
    default: Date.now,
  },
});

const Library = mongoose.model("Library", librarySchema);

export default Library;

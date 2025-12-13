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
  type: {
    type: String,
    required: true, // e.g. "course", "certificate"
    enum: ["course", "certificate", "file", "other"], // optional for validation
  },
  file_url: {
    type: String,
    default: "", // link to file or certificate
  },
  date_earned: {
    type: Date,
    default: Date.now, // completion or upload date
  },
});

const Library = mongoose.model("Library", librarySchema);

export default Library;

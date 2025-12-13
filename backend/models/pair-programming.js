// models/pair-programming.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const CommentSchema = new Schema({
  text: String,
  line: Number,
  authorId: { type: Schema.Types.ObjectId, ref: "User" },
  authorName: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { _id: true });

const RunSchema = new Schema({
  code: String,
  language: { type: String, enum: ["js", "html", "css", "python", "php"] },
  output: String,
  error: String,
  status: { type: String, enum: ["success", "error"], default: "success" },
  executedAt: { type: Date, default: Date.now },
});

const FileSchema = new Schema({
  name: { type: String, required: true },
  content: { type: String, default: "" },
  language: { type: String, enum: ["js", "html", "css", "python", "php"], default: "js" },
  comments: [CommentSchema],
  runs: [RunSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const FolderSchema = new Schema({
  name: { type: String, required: true },
  files: [FileSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const PairProgrammingSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],
    permissions: {
      editors: [{ type: Schema.Types.ObjectId, ref: "User" }],
      commenters: [{ type: Schema.Types.ObjectId, ref: "User" }],
      viewers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    },
    folders: [FolderSchema],
    comments: [CommentSchema],
  },
  { timestamps: true }
);

export default mongoose.model("PairProgramming", PairProgrammingSchema);
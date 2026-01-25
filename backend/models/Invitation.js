
import mongoose from "mongoose";

const InvitationSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    projectType: { type: String, enum: ["Board", "PairProgramming"], required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'projectType' },
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
    permission: { type: String, enum: ["viewer", "commenter", "editor", "owner"], default: "viewer" },
    createdAt: { type: Date, default: Date.now }
});

// Index for fast lookup of pending invites for a user
InvitationSchema.index({ recipient: 1, status: 1 });

export default mongoose.model("Invitation", InvitationSchema);

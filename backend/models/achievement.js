import mongoose from "mongoose";
import { COURSES, LEVELS } from "./question.js";

const achievementSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    course: {
        type: String,
        enum: COURSES,
        required: true,
        index: true
    },
    level: {
        type: String,
        enum: LEVELS,
        required: false // Nullable for course-level certificates
    },
    achievementType: {
        type: String,
        enum: ["badge", "certificate"],
        required: true
    },
    badgeTier: {
        type: String,
        enum: ["silver", "gold", null],
        default: null
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    awardedAt: {
        type: Date,
        default: Date.now
    },
    overallScore: {
        type: Number,
        required: false
    },
    verificationId: {
        type: String,
        required: false
    }
});

// Ensure unique achievements per user, course, and level (or certificate)
achievementSchema.index({ user: 1, course: 1, level: 1, achievementType: 1 }, { unique: true });

const Achievement = mongoose.model("Achievement", achievementSchema);
export default Achievement;

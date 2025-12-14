import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { COURSES } from "./question.js";

const certificateSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    course: {
        type: String,
        enum: COURSES,
        required: true
    },
    // Unique verification ID for public verification
    verificationId: {
        type: String,
        unique: true,
        default: () => uuidv4(),
        index: true
    },
    // Best scores per level that earned this certificate
    levelScores: {
        basic: { type: Number, required: true },
        intermediate: { type: Number, required: true },
        advanced: { type: Number, required: true }
    },
    // Overall score = average of level scores
    overallScore: {
        type: Number,
        required: true
    },
    issuedAt: {
        type: Date,
        default: Date.now
    }
});

// One certificate per user per course
certificateSchema.index({ user: 1, course: 1 }, { unique: true });

const Certificate = mongoose.model("Certificate", certificateSchema);
export default Certificate;

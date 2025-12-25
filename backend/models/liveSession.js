import mongoose from "mongoose";

const liveSessionSchema = new mongoose.Schema({
    sessionName: {
        type: String,
        required: true,
        trim: true,
    },
    purpose: {
        type: String,
        required: true,
    },
    mentorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    invitedUserIds: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    ],
    acceptedUserIds: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    ],
    maxParticipants: {
        type: Number,
        default: 3,
        max: 3,
    },
    durationMinutes: {
        type: Number,
        required: true,
        min: 45,
        max: 75,
    },
    scheduledDateTime: {
        type: Date,
        required: true,
    },
    status: {
        type: String,
        enum: ["scheduled", "live", "completed", "cancelled"],
        default: "scheduled",
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const LiveSession = mongoose.model("LiveSession", liveSessionSchema);

export default LiveSession;

import mongoose from "mongoose";

const walletTransactionSchema = new mongoose.Schema({
    wallet_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Wallet",
        required: true,
    },
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LiveSession",
    },
    sessionName: String,
    role: {
        type: String,
        enum: ["mentor", "learner", "system"],
    },
    type: {
        type: String,
        enum: ["weekly-reset", "session-earn", "session-spend"],
        required: true,
    },
    amount: {
        type: Number, // minutes
        required: true,
    },
    durationMinutes: Number, // Original session duration
    mentorName: String, // Name of the mentor for this session
    timestamp: {
        type: Date,
        default: Date.now,
    },
});

const WalletTransaction = mongoose.model("WalletTransaction", walletTransactionSchema);

export default WalletTransaction;

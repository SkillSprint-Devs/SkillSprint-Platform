import mongoose from "mongoose";

const walletSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  available_credits: {
    type: Number,
    default: 180, // 3h weekly grant
  },
  weekly_limit: {
    type: Number,
    default: 330, // 5h 30m hard cap
  },
  last_reset_date: {
    type: Date,
    default: Date.now,
  },
  next_reset_date: {
    type: Date,
    required: true,
  },
});

const Wallet = mongoose.model("Wallet", walletSchema);

export default Wallet;

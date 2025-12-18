import mongoose from "mongoose";

const walletSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId, // FK - Users._id
    ref: "User",
    required: true,
  },
  credit_type: {
    type: String,
    enum: ["earned", "spent"], // only two options
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  activity_ref: {
    type: mongoose.Schema.Types.ObjectId, // can link to task or project
    refPath: "activity_model", // dynamic reference
  },
  activity_model: {
    type: String,
    enum: ["Task"], // model names for refPath
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const Wallet = mongoose.model("Wallet", walletSchema);

export default Wallet;

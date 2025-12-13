import mongoose from "mongoose";

function arrayLimit(val) {
  return val.length <= 3;
}

const postSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      trim: true,
    },
    media: {
      type: [
        {
          url: { type: String, required: true },
          type: { type: String, required: true },
        },
      ],
      validate: [arrayLimit, "You can upload up to 3 images only."],
      default: [],
    },

    // <--- NEW: keep an array of user ids who liked for quick access
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },  
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Post", postSchema);

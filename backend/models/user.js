import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  // 🧍 BASIC INFO
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  profile_image: { type: String, default: "" },
  role: { type: String, enum: ["student", "mentor", "admin"], required: true },

  // 💬 PERSONAL INFO
  phone: { type: String, default: "" },
  location: { type: String, default: "" },           // e.g. "Remote – Pakistan"
  bio: { type: String, default: "" },                // short intro
  availability: { type: String, default: "available" }, // or "busy", "open to collab"

  // 💼 PROFESSIONAL INFO
  designation: { type: String, default: "" },        // e.g. "Frontend Developer"
  skills: [{ type: String }],                        // ["React", "Node.js", "MongoDB"]
  experience: [
    {
      title: String,                                 // "Frontend Developer"
      company: String,                               // "XYZ Tech"
      start_year: Number,                            // 2022
      end_year: Number,                              // 2024 or null
      description: String,                           // optional details
    },
  ],
  projects: [
    {
      title: String,
      description: String,
      tech_stack: [String],
      link: String,                                  // GitHub/website link
    },
  ],
  achievements: [
    {
      title: String,                                 // "Top 10% in Algorithms Sprint"
      type: { type: String, default: "bronze" },     // bronze/silver/gold
      date: { type: Date, default: Date.now },
    },
  ],
  education: [
    {
      degree: String,                                // "BS Computer Science"
      institution: String,                           // "Szabist University"
      year: Number,
    },
  ],
  certifications: [
    {
      name: String,                                  // "Google Cloud Fundamentals"
      provider: String,                              // "Coursera"
      logo: String,                                  // URL to provider logo
      link: String,                                  // optional certificate link
    },
  ],
  learning_goals: [{ type: String }],                // ["Mastering Cloud Architecture"]

  // 🌐 SOCIAL LINKS
  github: { type: String, default: "" },
  linkedin: { type: String, default: "" },
  portfolio: { type: String, default: "" },

  // 📅 META
  created_at: { type: Date, default: Date.now },

  // 🔐 OTP HANDLING
  otp: { type: String, default: null },
  otpExpires: { type: Date, default: null },

  // 🫂 FOLLOW SYSTEM
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  followers_count: { type: Number, default: 0 },
  following_count: { type: Number, default: 0 },

  // SMARTBOARD
  avatarUrl: { type: String, default: "" },
  colorTag: { type: String, default: "" },
});

// Auto-update counts
userSchema.pre("save", function (next) {
  this.followers_count = Array.isArray(this.followers)
    ? this.followers.length
    : 0;
  this.following_count = Array.isArray(this.following)
    ? this.following.length
    : 0;
  next();
});

const User = mongoose.model("User", userSchema);
export default User;



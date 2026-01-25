import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import { sendOTPEmail } from "../utils/mailService.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import dotenv from "dotenv";
import User from "../models/user.js";
import Otp from "../models/otp.js";
import WalletService from "../utils/walletService.js";
import { updateStreak } from "../utils/streakHelper.js";

dotenv.config();

import { storage } from "../config/cloudinary.js";

function fileFilter(req, file, cb) {
  if (file.mimetype.startsWith("image/")) cb(null, true);
  else cb(new Error("Only image files are allowed!"), false);
}

const upload = multer({ storage, fileFilter });

const router = express.Router();

// Logger middleware
router.use((req, res, next) => {
  console.log(`authRoutes hit: ${req.method} ${req.originalUrl}`);
  next();
});

// REMOVED: Local nodemailer transporter. Using shared mailService.

// REMOVED: Local nodemailer transporter. Using shared mailService.

// REMOVED: Local nodemailer transporter. Using shared mailService.

// Helpers
const validatePassword = (password) => {
  // At least 8 chars, 1 uppercase, 1 number, 1 special char
  const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
  return regex.test(password);
};

const validateUsername = (name) => {
  // Cannot start with number
  if (/^\d/.test(name)) return false;
  // Cannot be all numbers
  if (/^\d+$/.test(name)) return false;
  return true;
};

//  Send Signup OTP 
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 1) Delete any existing OTP for this email (so we don't have duplicates)
    await Otp.deleteMany({ email });

    // 2) Save new OTP to DB
    const newOtp = new Otp({ email, otp });
    await newOtp.save();

    // Use shared service
    await sendOTPEmail(email, otp, "signup");

    res.json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("Send OTP error:", error);
    res.status(500).json({ message: "Server error sending OTP" });
  }
});

// Verify Signup OTP and Create User 
router.post("/verify-signup-otp", async (req, res) => {
  try {
    const { name, email, password, otp } = req.body;
    if (!name || !email || !password || !otp)
      return res.status(400).json({ message: "Missing required fields" });

    // Validate Username
    if (!validateUsername(name)) {
      return res.status(400).json({
        message: "Username cannot start with a number and cannot be all numbers."
      });
    }

    // Validate Password
    if (!validatePassword(password)) {
      return res.status(400).json({
        message: "Password must contain at least 8 characters, including a number, an uppercase letter, and a special character."
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    // Check DB for OTP
    const otpRecord = await Otp.findOne({ email, otp });
    if (!otpRecord) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // If valid, allow creation
    // (Note: No explicit 'verified' flag needed if we proceed immediately)

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      password_hash: hashedPassword,
      role: "student",
      profile_image: "",
    });

    await newUser.save();

    // Create Wallet for new user
    await WalletService.createWallet(newUser._id);

    // Clean up used OTP
    await Otp.deleteMany({ email });


    res.status(201).json({ message: "Signup successful! Please login." });
  } catch (error) {
    console.error("Signup OTP verification error:", error);
    res.status(500).json({ message: "Server error during signup" });
  }
});

//  Login 
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Update Streak on Login
    await updateStreak(user._id);

    res.json({
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        streakCount: user.streakCount,
        longestStreak: user.longestStreak
      },
    });
  } catch (error) {
    console.error("Login error DETAILS:", error);
    res.status(500).json({
      message: "Server error during login",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Forgot Password OTP 
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 5 * 60 * 1000;

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    // Use shared service
    await sendOTPEmail(email, otp, "reset");

    res.json({ message: "Password reset OTP sent successfully." });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Server error during password reset" });
  }
});

// Reset Password 
router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword)
      return res.status(400).json({ message: "Missing fields" });

    // Validate Password
    if (!validatePassword(newPassword)) {
      return res.status(400).json({
        message: "Password must contain at least 8 characters, including a number, an uppercase letter, and a special character."
      });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    if (user.otp !== otp) return res.status(400).json({ message: "Invalid OTP" });

    if (Date.now() > user.otpExpires) return res.status(400).json({ message: "OTP expired" });

    user.password_hash = await bcrypt.hash(newPassword, 10);
    user.otp = null;
    user.otpExpires = null;

    await user.save();

    res.json({ message: "Password reset successful! Please login with new password." });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Server error during password reset" });
  }
});

// Update Profile 

router.put("/update-profile", upload.single("profile_image"), async (req, res) => {
  try {

    const {
      name,
      role,
      location,
      bio,
      skills,
      github,
      linkedin,
      portfolio,
      designation,
      projects,
      education,
      achievements,
    } = req.body;

    // Identify user from token 
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "Unauthorized" });
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (name) user.name = name;
    if (req.file) user.profile_image = req.file.path.replace(/\\/g, "/");
    if (role && ["student", "mentor"].includes(role)) user.role = role;
    if (location !== undefined) user.location = location;
    if (bio !== undefined) user.bio = bio;
    if (designation !== undefined) user.designation = designation;
    if (skills) {
      if (typeof skills === "string") {
        user.skills = skills.split(",").map(s => s.trim()).filter(Boolean);
      } else if (Array.isArray(skills)) {
        user.skills = skills;
      }
    }
    if (github !== undefined) user.github = github;
    if (linkedin !== undefined) user.linkedin = linkedin;
    if (portfolio !== undefined) user.portfolio = portfolio;

    // Parse JSON strings for projects, education, achievements
    let projectsParsed = [], educationParsed = [], achievementsParsed = [];
    try { projectsParsed = JSON.parse(projects); } catch { }
    try { educationParsed = JSON.parse(education); } catch { }
    try { achievementsParsed = JSON.parse(achievements); } catch { }

    if (Array.isArray(projectsParsed)) user.projects = projectsParsed;
    if (Array.isArray(educationParsed)) user.education = educationParsed;
    if (Array.isArray(achievementsParsed)) user.achievements = achievementsParsed;

    await user.save();


    const freshUser = await User.findById(user._id).select("-password_hash -otp -otpExpires").lean();

    if (freshUser.profile_image && !freshUser.profile_image.startsWith("http") && !freshUser.profile_image.startsWith("/")) {
      freshUser.profile_image = `/${freshUser.profile_image}`;
    }

    res.json({
      message: "Profile updated successfully",
      user: freshUser,
    });

  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ message: "Server error updating profile" });
  }
});


// Get Current User 
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer "))
      return res.status(401).json({ message: "Access denied. No token." });

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("-password_hash -otp -otpExpires").lean();

    if (user.profile_image && !user.profile_image.startsWith("http") && !user.profile_image.startsWith("/")) {
      user.profile_image = `/${user.profile_image}`;
    }

    res.json(user);

  } catch (error) {
    console.error("Get current user error:", error);
    res.status(401).json({ message: "Invalid or expired token" });
  }
});

// Search users for invites (by name or email)
router.get("/search-users", verifyToken, async (req, res) => {
  console.log(`Search users hit with query: ${req.query.q}`);
  try {
    const query = req.query.q;
    if (!query || query.length < 2) {
      return res.json([]);
    }

    const users = await User.find({
      $or: [
        { name: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } }
      ],
      _id: { $ne: req.user.id } // Don't search for self
    })
      .select("name email profile_image _id")
      .limit(10);

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Search failed" });
  }
});

// GET /api/auth/profile
// Get current user profile from token
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password_hash");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      profile_image: user.profile_image
    });
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Log User Activity (for streaks)
router.post("/log-activity", verifyToken, async (req, res) => {
  try {
    await updateStreak(req.user.id);
    res.json({ success: true, message: "Activity logged" });
  } catch (err) {
    console.error("Log activity error:", err);
    res.status(500).json({ message: "Failed to log activity" });
  }
});

export default router;




import express from "express";
import User from "../models/user.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Search users
router.get("/search", verifyToken, async (req, res) => {
    try {
        const { query } = req.query;
        const myId = req.user.id;

        if (!query || query.length < 2) return res.json([]);

        const users = await User.find({
            $and: [
                { _id: { $ne: myId } },
                {
                    $or: [
                        { name: { $regex: query, $options: "i" } },
                        { email: { $regex: query, $options: "i" } },
                    ]
                }
            ]
        }).select("name email profile_image avatarUrl colorTag").limit(10);

        res.json(users);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error searching users", error: err.message });
    }
});

// Submit onboarding data
router.post("/onboarding", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { matchmakingData } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        // Update user data
        user.matchmakingData = matchmakingData;

        // Award rewards only if not already completed
        if (!user.onboardingCompleted) {
            user.onboardingCompleted = true;
            user.xp = (user.xp || 0) + 50;

            // Award "Account Setup" badge
            const Achievement = (await import("../models/achievement.js")).default;

            // Check if already awarded (idempotency)
            const existingAchievement = await Achievement.findOne({
                user: userId,
                title: "Account Setup",
                achievementType: "badge"
            });

            if (!existingAchievement) {
                await Achievement.create({
                    user: userId,
                    course: "skill-sprint",
                    achievementType: "badge",
                    title: "Account Setup",
                    description: "Awarded for completing the onboarding flow.",
                    reason: "Onboarding completed",
                    awardedAt: new Date()
                });
            }
        }

        await user.save();

        res.json({
            message: "Onboarding completed successfully!",
            user: {
                onboardingCompleted: user.onboardingCompleted,
                xp: user.xp,
                matchmakingData: user.matchmakingData
            }
        });
    } catch (err) {
        console.error("Onboarding error:", err);
        res.status(500).json({ message: "Error saving onboarding data", error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// GET /api/users/:userId/public  — Public profile (read-only)
// Returns safe, privacy-respecting user data + online status
// + follow relationship + recent posts + skills in common
// ─────────────────────────────────────────────────────────────
router.get("/:userId/public", verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const viewerId = req.user.id;

        const user = await User.findById(userId)
            .select("-password_hash -otp -otpExpires -email -phone")
            .lean();

        if (!user) return res.status(404).json({ message: "User not found" });

        // ---- Privacy filtering ----
        if (user.privacy && !user.privacy.showSkills) delete user.skills;
        if (user.privacy && !user.privacy.showStreaks) {
            delete user.streakCount;
            delete user.longestStreak;
        }
        if (user.privacy && !user.privacy.showAchievements) delete user.achievements;

        // ---- Online status (via global socket presence map) ----
        const onlineUsers = req.app.get("onlineUsers") || new Map();
        user.isOnline = onlineUsers.has(userId.toString());

        // ---- Follow relationship ----
        const viewer = await User.findById(viewerId).select("following skills").lean();
        user.isFollowing = (viewer?.following || []).map(String).includes(userId.toString());
        user.isOwnProfile = viewerId === userId.toString();

        // ---- Skills in common with the viewer ----
        if (viewer?.skills && user.skills) {
            const viewerSkillsSet = new Set((viewer.skills || []).map(s => s.toLowerCase()));
            user.commonSkills = (user.skills || []).filter(s => viewerSkillsSet.has(s.toLowerCase()));
        } else {
            user.commonSkills = [];
        }

        // ---- Recent posts (last 5) ----
        let recentPosts = [];
        try {
            const Post = (await import("../models/post.js")).default;
            recentPosts = await Post.find({ authorId: userId })
                .sort({ createdAt: -1 })
                .limit(5)
                .select("content media createdAt likes")
                .lean();
            recentPosts = recentPosts.map(p => ({
                ...p,
                likesCount: Array.isArray(p.likes) ? p.likes.length : 0
            }));
        } catch (e) {
            console.error("Failed to fetch recent posts for public profile:", e);
        }

        user.recentPosts = recentPosts;

        res.json(user);
    } catch (err) {
        console.error("Public profile fetch error:", err);
        res.status(500).json({ message: "Error fetching public profile", error: err.message });
    }
});

export default router;

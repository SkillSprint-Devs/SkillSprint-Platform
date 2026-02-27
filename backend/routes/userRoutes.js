
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
                    course: "skill-sprint", // Using a generic identifier for system badges
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

export default router;

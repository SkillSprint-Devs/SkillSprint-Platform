import User from "../models/user.js";

/**
 * Updates the user's streak based on their last activity date.
 * @param {string} userId - The ID of the user to update.
 */
export async function updateStreak(userId) {
    try {
        const user = await User.findById(userId);
        if (!user) return;

        const now = new Date();
        // Normalize to local midnight for comparison
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Normalize lastActiveDate
        const lastActive = new Date(user.lastActiveDate);
        const lastActiveDay = new Date(lastActive.getFullYear(), lastActive.getMonth(), lastActive.getDate());

        const diffTime = today - lastActiveDay;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            // Already active today, just update the timestamp if needed (already default Date.now usually)
            user.lastActiveDate = now;
            await user.save();
            return;
        }

        if (diffDays === 1) {
            // Consecutive day!
            user.streakCount += 1;
            if (user.streakCount > user.longestStreak) {
                user.longestStreak = user.streakCount;
            }
        } else {
            // Missed one or more days, reset
            user.streakCount = 1;
        }

        user.lastActiveDate = now;
        await user.save();
        console.log(`[Streak] User ${userId} updated. Streak: ${user.streakCount}, Longest: ${user.longestStreak}`);
    } catch (error) {
        console.error(`[Streak Error] Failed to update streak for user ${userId}:`, error);
    }
}

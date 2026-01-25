
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

export default router;

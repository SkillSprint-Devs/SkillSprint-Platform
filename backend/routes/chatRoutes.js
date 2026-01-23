import express from "express";
import Chat from "../models/chat.js";
import Notification from "../models/notification.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import User from "../models/user.js";
import mongoose from "mongoose";
import { updateStreak } from "../utils/streakHelper.js";

const router = express.Router();

//  Search Users
router.get("/users/search", verifyToken, async (req, res) => {
    try {
        const { query } = req.query;
        const myId = req.user.id;
        if (!query) return res.json([]);

        const users = await User.find({
            _id: { $ne: myId },
            $or: [
                { name: { $regex: query, $options: "i" } },
                { email: { $regex: query, $options: "i" } },
            ]
        }).select("name email profile_image role").limit(10);
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: "Search error" });
    }
});

//  Get Recent Conversations
router.get("/conversations/recent", verifyToken, async (req, res) => {
    try {
        const myId = new mongoose.Types.ObjectId(req.user.id);
        const conversations = await Chat.aggregate([
            { $match: { $or: [{ sender: myId }, { recipient: myId }] } },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: { $cond: [{ $eq: ["$sender", myId] }, "$recipient", "$sender"] },
                    lastMessage: { $first: "$$ROOT" }
                }
            },
            { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "userDetails" } },
            { $unwind: "$userDetails" },
            {
                $project: {
                    "userDetails.name": 1,
                    "userDetails.email": 1,
                    "userDetails.profile_image": 1,
                    "userDetails._id": 1,
                    lastMessage: 1
                }
            }
        ]);

        const results = await Promise.all(conversations.map(async (c) => {
            const unreadCount = await Chat.countDocuments({
                sender: c.userDetails._id,
                recipient: myId,
                read: false
            });
            return { ...c, unreadCount };
        }));

        res.json(results);
    } catch (err) {
        res.status(500).json({ message: "Fetch error" });
    }
});

//  DELETE Message 
router.delete("/delete/:Id", verifyToken, async (req, res) => {
    // console.log(" DELETE /delete/:messageId API HIT");
    try {
        const { messageId } = req.params;
        const userId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(messageId)) {
            return res.status(400).json({ message: "Invalid message ID format" });
        }

        const message = await Chat.findById(messageId);
        if (!message) return res.status(404).json({ message: "Message not found" });

        if (message.sender.toString() !== userId) {
            return res.status(403).json({ message: "You can only delete your own messages" });
        }

        await Chat.findByIdAndDelete(messageId);
        res.json({ success: true, message: "Deleted successfully", _id: messageId });
    } catch (err) {
        console.error("Delete error:", err);
        res.status(500).json({ message: "Internal server error during deletion" });
    }
});

//  Send Message
router.post("/send", verifyToken, async (req, res) => {
    try {
        const { recipientId, content } = req.body;
        const senderId = req.user.id;
        if (!recipientId || !content) return res.status(400).json({ message: "Missing fields" });

        const newMessage = new Chat({ sender: senderId, recipient: recipientId, content });
        await newMessage.save();

        const io = req.app.get("io");
        if (io) io.to(recipientId.toString()).emit("receive_message", newMessage);

        await updateStreak(senderId);
        res.status(201).json(newMessage);
    } catch (err) {
        res.status(500).json({ message: "Send error" });
    }
});

//  Get Chat History 
router.get("/:userId", verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const myId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: "Invalid User ID" });
        }

        await Chat.updateMany(
            { sender: userId, recipient: myId, read: false },
            { $set: { read: true } }
        );

        const messages = await Chat.find({
            $or: [
                { sender: myId, recipient: userId },
                { sender: userId, recipient: myId }
            ]
        }).sort({ createdAt: 1 });

        res.json(messages);
    } catch (err) {
        res.status(500).json({ message: "History error" });
    }
});

export default router;
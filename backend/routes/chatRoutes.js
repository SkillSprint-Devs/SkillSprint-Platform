import express from "express";
import Chat from "../models/chat.js";
import Notification from "../models/notification.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();
import User from "../models/user.js";
import mongoose from "mongoose";
import { updateStreak } from "../utils/streakHelper.js";

// Search users to start a chat with
router.get("/users/search", verifyToken, async (req, res) => {
    try {
        const { query } = req.query;
        const myId = req.user.id;

        if (!query) return res.json([]);

        // Find users matching name/email, excluding self
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
        }).select("name email profile_image role").limit(10);

        res.json(users);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error searching users", error: err.message });
    }
});

// Send a message
router.post("/send", verifyToken, async (req, res) => {
    try {
        const { recipientId, content } = req.body;
        const senderId = req.user.id;

        if (!recipientId || !content) {
            return res.status(400).json({ message: "Recipient and content are required." });
        }
        const newMessage = new Chat({
            sender: senderId,
            recipient: recipientId,
            content,
        });

        await newMessage.save();

        // Create notification for recipient
        try {
            const sender = await User.findById(senderId).select("name");
            const notification = new Notification({
                user_id: recipientId,
                title: "New Message",
                message: `${sender?.name || 'Someone'} sent you a message`,
                type: "chat",
                link: `/chat/${senderId}`,
            });
            await notification.save();

            // Emit real-time notification via Socket.IO
            const io = req.app.get("io");
            if (io) {
                io.to(recipientId.toString()).emit("notification", notification);
            }
        } catch (notifErr) {
            console.error("Failed to create chat notification:", notifErr);
            // Don't fail the message send if notification fails
        }

        // Update Streak Activity
        await updateStreak(senderId);

        res.status(201).json(newMessage);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error sending message", error: err.message });
    }
});

// Get recent conversations (users involved in chats)
router.get("/conversations/recent", verifyToken, async (req, res) => {
    try {
        const myId = new mongoose.Types.ObjectId(req.user.id);

        // combine to find unique users interacted with
        const conversations = await Chat.aggregate([
            {
                $match: {
                    $or: [{ sender: myId }, { recipient: myId }] // Find messages where I am the sender or receiver
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: {
                        $cond: {
                            if: { $eq: ["$sender", myId] },
                            // If I sent the message, group by the recipient
                            then: "$recipient",
                            // If I received the message, group by the sender
                            else: "$sender"
                        }
                    },
                    lastMessage: { $first: "$$ROOT" }
                }
            },

            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "userDetails"
                }
            },
            {
                $unwind: "$userDetails"
            },
            {
                $project: {
                    _id: 1,
                    lastMessage: 1,
                    "userDetails._id": 1,
                    "userDetails.name": 1,
                    "userDetails.email": 1,
                    "userDetails.avatarUrl": 1,
                    "userDetails.profile_image": 1
                }
            }
        ]);



        res.json(conversations);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching conversations", error: err.message });
    }
});

// Get chat history with a specific user
router.get("/:userId", verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const myId = req.user.id;

        // Validation for ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(myId)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        const query = {
            $or: [
                { sender: myId, recipient: userId },
                { sender: userId, recipient: myId },
                { sender: new mongoose.Types.ObjectId(myId), recipient: new mongoose.Types.ObjectId(userId) },
                { sender: new mongoose.Types.ObjectId(userId), recipient: new mongoose.Types.ObjectId(myId) }
            ]
        };

        const messages = await Chat.find(query).sort({ createdAt: 1 });
        res.json(messages);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching messages", error: err.message });
    }
});


// Edit a message (within 30 mins)
router.put("/:messageId", verifyToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { content } = req.body;
        const userId = req.user.id;

        const message = await Chat.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }

        if (message.sender.toString() !== userId) {
            return res.status(403).json({ message: "You can only edit your own messages" });
        }

        const timeDiff = (Date.now() - new Date(message.createdAt).getTime()) / 60000; // in minutes
        if (timeDiff > 30) {
            return res.status(400).json({ message: "You can only edit messages within 30 minutes of sending." });
        }

        message.content = content;
        await message.save();

        res.json(message);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error editing message", error: err.message });
    }
});

// Delete a message
router.delete("/:messageId", verifyToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.id;

        const message = await Chat.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }

        if (message.sender.toString() !== userId) {
            return res.status(403).json({ message: "You can only delete your own messages" });
        }

        await message.deleteOne();

        res.json({ message: "Message deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error deleting message", error: err.message });
    }
});

export default router;

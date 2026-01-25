
import express from "express";
import mongoose from "mongoose";
import Invitation from "../models/Invitation.js";
import Board from "../models/board.js";
import PairProgramming from "../models/pair-programming.js";
import Notification from "../models/notification.js";
import Chat from "../models/chat.js";
import User from "../models/user.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { sendBoardInvite, sendPairProgrammingInvite } from "../utils/mailService.js";

const router = express.Router();

// Helper to get project details
async function getProject(type, id) {
    if (type === "Board") return await Board.findById(id);
    if (type === "PairProgramming") return await PairProgramming.findById(id);
    return null;
}

// SEND INVITATION
router.post("/send", verifyToken, async (req, res) => {
    try {
        const { recipientId, projectType, projectId, permission } = req.body;
        const senderId = req.user.id;

        if (!recipientId || !projectType || !projectId) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const project = await getProject(projectType, projectId);
        if (!project) return res.status(404).json({ message: "Project not found" });

        // Check if sender has permission to invite (owner only for now)
        if (project.owner.toString() !== senderId) {
            return res.status(403).json({ message: "Only owner can invite" });
        }

        // Check if already invited
        const existing = await Invitation.findOne({
            sender: senderId,
            recipient: recipientId,
            projectType,
            projectId,
            status: "pending"
        });

        if (existing) {
            return res.status(400).json({ message: "Invitation already pending" });
        }

        const invitation = new Invitation({
            sender: senderId,
            recipient: recipientId,
            projectType,
            projectId,
            permission: permission || "viewer"
        });

        await invitation.save();

        // NOTIFY RECIPIENT
        const recipient = await User.findById(recipientId);
        const sender = await User.findById(senderId);

        // 1. System Notification
        const notif = new Notification({
            user_id: recipientId,
            title: "New Project Invitation",
            message: `${sender.name} invited you to join ${project.name}`,
            type: "invite",
            link: "/collaborations.html" // Direct them to where they can accept/decline
        });
        await notif.save();

        const io = req.app.get("io");
        if (io) io.to(recipientId).emit("notification", notif);

        // 2. Email (Optional, if mailService supports generic or we reuse existing)
        // simplistic reuse:
        if (projectType === "Board") {
            sendBoardInvite(recipient.email, { inviterName: sender.name, boardName: project.name, shareUrl: `${process.env.CLIENT_URL}/collaborations.html` });
        } else {
            sendPairProgrammingInvite(recipient.email, { inviterName: sender.name, projectName: project.name, shareUrl: `${process.env.CLIENT_URL}/collaborations.html` });
        }

        res.status(201).json({ success: true, message: "Invitation sent", invitation });
    } catch (err) {
        console.error("Error sending invite:", err);
        res.status(500).json({ message: "Error sending invite", error: err.message });
    }
});

// GET PENDING INVITATIONS
router.get("/pending", verifyToken, async (req, res) => {
    try {
        const invites = await Invitation.find({
            recipient: req.user.id,
            status: "pending"
        })
            .populate("sender", "name profile_image email")
            .sort({ createdAt: -1 });

        // We also need project names. Since dynamic refPath might be tricky to populate deeply efficiently in one go if types differ,
        // let's just loop or use aggregate. Simple loop for now.
        const augmented = await Promise.all(invites.map(async (inv) => {
            const p = await getProject(inv.projectType, inv.projectId);
            return {
                ...inv.toObject(),
                projectName: p ? p.name : "Unknown Project"
            };
        }));

        res.json(augmented);
    } catch (err) {
        console.error("Error fetching invites:", err);
        res.status(500).json({ message: "Error fetching invites", error: err.message });
    }
});

// ACCEPT INVITATION
router.post("/:id/accept", verifyToken, async (req, res) => {
    try {
        const invitation = await Invitation.findById(req.params.id);
        if (!invitation) return res.status(404).json({ message: "Invitation not found" });

        if (invitation.recipient.toString() !== req.user.id) {
            return res.status(403).json({ message: "Not your invitation" });
        }

        if (invitation.status !== "pending") {
            return res.status(400).json({ message: `Invitation already ${invitation.status}` });
        }

        const project = await getProject(invitation.projectType, invitation.projectId);
        if (!project) return res.status(404).json({ message: "Project no longer exists" });

        // Add user to project members
        if (!project.members.includes(req.user.id)) {
            project.members.push(req.user.id);
        }

        // Add to specific permission group
        const pid = req.user.id;
        const roleMap = {
            'viewer': 'viewers',
            'commenter': 'commenters',
            'editor': 'editors',
            'owner': 'editors' // fallback, usually can't invite as owner
        };
        const group = roleMap[invitation.permission] || 'viewers';

        if (project.permissions && project.permissions[group] && !project.permissions[group].includes(pid)) {
            project.permissions[group].push(pid);
        }

        await project.save();

        // Update invitation
        invitation.status = "accepted";
        await invitation.save();

        // Notify Sender
        const recipientUser = await User.findById(req.user.id);
        const notif = new Notification({
            user_id: invitation.sender,
            title: "Invitation Accepted",
            message: `${recipientUser.name} accepted your invite to ${project.name}`,
            type: "invite",
            link: invitation.projectType === 'Board' ? `/board.html?id=${project._id}` : `/pair-programming.html?id=${project._id}`
        });
        await notif.save();

        const io = req.app.get("io");
        if (io) {
            io.to(invitation.sender.toString()).emit("notification", notif);

            // Update real-time board/project if people are online
            // We can emit a specific 'member-joined' event
            io.to(project._id.toString()).emit("member-joined", {
                userId: req.user.id,
                user: recipientUser,
                role: invitation.permission
            });
        }

        res.json({ success: true, message: "Invitation accepted", projectId: project._id, projectType: invitation.projectType });
    } catch (err) {
        console.error("Error accepting invite:", err);
        res.status(500).json({ message: "Error accepting invite", error: err.message });
    }
});

// DECLINE INVITATION
router.post("/:id/decline", verifyToken, async (req, res) => {
    try {
        const invitation = await Invitation.findById(req.params.id);
        if (!invitation) return res.status(404).json({ message: "Invitation not found" });

        if (invitation.recipient.toString() !== req.user.id) {
            return res.status(403).json({ message: "Not your invitation" });
        }

        invitation.status = "rejected";
        await invitation.save();

        // Notify Sender
        const recipientUser = await User.findById(req.user.id);
        // Needed to get project name
        const project = await getProject(invitation.projectType, invitation.projectId);
        const projName = project ? project.name : "the project";

        const notif = new Notification({
            user_id: invitation.sender,
            title: "Invitation Declined",
            message: `${recipientUser.name} declined your invite to ${projName}`,
            type: "reject", // custom type or just generic
            link: "#"
        });
        await notif.save();

        const io = req.app.get("io");
        if (io) io.to(invitation.sender.toString()).emit("notification", notif);

        res.json({ success: true, message: "Invitation declined" });
    } catch (err) {
        console.error("Error declining invite:", err);
        res.status(500).json({ message: "Error declining invite", error: err.message });
    }
});

export default router;

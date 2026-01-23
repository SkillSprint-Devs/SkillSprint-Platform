import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import LiveSession from "../models/liveSession.js";
import WalletService from "../utils/walletService.js";
import User from "../models/user.js";
import Notification from "../models/notification.js";
import { sendInviteEmail } from "../utils/mailService.js";
import { updateStreak } from "../utils/streakHelper.js";

const router = express.Router();
console.log("LiveSessionRoutes initialized");

/**
 * Helper: Check for session conflicts
 * Returns true if conflict exists
 */
async function checkConflict(userId, startDateTime, durationMinutes) {
    const start = new Date(startDateTime);
    const end = new Date(start.getTime() + durationMinutes * 60000);

    // Buffer: 5 minutes before and after
    const bufferedStart = new Date(start.getTime() - 5 * 60000);
    const bufferedEnd = new Date(end.getTime() + 5 * 60000);

    const conflictingSession = await LiveSession.findOne({
        status: { $in: ["scheduled", "live"] },
        $or: [
            { mentorId: userId },
            { acceptedUserIds: userId }
        ],
        $or: [
            // Case 1: Existing session starts during new session
            { scheduledDateTime: { $gte: bufferedStart, $lt: bufferedEnd } },
            // Case 2: New session starts during existing session
            // We need to calc existing session end. Since Mongoose isn't great at this in query, 
            // we'll fetch potentials and filter or use a more complex query if needed.
            // Simplified: overlap exists if (StartA < EndB) && (EndA > StartB)
        ]
    });

    // For better accuracy with varying durations, let's fetch all active and check
    const activeSessions = await LiveSession.find({
        status: { $in: ["scheduled", "live"] },
        $or: [
            { mentorId: userId },
            { acceptedUserIds: userId }
        ]
    });

    for (const s of activeSessions) {
        const sStart = new Date(s.scheduledDateTime).getTime() - 5 * 60000;
        const sEnd = new Date(s.scheduledDateTime).getTime() + s.durationMinutes * 60000 + 5 * 60000;
        const nStart = start.getTime();
        const nEnd = end.getTime();

        if (nStart < sEnd && nEnd > sStart) return true;
    }

    return false;
}

/**
 * Helper: Sync session status based on current time
 */
async function syncSessionStatus(session) {
    if (session.status === 'ended' || session.status === 'cancelled') return session;

    const now = new Date();
    const start = new Date(session.startTime || session.scheduledDateTime);
    const end = new Date(session.endTime || (start.getTime() + session.durationMinutes * 60000));

    let updatedStatus = session.status;

    if (now < start) {
        updatedStatus = "scheduled";
    } else if (now >= start && now <= end) {
        updatedStatus = "live";
    } else if (now > end) {
        updatedStatus = "ended";
    }

    if (updatedStatus !== session.status) {
        session.status = updatedStatus;
        if (updatedStatus === 'ended' && !session.endedAt) {
            session.endedAt = now;
        }
        await session.save();
    }
    return session;
}

/**
 * GET — Get pending invites for user
 */
router.get("/pending-invites", verifyToken, async (req, res) => {
    console.log(`[LIVE SESSIONS] GET /pending-invites hit for user: ${req.user.id}`);
    try {
        const userId = req.user.id;
        const invites = await LiveSession.find({
            invitedUserIds: userId,
            acceptedUserIds: { $ne: userId },
            status: { $in: ["scheduled", "live"] }
        }).populate("mentorId", "name profile_image");

        console.log(`[LIVE SESSIONS] Found ${invites.length} pending invites`);
        res.json(invites);
    } catch (err) {
        console.error("[LIVE SESSIONS] Pending invites error:", err);
        res.status(500).json({ message: "Failed to fetch invites" });
    }
});

/**
 * POST — Create a Live Session
 */
router.post("/create", verifyToken, async (req, res) => {
    try {
        const { sessionName, purpose, durationMinutes, maxParticipants, scheduledDateTime, invitedUserIds } = req.body;
        const mentorId = req.user.id;

        // 1. Validation Logic
        if (!sessionName || !purpose || !durationMinutes || !scheduledDateTime) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        if (durationMinutes < 45 || durationMinutes > 75) {
            return res.status(400).json({ message: "Duration must be between 45 and 75 minutes" });
        }

        if (invitedUserIds && invitedUserIds.length > 3) {
            return res.status(400).json({ message: "Max 3 mentees allowed" });
        }

        // 2. Conflict & Credit check for Mentor
        const hasConflict = await checkConflict(mentorId, scheduledDateTime, durationMinutes);
        if (hasConflict) {
            return res.status(409).json({ message: "You already have a session scheduled during this time." });
        }

        const enoughCredits = await WalletService.hasEnoughCredits(mentorId, 0);
        if (!enoughCredits) {
            return res.status(403).json({ message: "Wallet not found or error" });
        }

        const start = new Date(scheduledDateTime);
        const end = new Date(start.getTime() + durationMinutes * 60000);

        // 3. Create Session
        const session = new LiveSession({
            sessionName,
            purpose,
            mentorId,
            durationMinutes,
            maxParticipants: invitedUserIds ? invitedUserIds.length : 0,
            scheduledDateTime,
            startTime: start,
            endTime: end,
            invitedUserIds,
            status: "scheduled"
        });

        await session.save();

        // 4. Invitations & Notifications
        if (invitedUserIds && invitedUserIds.length > 0) {
            const mentor = await User.findById(mentorId);

            for (const inviteeId of invitedUserIds) {
                const invitee = await User.findById(inviteeId);
                if (!invitee) continue;

                // Only invite if learner has minimum required credits (40% of duration)
                const required = Math.floor(durationMinutes * 0.4);
                const hasCredits = await WalletService.hasEnoughCredits(inviteeId, required);

                if (hasCredits) {
                    // DB Notification
                    await Notification.create({
                        user_id: inviteeId,
                        type: "invite",
                        title: "New Session Invitation",
                        message: `You are invited to "${sessionName}" by ${mentor.name}.`,
                        link: `live-session.html?sessionId=${session._id}`
                    });

                    // Email
                    await sendInviteEmail(invitee.email, {
                        sessionName,
                        mentorName: mentor.name,
                        scheduledDateTime,
                        sessionId: session._id
                    });

                    // Socket emit
                    const io = req.app.get("io");
                    if (io) {
                        io.to(inviteeId.toString()).emit("notification", {
                            message: `New Invite: ${sessionName} by ${mentor.name}`
                        });
                    }
                }
            }
        }

        // Update Streak Activity
        await updateStreak(mentorId);

        res.status(201).json({ message: "Session created successfully", session });

    } catch (error) {
        console.error("Session creation error:", error);
        res.status(500).json({ message: "Server Error" });
    }
});


/**
 * GET — Get all sessions for user (Mentor or Attendee)
 */
router.get("/my-schedule", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const isHistory = req.query.history === 'true';
        const showAll = req.query.all === 'true';

        let query = {
            $or: [
                { mentorId: userId },
                { acceptedUserIds: userId }
            ]
        };

        if (showAll) {
            // No status filter
        } else if (isHistory) {
            query.status = { $in: ['completed', 'cancelled'] };
        } else {
            query.status = { $in: ['scheduled', 'live'] };
        }

        const sessions = await LiveSession.find(query)
            .populate("mentorId", "name profile_image")
            .sort({ scheduledDateTime: (isHistory || showAll) ? -1 : 1 });

        // Sync statuses before returning
        for (let s of sessions) {
            await syncSessionStatus(s);
        }

        res.json(sessions);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch schedule" });
    }
});

/**
 * POST — Respond to Invite (Accept/Decline)
 */
router.post("/respond-invite", verifyToken, async (req, res) => {
    try {
        const { sessionId, action } = req.body; // action: 'accept' or 'decline'
        const userId = req.user.id;

        const session = await LiveSession.findById(sessionId);
        if (!session) return res.status(404).json({ message: "Session not found" });

        // Normalize ID check
        const isInvited = session.invitedUserIds.some(id => id.toString() === userId);
        if (!isInvited) {
            return res.status(403).json({ message: "You were not invited to this session" });
        }

        if (action === 'accept') {
            // Conflict check for mentee
            const hasConflict = await checkConflict(userId, session.scheduledDateTime, session.durationMinutes);
            if (hasConflict) {
                return res.status(409).json({ message: "You already have a session scheduled during this time." });
            }

            if (!session.acceptedUserIds.some(id => id.toString() === userId)) {
                session.acceptedUserIds.push(userId);
                await session.save();
            }
            // Update Streak Activity
            await updateStreak(userId);

            return res.json({ message: "Invitation accepted", success: true });
        } else {
            // Decline logic: remove from invited and accepted (if they previously accepted)
            session.invitedUserIds = session.invitedUserIds.filter(id => id.toString() !== userId);
            session.acceptedUserIds = session.acceptedUserIds.filter(id => id.toString() !== userId);
            await session.save();
            // Update Streak Activity
            await updateStreak(userId);

            return res.json({ message: "Invitation declined", success: true });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to respond to invite" });
    }
});

/**
 * POST — End a session (Mentor only)
 */
router.post("/end-session", verifyToken, async (req, res) => {
    try {
        const { sessionId } = req.body;
        const userId = req.user.id;

        const session = await LiveSession.findById(sessionId);
        if (!session) return res.status(404).json({ message: "Session not found" });

        if (session.status === "ended" || session.status === "completed") {
            return res.json({ message: "Session already ended", success: true });
        }

        if (session.mentorId.toString() !== userId) {
            return res.status(403).json({ message: "Only mentors can end sessions" });
        }

        console.log(`[API] End Session confirmed for ${sessionId}. Status: ${session.status}`);

        session.status = "ended";
        session.endedAt = new Date();
        await session.save();

        // Trigger Wallet Logic
        const duration = session.durationMinutes;
        const processedLearners = [];

        for (const learnerId of session.acceptedUserIds) {
            if (!learnerId) continue;
            try {
                await WalletService.spendCredits(learnerId, session._id, session.sessionName, duration, "Mentor");
                processedLearners.push(learnerId);
            } catch (e) {
                console.error(`[API] Credit deduction failed for ${learnerId}:`, e.message);
            }
        }

        try {
            await WalletService.earnCredits(session.mentorId, session._id, session.sessionName, duration);
            console.log(`[API] Credits processed: Mentor earned, ${processedLearners.length} Learners deducted.`);
        } catch (e) {
            console.error(`[API] Mentor credit reward failed:`, e.message);
        }

        // Emit socket event if needed (we'll also keep it in live-session-sio.js)
        const io = req.app.get("io");
        if (io) {
            io.to(sessionId).emit("live:statusChanged", "ended");
        }

        res.json({ message: "Session ended successfully", success: true });
    } catch (err) {
        console.error("End session error:", err);
        res.status(500).json({ message: "Failed to end session" });
    }
});

/**
 * DELETE — Cancel or Remove session from dashboard
 */
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const session = await LiveSession.findById(req.params.id);
        if (!session) return res.status(404).json({ message: "Session not found" });

        const userId = req.user.id;

        if (session.mentorId.toString() === userId) {
            // Mentor cancels/deletes the whole thing if not already ended
            if (session.status === 'ended' || session.status === 'cancelled') {
                await LiveSession.findByIdAndDelete(req.params.id);
                return res.json({ message: "Session deleted from history" });
            }
            session.status = "cancelled";
            await session.save();
            return res.json({ message: "Session cancelled" });
        } else {
            // Mentee removes themselves from invited/accepted lists
            session.invitedUserIds = session.invitedUserIds.filter(id => id.toString() !== userId);
            session.acceptedUserIds = session.acceptedUserIds.filter(id => id.toString() !== userId);
            await session.save();
            return res.json({ message: "Session removed from your dashboard" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to remove session" });
    }
});

export default router;

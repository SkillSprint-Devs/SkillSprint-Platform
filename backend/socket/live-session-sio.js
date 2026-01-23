import LiveSession from "../models/liveSession.js";
import WalletService from "../utils/walletService.js";
import User from "../models/user.js";

const liveSessionSocket = (io) => {
    const sessionRooms = new Map(); // sessionId -> { chat: [], whiteboard: [] }

    io.on("connection", (socket) => {
        const userId = socket.data.user?.id || socket.data.user?._id;
        if (!userId) return;

        socket.on("live:join", async ({ sessionId }) => {
            try {
                const session = await LiveSession.findById(sessionId);
                if (!session) {
                    console.warn(`[SOCKET] Session not found: ${sessionId}`);
                    return socket.emit("live:error", "Session not found");
                }

                // 1. Source of Truth Status Check
                const isMentor = session.mentorId.toString() === userId.toString();
                const isInvited = session.invitedUserIds.some(id => id.toString() === userId.toString());

                if (!isMentor && !isInvited) {
                    return socket.emit("live:error", "Not authorized to join this session");
                }

                // Time Validation
                const now = new Date();
                const startTime = new Date(session.startTime || session.scheduledDateTime);
                const endTime = new Date(session.endTime || (startTime.getTime() + session.durationMinutes * 60000));

                if (session.status === 'ended' || session.status === 'cancelled') {
                    return socket.emit("live:error", "This session has already ended or been cancelled.");
                }

                if (!isMentor && session.status !== 'live') {
                    return socket.emit("live:error", "Session hasn't started yet. Please wait for the mentor.");
                }

                if (now < new Date(startTime.getTime() - 10 * 60000)) { // 10 mins buffer
                    return socket.emit("live:error", "Too early to join. Please wait.");
                }

                socket.join(sessionId);
                socket.data.sessionId = sessionId; // Track for disconnect

                // 3. Status Tracking
                if (!sessionRooms.has(sessionId)) {
                    sessionRooms.set(sessionId, {
                        chat: [],
                        whiteboard: [],
                        connectedUsers: new Set()
                    });
                }
                const room = sessionRooms.get(sessionId);
                room.connectedUsers.add(userId.toString());

                // 4. Detailed Presence
                const allInvited = await User.find({
                    _id: { $in: [...session.invitedUserIds, session.mentorId] }
                }).select("name profile_image");

                const presenceList = allInvited.map(u => {
                    const uid = u._id.toString();
                    let status = "Absent";
                    if (room.connectedUsers.has(uid)) status = "Joined";
                    else if (session.acceptedUserIds.some(id => id.toString() === uid) || uid === session.mentorId.toString()) status = "Waiting";

                    return {
                        id: uid,
                        name: u.name,
                        profile_image: u.profile_image,
                        role: uid === session.mentorId.toString() ? "Mentor" : "Mentee",
                        status
                    };
                });

                socket.emit("live:init", {
                    chat: room.chat,
                    whiteboard: room.whiteboard,
                    status: session.status,
                    participants: presenceList,
                    isMentor
                });

                io.to(sessionId).emit("live:presence", presenceList);

            } catch (e) {
                console.error("live:join error:", e);
            }
        });

        socket.on("live:chat", async ({ sessionId, message }) => {
            if (!sessionRooms.has(sessionId)) return;

            const user = await User.findById(userId).select("name");
            const chatMsg = {
                user: { id: userId, name: user?.name || "Unknown" },
                message,
                timestamp: new Date()
            };
            sessionRooms.get(sessionId).chat.push(chatMsg);
            io.to(sessionId).emit("live:chat", chatMsg);
        });

        socket.on("live:whiteboard", async ({ sessionId, draw }) => {
            const session = await LiveSession.findById(sessionId);
            if (!session || session.mentorId.toString() !== userId.toString()) return;

            if (!sessionRooms.has(sessionId)) return;
            sessionRooms.get(sessionId).whiteboard.push(draw);
            socket.to(sessionId).emit("live:whiteboard", draw);
        });

        socket.on("live:whiteboardClear", async ({ sessionId }) => {
            const session = await LiveSession.findById(sessionId).select("mentorId");
            if (!session || session.mentorId.toString() !== userId.toString()) return;

            if (!sessionRooms.has(sessionId)) return;
            sessionRooms.get(sessionId).whiteboard = [];
            io.to(sessionId).emit("live:whiteboardClear");
        });

        // WebRTC Signaling
        socket.on("live:signal", ({ sessionId, targetUserId, signal }) => {
            io.to(targetUserId.toString()).emit("live:signal", { fromUserId: userId, signal });
        });

        socket.on("live:startSession", async ({ sessionId }) => {
            try {
                const session = await LiveSession.findById(sessionId);
                if (session.mentorId.toString() !== userId.toString()) return;

                session.status = "live";
                await session.save();
                io.to(sessionId).emit("live:statusChanged", "live");

                // Notify all participants to update dashboard
                const participants = [...session.acceptedUserIds, session.mentorId];
                participants.forEach(pid => {
                    io.to(pid.toString()).emit("notification", {
                        type: "session_update",
                        message: `Session "${session.sessionName}" is now LIVE`
                    });
                });

            } catch (e) {
                console.error(e);
            }
        });

        socket.on("live:endSession", async ({ sessionId }) => {
            try {
                const session = await LiveSession.findById(sessionId);
                if (session.status === "ended" || session.status === "completed") {
                    console.log(`[SOCKET] End session skipped: session ${sessionId} already processed.`);
                    return;
                }

                if (session.mentorId.toString() !== userId.toString()) {
                    console.warn(`[SOCKET] Unauthorized end attempt by ${userId} for session ${sessionId}. Expected mentor ${session.mentorId}`);
                    return socket.emit("live:error", "Only the mentor can end the session.");
                }

                console.log(`[SOCKET] End session confirmed for ${sessionId}.`);

                session.status = "ended";
                session.endedAt = new Date();
                await session.save();

                const duration = session.durationMinutes;
                for (const learnerId of session.acceptedUserIds) {
                    try {
                        await WalletService.spendCredits(learnerId, session._id, session.sessionName, duration, "Mentor");
                    } catch (e) {
                        console.error(`Failed to deduct credits for ${learnerId}:`, e.message);
                    }
                }
                await WalletService.earnCredits(session.mentorId, session._id, session.sessionName, duration);

                io.to(sessionId).emit("live:statusChanged", "ended");

                // Notify all participants to update dashboard
                const allParticipants = [...session.acceptedUserIds, session.mentorId];
                allParticipants.forEach(pid => {
                    io.to(pid.toString()).emit("notification", {
                        type: "session_update",
                        message: `Session "${session.sessionName}" has ended`
                    });
                });

                sessionRooms.delete(sessionId);
                console.log(`[SOCKET] Session ${sessionId} ended successfully.`);
            } catch (e) {
                console.error("[SOCKET] Error ending session:", e);
                socket.emit("live:error", "Failed to end session: " + e.message);
            }
        });

        socket.on("disconnect", async () => {
            const sessionId = socket.data.sessionId;
            if (sessionId && sessionRooms.has(sessionId)) {
                const room = sessionRooms.get(sessionId);
                room.connectedUsers.delete(userId.toString());

                // Broadcast updated presence
                // Note: Simplified for now, in production we'd re-fetch or keep presenceList in room data
                const session = await LiveSession.findById(sessionId).select("mentorId invitedUserIds acceptedUserIds");
                if (session) {
                    const allInvited = await User.find({
                        _id: { $in: [...session.invitedUserIds, session.mentorId] }
                    }).select("name profile_image");

                    const presenceList = allInvited.map(u => {
                        const uid = u._id.toString();
                        let status = "Absent";
                        if (room.connectedUsers.has(uid)) status = "Joined";
                        else if (session.acceptedUserIds.some(id => id.toString() === uid) || uid === session.mentorId.toString()) status = "Waiting";

                        return {
                            id: uid,
                            name: u.name,
                            profile_image: u.profile_image,
                            role: uid === session.mentorId.toString() ? "Mentor" : "Mentee",
                            status
                        };
                    });
                    io.to(sessionId).emit("live:presence", presenceList);
                }
            }
        });
    });
};

export default liveSessionSocket;

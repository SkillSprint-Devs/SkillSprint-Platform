import LiveSession from "../models/liveSession.js";
import WalletService from "../utils/walletService.js";
import User from "../models/user.js";
import SessionService from "../services/sessionService.js";

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

                // 2. Strict Credit Check for Join
                if (!isMentor) {
                    const required = Math.floor(session.durationMinutes * 0.4);
                    const hasCredits = await WalletService.hasEnoughCredits(userId, required);
                    if (!hasCredits) {
                        return socket.emit("live:error", "Insufficient credits. You need at least " + required + " minutes of credit to join.");
                    }
                }

                if (now < new Date(startTime.getTime() - 15 * 60000)) { // 15 mins buffer
                    return socket.emit("live:error", "Too early to join. Please wait.");
                }

                socket.join(sessionId);
                socket.data.sessionId = sessionId; // Track for disconnect

                // 3. Status Tracking
                if (!sessionRooms.has(sessionId)) {
                    sessionRooms.set(sessionId, {
                        chat: [],
                        whiteboard: [],
                        connectedUsers: new Set(),
                        permissions: {} // userId -> { mic: boolean, cam: boolean, whiteboard: boolean }
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
                    sessionName: session.sessionName,
                    status: session.status,
                    participants: presenceList,
                    isMentor,
                    grantedPermissions: room.permissions[userId] || {}
                });

                io.to(sessionId).emit("live:presence", presenceList);

                // Notify others that a new peer has joined to initiate WebRTC
                socket.to(sessionId).emit("live:peerJoined", { userId });

                // Track first mentee join for billable time
                if (!isMentor && !session.firstMenteeJoinedAt) {
                    session.firstMenteeJoinedAt = new Date();
                    await session.save();
                    console.log(`[SOCKET] First mentee joined at ${session.firstMenteeJoinedAt}. Billable time starts.`);
                }

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

        socket.on("live:whiteboardToggle", async ({ sessionId, visible }) => {
            const session = await LiveSession.findById(sessionId).select("mentorId");
            if (!session || session.mentorId.toString() !== userId.toString()) return;

            if (!sessionRooms.has(sessionId)) return;
            io.to(sessionId).emit("live:whiteboardToggle", { visible });
        });

        socket.on("live:whiteboardClear", async ({ sessionId }) => {
            const session = await LiveSession.findById(sessionId).select("mentorId");
            if (!session || session.mentorId.toString() !== userId.toString()) return;

            if (!sessionRooms.has(sessionId)) return;
            sessionRooms.get(sessionId).whiteboard = [];
            io.to(sessionId).emit("live:whiteboardClear");
        });

        // Permission System
        socket.on("live:requestPermission", ({ sessionId, type }) => {
            // Forward to Mentor ONLY
            LiveSession.findById(sessionId).then(session => {
                if (session) {
                    io.to(session.mentorId.toString()).emit("live:permissionRequest", {
                        userId,
                        type
                    });
                }
            });
        });

        socket.on("live:grantPermission", ({ sessionId, targetUserId, type, granted }) => {
            if (!sessionRooms.has(sessionId)) return;
            const room = sessionRooms.get(sessionId);

            if (!room.permissions[targetUserId]) room.permissions[targetUserId] = {};
            room.permissions[targetUserId][type] = granted;

            // Forward to specific mentee
            io.to(targetUserId.toString()).emit("live:permissionGranted", { type, granted });
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
                if (!session) return;

                if (session.mentorId.toString() !== userId.toString()) {
                    console.warn(`[SOCKET] Unauthorized end attempt by ${userId} for session ${sessionId}`);
                    return socket.emit("live:error", "Only the mentor can end the session.");
                }

                await SessionService.terminateSession(sessionId, io);
                console.log(`[SOCKET] Session ${sessionId} ended successfully via SessionService.`);
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

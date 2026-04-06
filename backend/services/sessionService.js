import LiveSession from "../models/liveSession.js";
import WalletService from "../utils/walletService.js";

class SessionService {
    //Centralized termination


    async terminateSession(sessionId, io) {
        try {
            console.log(`[RUNTIME-DEBUG] SessionService.terminateSession START for ID: ${sessionId}`);
            const session = await LiveSession.findById(sessionId);

            if (!session) {
                console.error(`[SessionService] Session ${sessionId} not found`);
                return { success: false, message: "Session not found" };
            }

            if (session.status === "ended" || session.status === "cancelled") {
                return { success: true, message: "Session already terminated" };
            }

            // 1. Mark as ended or expired
            const joinedMentees = session.acceptedUserIds?.length || 0;
            if (joinedMentees === 0) {
                session.status = "expired";
            } else {
                session.status = "ended";
            }
            session.endedAt = new Date();

            // Ensure we have a startTime to calculate duration. 
            const startStr = session.firstMenteeJoinedAt || session.startTime || session.scheduledDateTime;
            const actualStart = new Date(startStr);
            
            // LOGIC FIX: Cap at duration + 15 mins to prevent runaway credits if server was down
            const plannedDuration = session.durationMinutes || 60;
            const maxAllowedMinutes = plannedDuration + 15;
            const calculatedDuration = Math.round((session.endedAt - actualStart) / 60000);
            const actualDurationMinutes = Math.max(0, Math.min(calculatedDuration, maxAllowedMinutes));

            console.log(`[RUNTIME-DEBUG] Attempting DB Save. Status: ${session.status}`);
            await session.save();
            console.log(`[RUNTIME-DEBUG] DB SAVE SUCCESS.`);

            // Process Credits - Only if the session was NOT expired (had at least one mentee)
            if (session.status === "ended" && actualDurationMinutes > 0) {
                const learners = session.acceptedUserIds || [];
                for (const learnerId of learners) {
                    try {
                        await WalletService.spendCredits(
                            learnerId,
                            session._id,
                            session.sessionName,
                            actualDurationMinutes,
                            "Mentor"
                        );
                    } catch (err) {
                        console.error(`[SessionService] Credit deduction failed for user ${learnerId}:`, err.message);
                    }
                }

                try {
                    await WalletService.earnCredits(
                        session.mentorId,
                        session._id,
                        session.sessionName,
                        actualDurationMinutes
                    );
                } catch (err) {
                    console.error(`[SessionService] Mentor credit earning failed:`, err.message);
                }
            } else if (session.status === "expired") {
                console.log(`[SessionService] Session ${session._id} was empty (no mentees). Marking as expired without credits.`);
            }

            // 3. Notify Everyone
            if (io) {
                console.log(`[RUNTIME-DEBUG] io object is present. Emitting socket events to room ${sessionId}`);
                // To specific room
                io.to(sessionId.toString()).emit("live:statusChanged", "ended");

                // To global participant dashboards
                const participants = [...learners, session.mentorId];
                participants.forEach(pid => {
                    io.to(pid.toString()).emit("notification", {
                        type: "session_update",
                        message: `Session "${session.sessionName}" has ended.`
                    });
                });
            }

            return { success: true, session };
        } catch (err) {
            console.error(`[SessionService] Error terminating session:`, err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Syncs session status based on current time
     * If session is expired, it TRIGGERS termination (and credit processing)
     */
    async syncStatus(session, io) {
        if (session.status === 'ended' || session.status === 'cancelled') return session;

        const now = new Date();
        const start = new Date(session.startTime || session.scheduledDateTime);
        // We use planned duration to calculate natural end time
        const plannedEnd = new Date(start.getTime() + session.durationMinutes * 60000);

        if (now > plannedEnd) {
            console.log(`[SessionService] Session ${session._id} expired. Triggering termination.`);
            const result = await this.terminateSession(session._id, io);
            if (result.success) return result.session;
        } else if (now >= start && session.status === 'scheduled') {
            // Auto-advance to live if time has come
            session.status = 'live';
            if (!session.startTime) session.startTime = now;
            await session.save();

            if (io) {
                io.to(session._id.toString()).emit("live:statusChanged", "live");
            }
        }

        return session;
    }
}

export default new SessionService();

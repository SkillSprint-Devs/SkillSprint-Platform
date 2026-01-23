import LiveSession from "../models/liveSession.js";
import WalletService from "../utils/walletService.js";

class SessionService {
    /**
     * Centralized termination logic for Live Sessions
     * Handles status update, credit processing, and notifications
     */
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

            // 1. Mark as ended
            session.status = "ended";
            session.endedAt = new Date();

            // Ensure we have a startTime to calculate duration. 
            // If they merged before scheduled, we use scheduledDateTime as fallback if startTime is missing.
            const startStr = session.startTime || session.scheduledDateTime;
            const actualStart = new Date(startStr);
            const actualDurationMinutes = Math.max(1, Math.round((session.endedAt - actualStart) / 60000));

            console.log(`[RUNTIME-DEBUG] Attempting DB Save. Status: ended`);
            await session.save();
            console.log(`[RUNTIME-DEBUG] DB SAVE SUCCESS.`);

            // 2. Process Credits (Silent Casualty Fixed)
            // Use ACTUAL duration instead of planned duration
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

            // 3. Notify Everyone
            if (io) {
                console.log(`[RUNTIME-DEBUG] io object is present. Emitting socket events to room ${sessionId}`);
                // To specific room
                io.to(sessionId.toString()).emit("live:statusChanged", "ended");

                // To global participant dashboards
                const participants = [...learners, session.mentorId];
                participants.forEach(pid => {
                    io.to(pid.toString()).emit("notification", {
                        type: "session_update", // Handled by frontend to refresh lists
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

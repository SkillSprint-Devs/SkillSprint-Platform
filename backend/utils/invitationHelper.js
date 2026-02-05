import Invitation from "../models/Invitation.js";
import Notification from "../models/notification.js";
import User from "../models/user.js";
import { sendPairProgrammingInvite, sendBoardInvite } from "./mailService.js";

/**
 * Consistently sends a project invitation (DB, Notification, Email, Socket)
 */
export async function sendProjectInvitation({
    senderId,
    recipientId,
    projectType,
    projectId,
    projectName,
    permission = 'editor',
    role = 'navigator',
    io,
    appUrl
}) {
    const sender = await User.findById(senderId).select("name");
    const recipient = await User.findById(recipientId).select("name email");

    if (!sender || !recipient) return null;

    // 1. Create/Update Invitation in DB
    const invitation = await Invitation.findOneAndUpdate(
        { sender: senderId, recipient: recipientId, projectType, projectId, status: 'pending' },
        { permission, role, createdAt: new Date() },
        { upsert: true, new: true }
    );

    // 2. Create System Notification
    const notification = new Notification({
        user_id: recipientId,
        title: `${projectType === 'Board' ? 'Board' : 'Pair Programming'} Invite`,
        message: `${sender.name} invited you to join "${projectName}"`,
        type: "invite",
        link: "/collaborations.html",
    });
    await notification.save();

    // 3. Emit Real-time Notification
    if (io) {
        io.to(recipientId.toString()).emit("notification", notification);
    }

    // 4. Send Email
    try {
        if (projectType === "Board") {
            sendBoardInvite(recipient.email, {
                inviterName: sender.name,
                boardName: projectName,
                shareUrl: `${appUrl}/collaborations.html`
            });
        } else {
            sendPairProgrammingInvite(recipient.email, {
                inviterName: sender.name,
                projectName: projectName,
                shareUrl: `${appUrl}/collaborations.html`
            });
        }
    } catch (err) {
        console.error("Email notification failed:", err);
    }

    return invitation;
}

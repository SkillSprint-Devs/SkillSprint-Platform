import sgMail from "@sendgrid/mail";

// Load SendGrid API Key
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

if (SENDGRID_API_KEY) {
    sgMail.setApiKey(SENDGRID_API_KEY);
    console.log("[MailService] SendGrid SDK Initialized.");
} else {
    console.warn("[MailService] WARNING: SENDGRID_API_KEY is missing. Email delivery will fail.");
    console.log("[MailService] Fallback: Please check environment variables on Render.");
}

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5000";
// Ensure CLIENT_URL doesn't have trailing slash for consistency
const BASE_URL = CLIENT_URL.endsWith('/') ? CLIENT_URL.slice(0, -1) : CLIENT_URL;

const sendEmail = async (to, subject, html) => {
    if (!SENDGRID_API_KEY) {
        console.error(`[MailService] Cannot send email to ${to}: SENDGRID_API_KEY is not set.`);
        return;
    }

    const msg = {
        to,
        from: {
            email: process.env.EMAIL_USER || "info@skillsprint.platform", // Needs to be a verified sender in SendGrid
            name: "SkillSprint"
        },
        subject,
        html
    };

    try {
        await sgMail.send(msg);
        console.log(`[MailService] Email sent successfully to ${to}`);
    } catch (error) {
        console.error("[MailService] SendGrid Error:", error.response ? error.response.body : error.message);
    }
};

export const sendInviteEmail = async (to, sessionData) => {
    const { sessionName, mentorName, scheduledDateTime, sessionId } = sessionData;
    const date = new Date(scheduledDateTime).toLocaleString();
    const joinLink = `${BASE_URL}/livevideo.html?sessionId=${sessionId}`;

    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
            <h2 style="color: #1A1A1A;">You're Invited!</h2>
            <p>Hello,</p>
            <p><strong>${mentorName}</strong> has invited you to a live session: <strong>${sessionName}</strong>.</p>
            <p><strong>Scheduled For:</strong> ${date}</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p>Please log in to your SkillSprint dashboard to Accept or Decline this invitation.</p>
            <a href="${joinLink}" style="display: inline-block; background: #DCEF62; color: #1A1A1A; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">View Invitation</a>
             <p style="margin-top: 20px; font-size: 0.8rem; color: #999;">If you don't have a SkillSprint account, please ignore this email.</p>
        </div>
    `;
    await sendEmail(to, `New Live Session Invitation: ${sessionName}`, html);
};

export const sendPairProgrammingInvite = async (to, { inviterName, projectName, shareUrl }) => {
    const link = shareUrl.startsWith('http') ? shareUrl : `${BASE_URL}${shareUrl.startsWith('/') ? '' : '/'}${shareUrl}`;
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
            <h2 style="color: #1A1A1A;">Coding Invite!</h2>
            <p>Hello,</p>
            <p><strong>${inviterName}</strong> invited you to collaborate on <strong>${projectName}</strong>.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <a href="${link}" style="display: inline-block; background: #DCEF62; color: #1A1A1A; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Open Project</a>
        </div>
    `;
    await sendEmail(to, `Collaboration Invite: ${projectName}`, html);
};

export const sendBoardInvite = async (to, { inviterName, boardName, shareUrl }) => {
    const link = shareUrl.startsWith('http') ? shareUrl : `${BASE_URL}${shareUrl.startsWith('/') ? '' : '/'}${shareUrl}`;
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
             <h2 style="color: #1A1A1A;">Whiteboard Invite!</h2>
            <p>Hello,</p>
            <p><strong>${inviterName}</strong> invited you to join the board <strong>${boardName}</strong>.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <a href="${link}" style="display: inline-block; background: #DCEF62; color: #1A1A1A; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Open Board</a>
        </div>
    `;
    await sendEmail(to, `Board Invite: ${boardName}`, html);
};

export const sendOTPEmail = async (to, otp, type = "signup") => {
    const subject = type === "signup" ? "SkillSprint Signup OTP" : "SkillSprint Password Reset OTP";
    const action = type === "signup" ? "signup" : "resetting password";

    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
             <h2 style="color: #1A1A1A;">${subject}</h2>
            <p>Hello,</p>
            <p>Your OTP for ${action} is: <strong style="font-size: 1.2rem; color: #DCEF62; background: #333; padding: 4px 8px; border-radius: 4px;">${otp}</strong>.</p>
            <p>It expires in 5 minutes.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 0.8rem; color: #999;">If you didn't request this code, please ignore this email.</p>
        </div>
    `;
    await sendEmail(to, subject, html);
};

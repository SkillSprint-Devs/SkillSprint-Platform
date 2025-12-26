import nodemailer from "nodemailer";

// NOTE: In production, these should be in .env
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: false, // true for 465, false for other ports (587 uses STARTTLS)
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        // do not fail on invalid certs
        rejectUnauthorized: false
    },
    connectionTimeout: 20000, // Increased timeout for reliability
    logger: true, // Log to console
    debug: true,  // Include SMTP traffic in logs
});

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5000";
// Ensure CLIENT_URL doesn't have trailing slash for consistency
const BASE_URL = CLIENT_URL.endsWith('/') ? CLIENT_URL.slice(0, -1) : CLIENT_URL;

const sendEmail = async (to, subject, html) => {
    const mailOptions = {
        from: `"SkillSprint" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${to}`);
    } catch (error) {
        console.error("Email error:", error);
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

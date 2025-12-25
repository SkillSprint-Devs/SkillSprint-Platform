import nodemailer from "nodemailer";

// NOTE: In production, these should be in .env
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER || "your-email@gmail.com",
        pass: process.env.EMAIL_PASS || "your-password"
    }
});

export const sendInviteEmail = async (to, sessionData) => {
    const { sessionName, mentorName, scheduledDateTime, sessionId } = sessionData;
    const date = new Date(scheduledDateTime).toLocaleString();
    const joinLink = `http://localhost:5000/livevideo.html?sessionId=${sessionId}`;

    const mailOptions = {
        from: `"SkillSprint" <${process.env.EMAIL_USER}>`,
        to,
        subject: `New Live Session Invitation: ${sessionName}`,
        html: `
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
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${to}`);
    } catch (error) {
        console.error("Email error:", error);
    }
};

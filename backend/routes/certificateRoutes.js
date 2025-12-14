import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import Certificate from "../models/certificate.js";
import User from "../models/user.js";

const router = express.Router();

// ============================================================
// GET /api/certificates - List user's certificates
// ============================================================
router.get("/", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const certificates = await Certificate.find({ user: userId })
            .sort({ issuedAt: -1 });

        res.json({
            certificates: certificates.map(cert => ({
                id: cert._id,
                course: cert.course,
                courseName: formatCourseName(cert.course),
                verificationId: cert.verificationId,
                levelScores: cert.levelScores,
                overallScore: cert.overallScore,
                issuedAt: cert.issuedAt,
                verificationUrl: `/api/certificates/verify/${cert.verificationId}`
            }))
        });
    } catch (err) {
        console.error("Get certificates error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// ============================================================
// GET /api/certificates/verify/:verificationId - Public verification
// ============================================================
router.get("/verify/:verificationId", async (req, res) => {
    try {
        const { verificationId } = req.params;

        const certificate = await Certificate.findOne({ verificationId })
            .populate("user", "name profile_image");

        if (!certificate) {
            return res.status(404).json({
                valid: false,
                message: "Certificate not found"
            });
        }

        res.json({
            valid: true,
            certificate: {
                holder: {
                    name: certificate.user.name,
                    profileImage: certificate.user.profile_image || null
                },
                course: certificate.course,
                courseName: formatCourseName(certificate.course),
                levelScores: certificate.levelScores,
                overallScore: certificate.overallScore,
                issuedAt: certificate.issuedAt,
                verificationId: certificate.verificationId
            }
        });
    } catch (err) {
        console.error("Verify certificate error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// Helper: Format course name
function formatCourseName(course) {
    const names = {
        "html-css": "HTML & CSS",
        "javascript": "JavaScript",
        "git-github": "Git & GitHub",
        "nodejs-express": "Node.js & Express",
        "mongodb": "MongoDB",
        "problem-solving": "Problem Solving"
    };
    return names[course] || course;
}

export default router;

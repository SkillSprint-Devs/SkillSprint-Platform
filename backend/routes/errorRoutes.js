import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import ErrorLog from "../models/ErrorLog.js";

const router = express.Router();

/**
 * POST /api/errors/log
 * Frontend error submission endpoint
 */
router.post("/log", verifyToken, async (req, res) => {
    try {
        const { errorMessage, fileName, lineNumber, columnNumber, stackTrace, screenName } = req.body;

        const userId = req.user.id;
        const userEmail = req.user.email;

        // Mask sensitive data
        const maskedMessage = maskSensitiveData(errorMessage);
        const maskedStack = maskSensitiveData(stackTrace);

        const errorLog = await ErrorLog.create({
            errorMessage: maskedMessage,
            errorType: 'Frontend',
            severity: 'Medium', // Frontend errors default to Medium
            userId,
            userEmail,
            screenName,
            fileName,
            lineNumber,
            columnNumber,
            stackTrace: maskedStack,
            userAgent: req.headers['user-agent'],
            environment: process.env.NODE_ENV || 'Development'
        });

        // Emit real-time notification
        const io = req.app.get("io");
        if (io) {
            io.emit("error:new", {
                id: errorLog._id,
                message: maskedMessage,
                type: 'Frontend',
                severity: 'Medium',
                timestamp: errorLog.timestamp,
                userEmail
            });
        }

        res.status(201).json({ message: "Error logged successfully", id: errorLog._id });
    } catch (err) {
        console.error("Error logging failed:", err);
        res.status(500).json({ message: "Failed to log error" });
    }
});

/**
 * GET /api/errors
 * List errors with pagination, filters, and search
 * Admin only
 */
router.get("/", verifyToken, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: "Admin access required" });
        }

        const {
            page = 1,
            limit = 20,
            errorType,
            severity,
            resolved,
            userId,
            startDate,
            endDate,
            search
        } = req.query;

        // Build query
        const query = {};

        if (errorType) query.errorType = errorType;
        if (severity) query.severity = severity;
        if (resolved !== undefined) query.resolved = resolved === 'true';
        if (userId) query.userId = userId;

        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
        }

        if (search) {
            query.$or = [
                { errorMessage: { $regex: search, $options: 'i' } },
                { fileName: { $regex: search, $options: 'i' } },
                { screenName: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (page - 1) * limit;

        const [errors, total] = await Promise.all([
            ErrorLog.find(query)
                .populate('userId', 'name email')
                .populate('resolvedBy', 'name')
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .select('-stackTrace'), // Don't send full stack by default
            ErrorLog.countDocuments(query)
        ]);

        res.json({
            errors,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch errors" });
    }
});

/**
 * GET /api/errors/:id
 * Get single error with full details including stack trace
 * Admin only
 */
router.get("/:id", verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: "Admin access required" });
        }

        const error = await ErrorLog.findById(req.params.id)
            .populate('userId', 'name email profile_image')
            .populate('resolvedBy', 'name')
            .select('+stackTrace'); // Include stack trace

        if (!error) {
            return res.status(404).json({ message: "Error log not found" });
        }

        res.json(error);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch error details" });
    }
});

/**
 * PATCH /api/errors/:id/resolve
 * Mark error as resolved
 * Admin only
 */
router.patch("/:id/resolve", verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: "Admin access required" });
        }

        const error = await ErrorLog.findByIdAndUpdate(
            req.params.id,
            {
                resolved: true,
                resolvedBy: req.user.id,
                resolvedAt: new Date()
            },
            { new: true }
        );

        if (!error) {
            return res.status(404).json({ message: "Error log not found" });
        }

        res.json({ message: "Error marked as resolved", error });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to resolve error" });
    }
});

/**
 * DELETE /api/errors/:id
 * Delete error log
 * Admin only
 */
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: "Admin access required" });
        }

        const error = await ErrorLog.findByIdAndDelete(req.params.id);

        if (!error) {
            return res.status(404).json({ message: "Error log not found" });
        }

        res.json({ message: "Error log deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to delete error" });
    }
});

/**
 * Helper: Mask sensitive data
 */
function maskSensitiveData(text) {
    if (!text) return text;

    const patterns = [
        { regex: /(password|pwd|pass)[\s:=]+["']?([^"'\s]+)["']?/gi, replacement: '$1: ***MASKED***' },
        { regex: /(token|jwt|bearer)[\s:=]+["']?([^"'\s]+)["']?/gi, replacement: '$1: ***MASKED***' },
        { regex: /(api[_-]?key|apikey|secret)[\s:=]+["']?([^"'\s]+)["']?/gi, replacement: '$1: ***MASKED***' }
    ];

    let masked = text;
    patterns.forEach(({ regex, replacement }) => {
        masked = masked.replace(regex, replacement);
    });

    return masked;
}

export default router;

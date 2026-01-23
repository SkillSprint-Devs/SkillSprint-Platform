import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import ErrorLog from "../models/ErrorLog.js";
import jwt from "jsonwebtoken";

const router = express.Router();

/**
 * POST /api/errors/log
 * Frontend error submission endpoint (Public but captures user if logged in)
 */
router.post("/log", async (req, res) => {
    try {
        const {
            errorMessage, fileName, lineNumber, columnNumber, stackTrace, screenName,
            severity, userAgent, environment, requestUrl, requestMethod, sessionId
        } = req.body;

        // Try to get user from token if it exists
        let userId = null;
        let userEmail = 'Guest';

        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const token = authHeader.split(' ')[1];
                const secret = process.env.JWT_SECRET || process.env.TOKEN_SECRET;
                if (secret) {
                    const decoded = jwt.verify(token, secret);
                    userId = decoded.id || decoded._id || decoded.userId;
                    userEmail = decoded.email || 'Authenticated User';
                }
            } catch (e) {
                // Ignore token errors for logging (expired token, etc.)
            }
        }

        // Mask sensitive data
        const maskedMessage = maskSensitiveData(errorMessage || 'Unknown Frontend Error');
        const maskedStack = maskSensitiveData(stackTrace || '');

        const errorLog = await ErrorLog.create({
            errorMessage: maskedMessage,
            errorType: 'Frontend',
            severity: severity || 'Medium',
            status: 'NEW',
            userId: userId || null,
            userEmail: userEmail,
            screenName: screenName || 'Unknown',
            fileName: fileName || '',
            lineNumber: lineNumber || 0,
            columnNumber: columnNumber || 0,
            stackTrace: maskedStack,
            userAgent: userAgent || req.headers['user-agent'] || 'Unknown',
            environment: environment || process.env.NODE_ENV || 'Development',
            requestUrl: requestUrl || req.headers.referer || '',
            requestMethod: requestMethod || 'GET',
            ipAddress: req.ip || req.headers['x-forwarded-for'] || '',
            sessionId: sessionId || null
        });

        // Emit real-time notification
        const io = req.app.get("io");
        if (io) {
            io.emit("error:new", {
                id: errorLog._id,
                message: maskedMessage,
                type: 'Frontend',
                severity: errorLog.severity || 'Medium',
                timestamp: errorLog.timestamp,
                userEmail
            });
        }

        res.status(201).json({ message: "Error logged successfully", id: errorLog._id });
    } catch (err) {
        console.error("[ERROR LOGGING FAIL]", err);
        res.status(500).json({ message: "Internal Server Error in Logging Endpoint" });
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
            status,
            resolved,
            userId,
            startDate,
            endDate,
            search,
            sortBy = 'timestamp',
            sortOrder = 'desc'
        } = req.query;

        // Build query
        const query = {};

        if (errorType) query.errorType = errorType;
        if (severity) query.severity = severity;
        if (status) query.status = status;
        if (resolved !== undefined) {
            query.status = resolved === 'true' ? 'RESOLVED' : 'NEW';
        }
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

        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const [errors, total] = await Promise.all([
            ErrorLog.find(query)
                .populate('userId', 'name email')
                .populate('resolvedBy', 'name')
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .select('-stackTrace'),
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

import { groupErrors } from "../utils/errorGrouping.js";

// ... existing code ...

/**
 * GET /api/errors/grouped
 * Get errors grouped by message/source
 * Admin only
 */
router.get("/grouped", verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: "Admin access required" });
        }

        const query = {};
        // Add optional filtering for grouping
        if (req.query.severity) query.severity = req.query.severity;
        if (req.query.errorType) query.errorType = req.query.errorType;
        if (req.query.status) query.status = req.query.status;

        // Fetch last 1000 errors for grouping
        const errors = await ErrorLog.find(query)
            .sort({ timestamp: -1 })
            .limit(1000);

        const grouped = groupErrors(errors);
        res.json(grouped);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to group errors" });
    }
});

/**
 * GET /api/errors/stats
 * Get error statistics for analytics dashboard
 * Admin only
 */
router.get("/stats", verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: "Admin access required" });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
            totalToday,
            criticalCount,
            highCount,
            mediumCount,
            lowCount,
            resolvedToday,
            totalUnresolved
        ] = await Promise.all([
            ErrorLog.countDocuments({ timestamp: { $gte: today } }),
            ErrorLog.countDocuments({ severity: 'Critical', status: { $ne: 'RESOLVED' } }),
            ErrorLog.countDocuments({ severity: 'High', status: { $ne: 'RESOLVED' } }),
            ErrorLog.countDocuments({ severity: 'Medium', status: { $ne: 'RESOLVED' } }),
            ErrorLog.countDocuments({ severity: 'Low', status: { $ne: 'RESOLVED' } }),
            ErrorLog.countDocuments({ status: 'RESOLVED', resolvedAt: { $gte: today } }),
            ErrorLog.countDocuments({ status: { $ne: 'RESOLVED' } })
        ]);

        const resolutionRate = (resolvedToday + totalUnresolved) > 0
            ? Math.round((resolvedToday / (resolvedToday + totalUnresolved)) * 100)
            : 100;

        res.json({
            totalToday,
            criticalCount,
            highCount,
            mediumCount,
            lowCount,
            resolvedToday,
            totalUnresolved,
            resolutionRate
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch error stats" });
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
 * POST /api/errors/bulk-action
 * Perform actions on multiple error logs
 * Admin only
 */
router.post("/bulk-action", verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: "Admin access required" });
        }

        const { action, errorIds } = req.body;

        if (!errorIds || !Array.isArray(errorIds) || errorIds.length === 0) {
            return res.status(400).json({ message: "No error IDs provided" });
        }

        if (action === 'resolve') {
            await ErrorLog.updateMany(
                { _id: { $in: errorIds } },
                {
                    status: 'RESOLVED',
                    resolved: true,
                    resolvedBy: req.user.id,
                    resolvedAt: new Date()
                }
            );
            return res.json({ message: `${errorIds.length} errors marked as resolved` });
        } else if (action === 'delete') {
            await ErrorLog.deleteMany({ _id: { $in: errorIds } });
            return res.json({ message: `${errorIds.length} error logs deleted` });
        } else {
            return res.status(400).json({ message: "Invalid action" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Bulk action failed" });
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

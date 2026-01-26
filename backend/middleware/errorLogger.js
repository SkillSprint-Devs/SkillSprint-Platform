import ErrorLog from "../models/ErrorLog.js";

// Middleware to log errors to database

const errorLogger = async (err, req, res, next) => {
    try {
        // Determine error type and severity
        const errorType = determineErrorType(err, req);
        const severity = determineSeverity(err);

        // Extract user info if authenticated
        const userId = req.user?.id || req.user?._id;
        const userEmail = req.user?.email;

        // Mask sensitive data in error message and stack
        const maskedMessage = maskSensitiveData(err.message || err.toString());
        const maskedStack = maskSensitiveData(err.stack || "");

        // Create error log entry
        await ErrorLog.create({
            errorMessage: maskedMessage,
            errorType,
            severity,
            userId,
            userEmail,
            screenName: req.headers.referer || req.originalUrl,
            apiEndpoint: req.originalUrl,
            httpStatusCode: err.status || err.statusCode || 500,
            stackTrace: maskedStack,
            userAgent: req.headers['user-agent'],
            environment: process.env.NODE_ENV || 'Development'
        });

        // Emit real-time notification to admin clients
        const io = req.app.get("io");
        if (io) {
            io.emit("error:new", {
                message: maskedMessage,
                type: errorType,
                severity,
                timestamp: new Date()
            });
        }
    } catch (logError) {
        console.error("Failed to log error:", logError);
    }

    // Pass error to next handler
    next(err);
};

/**
 * Determine error type based on context
 */
function determineErrorType(err, req) {
    if (err.name === 'MongoError' || err.name === 'MongooseError') return 'Database';
    if (req.originalUrl?.startsWith('/api/')) return 'API';
    return 'Backend';
}

/**
 * Auto-classify severity based on status code and error type
 */
function determineSeverity(err) {
    const status = err.status || err.statusCode || 500;

    if (status >= 500) return 'Critical';
    if (status >= 400 && status < 500) return 'Medium';
    if (err.name === 'ValidationError') return 'Low';

    return 'Medium';
}

/**
 * Mask sensitive data using regex patterns
 */
function maskSensitiveData(text) {
    if (!text) return text;

    const patterns = [
        { regex: /(password|pwd|pass)[\s:=]+["']?([^"'\s]+)["']?/gi, replacement: '$1: ***MASKED***' },
        { regex: /(token|jwt|bearer)[\s:=]+["']?([^"'\s]+)["']?/gi, replacement: '$1: ***MASKED***' },
        { regex: /(api[_-]?key|apikey|secret)[\s:=]+["']?([^"'\s]+)["']?/gi, replacement: '$1: ***MASKED***' },
        { regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '****-****-****-****' }, // Credit cards
        { regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '***-**-****' } // SSN
    ];

    let masked = text;
    patterns.forEach(({ regex, replacement }) => {
        masked = masked.replace(regex, replacement);
    });

    return masked;
}

export default errorLogger;

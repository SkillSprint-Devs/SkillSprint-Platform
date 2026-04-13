import ErrorLog from "../models/ErrorLog.js";

// Global Error Handler Middleware

const errorHandler = async (err, req, res, next) => {
    console.error("SERVER ERROR:", err);

    let log = null;
    try {
        const errorData = {
            errorMessage: err.message || "Internal Server Error",
            errorType: 'Backend',
            severity: err.severity || 'High',
            userId: req.user ? req.user.id : null,
            userEmail: req.user ? req.user.email : null,
            screenName: req.originalUrl,
            requestUrl: req.originalUrl,
            requestMethod: req.method,
            ipAddress: req.ip || req.headers['x-forwarded-for'],
            userAgent: req.headers['user-agent'],
            environment: process.env.NODE_ENV || 'Development',
            stackTrace: process.env.NODE_ENV === 'Production' ? null : err.stack,
            httpStatusCode: err.status || 500,
            sessionId: req.sessionID || null
        };

        // Mask sensitive data in message/stack if necessary
        errorData.errorMessage = maskSensitiveData(errorData.errorMessage);
        if (errorData.stackTrace) {
            errorData.stackTrace = maskSensitiveData(errorData.stackTrace);
        }

        log = await ErrorLog.create(errorData);

        // Emit real-time notification if possible
        const io = req.app.get("io");
        if (io) {
            io.emit("error:new", {
                id: log._id,
                message: log.errorMessage,
                type: 'Backend',
                severity: log.severity,
                timestamp: log.timestamp
            });
        }

    } catch (logErr) {
        console.error("FAILED TO LOG ERROR TO DB:", logErr);
    }

    res.status(err.status || 500).json({
        message: process.env.NODE_ENV === 'Production' || process.env.NODE_ENV === 'production'
            ? "An internal server error occurred"
            : err.message,
        errorId: log?._id || null, // Provide ID so admin can search for it in ErrorLog
        error: process.env.NODE_ENV === 'Production' || process.env.NODE_ENV === 'production' ? {} : err
    });
};

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

export default errorHandler;

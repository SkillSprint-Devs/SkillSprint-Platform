/**
 * Global Error Handler for Frontend
 * Automatically captures and logs all JavaScript errors
 */

const API_BASE = window.API_BASE_URL;

// Capture uncaught errors
window.addEventListener('error', (event) => {
    logError({
        errorMessage: event.message,
        fileName: event.filename,
        lineNumber: event.lineno,
        columnNumber: event.colno,
        stackTrace: event.error?.stack || "",
        screenName: window.location.pathname
    });
});

// Capture unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    logError({
        errorMessage: `Unhandled Promise Rejection: ${event.reason}`,
        fileName: "Promise",
        lineNumber: 0,
        columnNumber: 0,
        stackTrace: event.reason?.stack || String(event.reason),
        screenName: window.location.pathname
    });
});

/**
 * Send error to backend
 */
async function logError(errorData) {
    try {
        const token = localStorage.getItem("token");
        if (!token) return; // Don't log if user not authenticated

        await fetch(`${API_BASE}/errors/log`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(errorData)
        });
    } catch (err) {
        // Fail silently to avoid infinite loop
        console.error("Failed to log error:", err);
    }
}

/**
 * Manual error logging function
 * Can be called from try-catch blocks
 */
window.logErrorManually = function (error, context = {}) {
    logError({
        errorMessage: error.message || String(error),
        fileName: context.fileName || "Manual",
        lineNumber: context.lineNumber || 0,
        columnNumber: context.columnNumber || 0,
        stackTrace: error.stack || "",
        screenName: context.screenName || window.location.pathname
    });
};

console.log("Global error handler initialized");

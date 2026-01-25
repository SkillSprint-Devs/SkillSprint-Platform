/**
 * SkillSprint Frontend Error Tracking
 * Captures global errors and promise rejections
 */
(function () {
    const API_BASE = window.API_BASE_URL;

    let isReporting = true; // Enabled
    let reportingCount = 0;

    function logError(errorData) {
        if (!isReporting) return;
        if (reportingCount >= 10) return; // Hard limit to prevent mail/log floods
        reportingCount++;

        const userStr = localStorage.getItem("user");
        const token = localStorage.getItem("token");
        const user = userStr ? JSON.parse(userStr) : null;

        const payload = {
            errorMessage: errorData.message || 'Unknown Frontend Error',
            errorType: 'Frontend',
            severity: errorData.severity || 'Medium',
            fileName: errorData.filename,
            lineNumber: errorData.lineno,
            columnNumber: errorData.colno,
            stackTrace: errorData.stack || (errorData.error ? errorData.error.stack : null),
            screenName: window.location.pathname,
            userAgent: navigator.userAgent,
            environment: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'Development' : 'Production',
            requestUrl: window.location.href,
            requestMethod: 'GET'
        };

        fetch(`${API_BASE}/errors/log`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
            },
            body: JSON.stringify(payload)
        }).catch(err => {
            // Use original console to avoid loops
            if (window._ss_original_console_error) {
                window._ss_original_console_error("Failed to send error to logger:", err);
            }
        });
    }

    // Global Error Handler
    window.addEventListener('error', (event) => {
        logError({
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error,
            severity: 'Medium'
        });
    });

    // Promise Rejection Handler
    window.addEventListener('unhandledrejection', (event) => {
        logError({
            message: `Unhandled Promise Rejection: ${event.reason}`,
            error: event.reason,
            severity: 'High'
        });
    });

    // Console Interception (NEW)
    let isIntercepting = false;
    const intercept = (method) => {
        const original = console[method];
        // Store original to allow bypass in catch
        if (method === 'error') window._ss_original_console_error = original;

        console[method] = function (...args) {
            original.apply(console, args);

            if (isIntercepting) return; // Prevent infinite loop

            try {
                isIntercepting = true;
                const message = args.map(arg => {
                    if (arg instanceof Error) return arg.stack || arg.message;
                    if (typeof arg === 'object') {
                        try { return JSON.stringify(arg); } catch (e) { return "[Object]"; }
                    }
                    return String(arg);
                }).join(' ');

                // Only report if it looks like an actual error or warned issue
                logError({
                    message: `[Console.${method}] ${message}`,
                    severity: method === 'error' ? 'High' : 'Medium',
                    errorType: 'Frontend'
                });
            } catch (err) {
                // Fail silently
            } finally {
                isIntercepting = false;
            }
        };
    };

    intercept('error');
    intercept('warn');

    console.log('SkillSprint Error Tracking Initialized (with Console Interception)');
})();

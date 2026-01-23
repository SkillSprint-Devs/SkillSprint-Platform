/**
 * Utility to group similar errors
 */
export const groupErrors = (errors) => {
    const groups = {};

    errors.forEach(error => {
        // Create a key based on error message (sanitized) and source
        const source = error.fileName || error.screenName || 'Unknown';
        const message = error.errorMessage.substring(0, 100); // Take first 100 chars to avoid unique data issues
        const key = `${message}|${source}`;

        if (!groups[key]) {
            groups[key] = {
                message: error.errorMessage,
                source: source,
                count: 0,
                lastOccurrence: error.timestamp,
                severity: error.severity,
                errorType: error.errorType,
                ids: []
            };
        }

        groups[key].count += 1;
        if (new Date(error.timestamp) > new Date(groups[key].lastOccurrence)) {
            groups[key].lastOccurrence = error.timestamp;
        }
        groups[key].ids.push(error._id);
    });

    return Object.values(groups).sort((a, b) => b.count - a.count);
};

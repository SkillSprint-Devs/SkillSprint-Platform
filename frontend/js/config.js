/**
 * config.js
 * Centralized configuration for API and Socket URLs.
 * This file should be loaded before any other script that makes API calls.
 */

(function () {
    // Check if running on localhost
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // API CONFIGURATION
    window.API_BASE_URL = isLocal ? 'http://localhost:5000/api' : '/api';

    // SOCKET CONFIGURATION
    // For production, if the socket is on the same domain, usually '' works or the specific path.
    // If using a separate socket server, configure it here.
    window.API_SOCKET_URL = isLocal ? 'http://localhost:5000' : '';

    console.log('[Config] Loaded. API:', window.API_BASE_URL, 'Socket:', window.API_SOCKET_URL || 'Using relative path');
})();

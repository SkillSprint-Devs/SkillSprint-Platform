
// System Health Logic

const API_BASE = window.API_BASE_URL + '/admin';

// DOM Elements
const refreshBtn = document.getElementById("refreshBtn");
const lastUpdatedEl = document.getElementById("lastUpdated");
const overallStatusText = document.getElementById("overallStatusText");
const overallStatusBadge = document.getElementById("overallStatusBadge");
const overallStatusCard = document.getElementById("overallStatusCard");

// Database elements
const dbBadge = document.getElementById("dbBadge");
const dbStatus = document.getElementById("dbStatus");
const dbState = document.getElementById("dbState");

// Execution elements
const execBadge = document.getElementById("execBadge");
const execStatus = document.getElementById("execStatus");
const execUrl = document.getElementById("execUrl");
const execLangs = document.getElementById("execLangs");

// System elements
const sysBadge = document.getElementById("sysBadge");
const memUsageEl = document.getElementById("memUsage");
const uptimeEl = document.getElementById("sysUptime");
const errorRateEl = document.getElementById("errorRate");

/**
 * Authenticated Fetch Helper for Admin Routes
 */
async function adminFetch(endpoint, options = {}) {
    const token = localStorage.getItem("token");
    if (!token) {
        window.location.href = "admin-login.html";
        return null;
    }

    const headers = {
        ...options.headers,
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
    };

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem("token");
            window.location.href = "admin-login.html";
            return null;
        }
        return await res.json();
    } catch (err) {
        console.error(`[Admin] Fetch error:`, err);
        return null;
    }
}

function updateBadge(el, status) {
    if (!el) return;
    el.className = `status-badge status-${status}`;
    el.textContent = status;
}

async function fetchHealthData() {
    if (refreshBtn) refreshBtn.querySelector('i').classList.add('rotating');
    
    const data = await adminFetch("/health");
    
    if (refreshBtn) refreshBtn.querySelector('i').classList.remove('rotating');
    
    if (data && data.success && data.health) {
        const health = data.health;
        const checks = health.checks;

        // Overall
        lastUpdatedEl.textContent = `Last check: ${new Date().toLocaleTimeString()}`;
        updateBadge(overallStatusBadge, health.status);
        
        const statusColors = {
            'healthy': '#22c55e',
            'degraded': '#eab308',
            'critical': '#ef4444',
            'unknown': '#6b7280'
        };
        overallStatusCard.style.borderLeftColor = statusColors[health.status] || '#6b7280';
        
        const statusMessages = {
            'healthy': 'All Systems Operational',
            'degraded': 'System Performance Degraded',
            'critical': 'System Critical - Action Required',
            'unknown': 'System Status Unknown'
        };
        overallStatusText.textContent = statusMessages[health.status];

        // Database
        if (checks.database) {
            updateBadge(dbBadge, checks.database.status);
            dbStatus.textContent = checks.database.status.toUpperCase();
            dbState.textContent = checks.database.state;
        }

        // Execution
        if (checks.executionService) {
            const exec = checks.executionService;
            updateBadge(execBadge, exec.status);
            execStatus.textContent = exec.status.toUpperCase();
            execUrl.textContent = exec.url;
            if (exec.healthy && exec.details?.languages) {
                execLangs.textContent = exec.details.languages.join(', ');
            } else {
                execLangs.textContent = exec.error || 'N/A';
            }
        }

        // System
        if (checks.memory && checks.uptime && checks.errorRate) {
            updateBadge(sysBadge, 'healthy'); // Logic for sys overall could be more complex
            memUsageEl.textContent = `${checks.memory.usedMB} / ${checks.memory.totalMB} MB (${checks.memory.percentage}%)`;
            uptimeEl.textContent = checks.uptime.formatted;
            errorRateEl.textContent = `${checks.errorRate.count} high/critical errors`;
            if (checks.errorRate.status !== 'healthy') updateBadge(sysBadge, checks.errorRate.status);
        }
    }
}

function init() {
    const adminUser = JSON.parse(localStorage.getItem("adminUser"));
    if (!adminUser || adminUser.role !== 'admin') {
        window.location.href = "admin-login.html";
        return;
    }
    
    const headerAdminName = document.getElementById("headerAdminName");
    if (headerAdminName && adminUser.name) {
        headerAdminName.textContent = adminUser.name;
    }
    
    fetchHealthData();
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', fetchHealthData);
    }
    
    // Auto refresh every 60 seconds
    setInterval(fetchHealthData, 60000);
}

document.addEventListener("DOMContentLoaded", init);

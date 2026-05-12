
// Admin Dashboard Logic

const API_BASE = window.API_BASE_URL + '/admin';

// DOM Elements
const totalUsersEl = document.getElementById("totalUsersCount");
const onlineUsersEl = document.getElementById("onlineUsersCount");
const activeSessionsEl = document.getElementById("activeSessionsCount");
const activityFeedEl = document.getElementById("activityFeed");
const usersTableBody = document.getElementById("usersTableBody");

/**
 * Authenticated Fetch Helper for Admin Routes
 */
async function adminFetch(endpoint, options = {}) {
    const token = localStorage.getItem("token");
    if (!token) {
        console.warn("[Admin] No token found. Redirecting to login.");
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
            console.error("[Admin] Session expired or unauthorized.");
            localStorage.removeItem("token");
            localStorage.removeItem("adminUser");
            window.location.href = "admin-login.html";
            return null;
        }

        return await res.json();
    } catch (err) {
        console.error(`[Admin] Fetch error for ${endpoint}:`, err);
        return null;
    }
}

async function fetchStats() {
    const data = await adminFetch("/stats");
    if (data && data.success) {
        if (totalUsersEl) totalUsersEl.textContent = data.stats.totalUsers.toLocaleString();
        if (onlineUsersEl) onlineUsersEl.textContent = data.stats.onlineUsers.toLocaleString();
        if (activeSessionsEl) activeSessionsEl.textContent = data.stats.activeSessions.toLocaleString();
    }
}

async function fetchHealth() {
    const data = await adminFetch("/health");
    if (data && data.success && data.health) {
        const health = data.health;

        const statusIndicator = document.getElementById("systemStatusIndicator");
        const statusText = document.getElementById("systemStatusText");

        if (statusIndicator && statusText) {
            const statusColors = {
                'healthy': 'var(--success)',
                'degraded': 'var(--warning)',
                'critical': '#f44336',
                'error': '#f44336'
            };
            const statusLabels = {
                'healthy': 'System Healthy',
                'degraded': 'System Degraded',
                'critical': 'System Critical',
                'error': 'System Error'
            };
            statusIndicator.style.background = statusColors[health.status] || 'var(--text-muted)';
            statusText.textContent = statusLabels[health.status] || 'Unknown';
        }

        const memoryUsageEl = document.getElementById("memoryUsage");
        const memoryStatusEl = document.getElementById("memoryStatus");
        if (memoryUsageEl && memoryStatusEl && health.checks?.memory) {
            const mem = health.checks.memory;
            memoryUsageEl.textContent = `${mem.percentage}%`;
            const memColors = { 'healthy': 'var(--success)', 'warning': 'var(--warning)', 'critical': '#f44336' };
            memoryStatusEl.style.color = memColors[mem.status] || 'var(--success)';
            memoryStatusEl.textContent = `${mem.usedMB}MB / ${mem.totalMB}MB`;
        }
    }
}

async function fetchActivity() {
    const data = await adminFetch("/activity");
    if (data && data.success) {
        renderActivity(data.activities);
    }
}

async function fetchUsersPreview() {
    const data = await adminFetch("/users-preview");
    if (data && data.success && usersTableBody) {
        usersTableBody.innerHTML = "";
        data.users.forEach(u => {
            const tr = document.createElement("tr");
            tr.style.borderBottom = "1px solid var(--border-color)";
            const statusColor = u.isOnline ? "var(--success)" : "var(--text-muted)";
            const statusText = u.isOnline ? "Online" : "Offline";
            tr.innerHTML = `
                <td style="padding: 12px; font-weight: 500;">${u.name}</td>
                <td style="padding: 12px;">${u.role || 'User'}</td>
                <td style="padding: 12px;"><span style="color: ${statusColor}; font-size: 0.8rem;">${statusText}</span></td>
                <td style="padding: 12px;">${new Date(u.createdAt).toLocaleDateString()}</td>
            `;
            usersTableBody.appendChild(tr);
        });
    }
}

function renderActivity(activities) {
    if (!activityFeedEl) return;
    activityFeedEl.innerHTML = "";
    if (!activities || activities.length === 0) {
        activityFeedEl.innerHTML = '<div class="text-muted">No recent activity</div>';
        return;
    }
    activities.forEach(item => {
        const itemEl = document.createElement("div");
        itemEl.className = "flex gap-2";
        let color = "var(--admin-accent)";
        if (item.type === "success") color = "var(--success)";
        if (item.type === "warning") color = "var(--warning)";
        itemEl.innerHTML = `
            <div style="min-width: 8px; height: 8px; border-radius: 50%; background: ${color}; margin-top: 6px;"></div>
            <div>
                <div class="text-sm font-bold">${item.text}</div>
                <div class="text-sm text-muted">${item.subtext}</div>
                <div class="text-sm text-muted" style="font-size: 0.75rem;">${new Date(item.time).toLocaleTimeString()}</div>
            </div>
        `;
        activityFeedEl.appendChild(itemEl);
    });
}

function init() {
    const adminUser = JSON.parse(localStorage.getItem("adminUser"));
    if (!adminUser || adminUser.role !== 'admin') {
        window.location.href = "admin-login.html";
        return;
    }
    fetchStats();
    fetchHealth();
    fetchActivity();
    fetchUsersPreview();
    setInterval(() => {
        fetchStats(); fetchHealth(); fetchActivity(); fetchUsersPreview();
    }, 30000);
}

document.addEventListener("DOMContentLoaded", init);


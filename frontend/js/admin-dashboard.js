
// Admin Dashboard Logic

const API_BASE = window.API_BASE_URL + '/admin';

// DOM Elements
const totalUsersEl = document.getElementById("totalUsersCount");
const onlineUsersEl = document.getElementById("onlineUsersCount");
const activeSessionsEl = document.getElementById("activeSessionsCount");
const activityFeedEl = document.getElementById("activityFeed");
const usersTableBody = document.getElementById("usersTableBody");

async function fetchStats() {
    try {
        const res = await fetch(`${API_BASE}/stats`);
        const data = await res.json();

        if (data.success) {
            if (totalUsersEl) totalUsersEl.textContent = data.stats.totalUsers.toLocaleString();
            if (onlineUsersEl) onlineUsersEl.textContent = data.stats.onlineUsers.toLocaleString();
            if (activeSessionsEl) activeSessionsEl.textContent = data.stats.activeSessions.toLocaleString();
        }
    } catch (err) {
        console.error("Failed to fetch stats:", err);
    }
}

async function fetchHealth() {
    try {
        const res = await fetch(`${API_BASE}/health`);
        const data = await res.json();

        if (data.success && data.health) {
            const health = data.health;

            // Update system status indicator and text
            const statusIndicator = document.getElementById("systemStatusIndicator");
            const statusText = document.getElementById("systemStatusText");

            if (statusIndicator && statusText) {
                // Set color based on status
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

            // Update memory usage
            const memoryUsageEl = document.getElementById("memoryUsage");
            const memoryStatusEl = document.getElementById("memoryStatus");

            if (memoryUsageEl && memoryStatusEl && health.checks?.memory) {
                const mem = health.checks.memory;
                memoryUsageEl.textContent = `${mem.percentage}%`;

                // Set status color
                const memColors = {
                    'healthy': 'var(--success)',
                    'warning': 'var(--warning)',
                    'critical': '#f44336'
                };

                memoryStatusEl.style.color = memColors[mem.status] || 'var(--success)';
                memoryStatusEl.textContent = `${mem.usedMB}MB / ${mem.totalMB}MB`;
            }
        }
    } catch (err) {
        console.error("Failed to fetch health:", err);
        // Show error state
        const statusText = document.getElementById("systemStatusText");
        if (statusText) statusText.textContent = "Health Check Failed";
    }
}

async function fetchActivity() {
    try {
        const res = await fetch(`${API_BASE}/activity`);
        const data = await res.json();

        if (data.success) {
            renderActivity(data.activities);
        }
    } catch (err) {
        console.error("Failed to fetch activity:", err);
    }
}

async function fetchUsersPreview() {
    try {
        const res = await fetch(`${API_BASE}/users-preview`);
        const data = await res.json();

        if (data.success && usersTableBody) {
            usersTableBody.innerHTML = "";
            data.users.forEach(u => {
                const tr = document.createElement("tr");
                tr.style.borderBottom = "1px solid var(--border-color)";
                const statusColor = u.isOnline ? "var(--success)" : "var(--text-muted)";
                const statusText = u.isOnline ? "Online" : "Offline";
                // Determine rough status if isOnline not available
                // Actually the backend might not send isOnline if not in schema.
                // We will trust backend or default to 'Active'

                tr.innerHTML = `
                   <td style="padding: 12px; font-weight: 500;">${u.name}</td>
                   <td style="padding: 12px;">${u.role || 'User'}</td>
                   <td style="padding: 12px;"><span style="color: ${statusColor}; font-size: 0.8rem;">[Status] ${statusText}</span></td>
                   <td style="padding: 12px;">${new Date(u.createdAt).toLocaleDateString()}</td>
                 `;
                usersTableBody.appendChild(tr);
            });
        }
    } catch (err) {
        console.error("Failed users preview:", err);
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

        // Color based on type
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
    // Basic Auth Check
    const adminUser = JSON.parse(localStorage.getItem("adminUser"));
    if (!adminUser || adminUser.role !== 'admin') {
        window.location.href = "admin-login.html";
        return;
    }

    fetchStats();
    fetchHealth();
    fetchActivity();
    fetchUsersPreview();

    // Auto-refresh every 30s
    setInterval(() => {
        fetchStats();
        fetchHealth();
        fetchActivity();
        fetchUsersPreview();
    }, 30000);
}

document.addEventListener("DOMContentLoaded", init);

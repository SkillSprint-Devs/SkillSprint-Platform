
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
            
            const isOnline = u.isOnline === true;
            const statusColor = isOnline ? "var(--success)" : "var(--text-muted)";
            const statusText = isOnline ? "Online" : "Offline";
            
            const rawRole = u.role || 'user';
            const displayRole = rawRole.charAt(0).toUpperCase() + rawRole.slice(1);
            
            let roleClass = 'role-student';
            if (rawRole === 'admin') roleClass = 'role-admin';
            if (rawRole === 'mentor') roleClass = 'role-mentor';

            tr.innerHTML = `
                <td style="padding: 12px; font-weight: 500;">
                    <div class="flex items-center gap-2">
                        <div style="width: 28px; height: 28px; border-radius: 50%; background: #eee; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: bold; color: var(--text-muted);">
                            ${u.name ? u.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        ${u.name}
                    </div>
                </td>
                <td style="padding: 12px;">
                    <span style="font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--admin-accent);">${displayRole}</span>
                </td>
                <td style="padding: 12px;">
                    <span style="display: inline-flex; align-items: center; gap: 4px; color: ${statusColor}; font-size: 0.8rem; font-weight: 500;">
                        <span style="width: 6px; height: 6px; border-radius: 50%; background: ${statusColor};"></span>
                        ${statusText}
                    </span>
                </td>
                <td style="padding: 12px; font-size: 0.85rem; color: var(--text-muted);">${new Date(u.created_at).toLocaleDateString()}</td>
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
    
    const headerAdminName = document.getElementById("headerAdminName");
    if (headerAdminName && adminUser.name) {
        headerAdminName.textContent = adminUser.name;
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


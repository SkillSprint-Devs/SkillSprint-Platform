
// Admin Dashboard Logic

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
    ? 'http://localhost:5000/api/admin'
    : '/api/admin';

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
                   <td style="padding: 12px;"><span style="color: ${statusColor}; font-size: 0.8rem;">● ${statusText}</span></td>
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
    fetchActivity();
    fetchUsersPreview();

    // Auto-refresh every 30s
    setInterval(() => {
        fetchStats();
        fetchActivity();
        fetchUsersPreview();
    }, 30000);
}

document.addEventListener("DOMContentLoaded", init);

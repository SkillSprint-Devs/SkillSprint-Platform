// notifications-global.js
(function () {
    const token = localStorage.getItem("token");
    if (!token || !window.io) return;

    const SOCKET_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
        ? 'http://localhost:5000'
        : '';
    const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
        ? 'http://localhost:5000/api'
        : '/api';

    const socket = io(SOCKET_URL, {
        auth: { token },
        reconnection: true
    });

    socket.on("connect", () => {
        console.log("[GlobalNotif] Connected to notification stream");
        fetchUnreadCount();
    });

    async function fetchUnreadCount() {
        try {
            const res = await fetch(`${API_BASE}/notifications/unread-count`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const { count } = await res.json();
            updateIndicators(count);
        } catch (e) {
            console.error("[GlobalNotif] Failed to fetch unread count", e);
        }
    }

    function updateIndicators(count) {
        const hasUnread = count > 0;

        // 1. Dashboard Red Dot
        const dashboardBadge = document.querySelector(".notif-badge");
        if (dashboardBadge) {
            dashboardBadge.style.display = hasUnread ? "block" : "none";
            if (hasUnread) dashboardBadge.classList.add("pulse");
        }

        // 2. Navbar Badge
        const navbarBadge = document.getElementById("navbarNotifBadge");
        if (navbarBadge) {
            if (hasUnread) {
                navbarBadge.textContent = count > 9 ? '9+' : count;
                navbarBadge.style.display = "flex";
            } else {
                navbarBadge.style.display = "none";
            }
        }
    }

    socket.on("notification", (n) => {
        console.log("[GlobalNotif] New notification:", n);

        // 1. Show global toast alert
        if (typeof showToast === 'function') {
            showToast(n.message || "New Notification", n.type === 'reminder' ? 'warning' : 'info', 5000);
        }

        // 2. Re-fetch count to update all badges accurately
        fetchUnreadCount();

        // 3. Update Dashboard list if we are on the dashboard
        if (typeof window.loadNotifications === 'function') {
            window.loadNotifications();
        }
    });

    window.globalSocket = socket;
    window.fetchUnreadCount = fetchUnreadCount;
})();

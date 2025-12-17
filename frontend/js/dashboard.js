// === DASHBOARD.JS ===
const API_BASE = "http://127.0.0.1:5000/api";

// SIDEBAR TOGGLE
const sidebar = document.getElementById("sidebar");
const toggleBtn = document.getElementById("toggleSidebar");
const aiGuide = document.getElementById("aiGuide");

if (toggleBtn) {
  // Initial state check
  toggleBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i>';

  toggleBtn.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
    const isCollapsed = sidebar.classList.contains("collapsed");

    // 1. Toggle Button Icon: Arrow <-> 'S'
    if (isCollapsed) {
      toggleBtn.innerHTML = "S";
    } else {
      toggleBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i>';
    }

    // 2. AI Guide: Text <-> Bot Icon
    if (aiGuide) {
      if (isCollapsed) {
        aiGuide.innerHTML = `
          <button type="button" title="Open Chat">
            <i class="fa-solid fa-robot"></i>
          </button>
        `;
      } else {
        aiGuide.innerHTML = `
          <p>Your AI Guide</p>
          <button type="button">Open Chat</button>
        `;
      }
    }
  });
}

// FETCH DASHBOARD DATA
async function loadDashboard() {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Failed to load dashboard.");
    const data = await res.json();

    // User Info
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    ["username", "usernameTop"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = user.name || "Guest";
    });

    const profileImgUrl = user.profile_image || "assets/images/user-avatar.png";
    if (document.getElementById("profileAvatar")) document.getElementById("profileAvatar").src = profileImgUrl;

    // Wallet Info
    // Ensure elements exist before setting
    if (document.getElementById("walletCredits")) document.getElementById("walletCredits").textContent = `$${data.wallet?.remaining_time || "0"}`;
    if (document.getElementById("walletSpent")) document.getElementById("walletSpent").textContent = `$${data.wallet?.spent || "0"}`;
    if (document.getElementById("walletEarned")) document.getElementById("walletEarned").textContent = `$${data.wallet?.earned || "0"}`;

    // Tasks and Notifications
    renderTasks(data.tasks);
    loadNotifications(); // Load from API
    loadReminders();     // Load Reminders

    // Socket.IO for Realtime
    if (window.io) setupSocket(token);

  } catch (err) {
    console.error("Dashboard load error:", err);
    if (typeof showToast === 'function') showToast("Error loading dashboard data", "error");
  }
}

// === TASKS ===
function renderTasks(tasks) {
  const taskList = document.getElementById("taskList");
  if (!taskList) return;

  taskList.innerHTML = "";

  if (!tasks || tasks.length === 0) {
    taskList.innerHTML = `<div class="empty-state" style="padding:10px; color:#999;">No active tasks.</div>`;
    return;
  }

  const template = document.getElementById("taskCardTemplate");

  tasks.forEach(t => {
    const card = template.content.cloneNode(true);

    card.querySelector(".task-title").textContent = t.title;
    card.querySelector(".task-description").textContent = t.description || "No description";

    const dot = card.querySelector(".color-dot");
    let color = "#4caf50";
    if (t.priority === 'high') color = "#ef5350";
    if (t.priority === 'medium') color = "#ffb300";
    dot.style.background = color;

    const dateStr = t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "No Date";
    card.querySelector(".task-due-date").textContent = `Due ${dateStr}`;

    const badge = card.querySelector(".task-progress-badge");
    badge.textContent = `${t.progress || 0}%`;

    card.querySelector(".task-card").onclick = () => location.href = "task.html";
    taskList.appendChild(card);
  });
}

// === NOTIFICATIONS ===
async function loadNotifications() {
  const token = localStorage.getItem("token");
  const list = document.getElementById("notifList");
  if (!list) return;

  try {
    const res = await fetch(`${API_BASE}/notifications`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    // Check if endpoint exists (it definitely should, but just in case)
    if (res.status === 404) return; // Silent fail if not implemented

    const notifications = await res.json();
    renderNotifications(notifications);
  } catch (err) {
    console.error("Load notifs error:", err);
  }
}

function renderNotifications(notifications) {
  const list = document.getElementById("notifList");
  if (!list) return;

  list.innerHTML = "";
  if (!notifications || notifications.length === 0) {
    list.innerHTML = `<div style="text-align:center; color:#ccc; padding:10px;">No new notifications</div>`;
    return;
  }

  notifications.forEach(n => {
    const item = document.createElement("div");
    item.className = "notif-item";

    let iconClass = "fa-circle-info";
    if (n.type === "chat") iconClass = "fa-comment";
    if (n.type === "task") iconClass = "fa-list-check";
    if (n.type === "invite") iconClass = "fa-user-plus";
    if (n.type === "reminder") iconClass = "fa-clock";

    item.innerHTML = `
      <div class="notif-icon"><i class="fa-solid ${iconClass}"></i></div>
      <div class="notif-content">
        <h4>${n.title || "Notification"}</h4>
        <p>${n.message || ""}</p>
        <span class="time">${new Date(n.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    `;
    list.appendChild(item);
  });
}

// === REMINDERS ===
async function loadReminders() {
  const token = localStorage.getItem("token");
  const list = document.getElementById("reminderList");

  try {
    const res = await fetch(`${API_BASE}/reminders`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // Check for HTML response (server not restarted)
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("text/html")) {
      console.warn("Server returned HTML for API request - likely 404/Server not restarted");
      if (list) list.innerHTML = `<div style="color:var(--danger); padding:10px;">API Unavailable. Please restart server.</div>`;
      return;
    }

    if (!res.ok) throw new Error("API Error");

    const reminders = await res.json();

    list.innerHTML = "";
    if (reminders.length === 0) {
      list.innerHTML = `<div style="text-align:center; color:#999; padding:10px;">No reminders yet</div>`;
      return;
    }

    reminders.forEach(r => {
      const item = document.createElement("div");
      item.className = `reminder-item ${r.completed ? 'completed' : ''}`;
      item.innerHTML = `
        <div class="reminder-checkbox ${r.completed ? 'checked' : ''}" onclick="toggleReminder('${r._id}', ${!r.completed})"></div>
        <div class="reminder-content">
          <div class="reminder-text">${r.text}</div>
          <div class="reminder-meta">${new Date(r.createdAt).toLocaleDateString()}</div>
        </div>
        <button class="delete-reminder-btn" onclick="deleteReminder('${r._id}')"><i class="fa-solid fa-trash"></i></button>
      `;
      list.appendChild(item);
    });

  } catch (err) {
    console.error("Load reminders error:", err);
  }
}

// Global Handlers
async function addReminder() {
  const input = document.getElementById("newReminderInput");
  const text = input.value.trim();
  if (!text) return;

  const token = localStorage.getItem("token");
  try {
    await fetch(`${API_BASE}/reminders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ text })
    });
    input.value = "";
    loadReminders();
  } catch (err) { console.error(err); }
}

window.toggleReminder = async (id, completed) => {
  const token = localStorage.getItem("token");
  try {
    await fetch(`${API_BASE}/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ completed })
    });
    loadReminders();
  } catch (err) { console.error(err); }
};

window.deleteReminder = async (id) => {
  const token = localStorage.getItem("token");
  if (!confirm("Delete this reminder?")) return;
  try {
    await fetch(`${API_BASE}/reminders/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    loadReminders();
  } catch (err) { console.error(err); }
};

// Listeners
document.getElementById("addReminderBtn")?.addEventListener("click", addReminder);
document.getElementById("newReminderInput")?.addEventListener("keypress", (e) => {
  if (e.key === "Enter") addReminder();
});

// Socket
function setupSocket(token) {
  const socket = io("http://127.0.0.1:5000", {
    auth: { token },
    transports: ["websocket"]
  });

  socket.on("connect", () => console.log("Socket connected"));
  socket.on("notification", (n) => {
    if (typeof showToast === 'function') showToast(n.message || "New Notification", "info");
    loadNotifications(); // Refresh list
  });
}

// Init
document.addEventListener("DOMContentLoaded", loadDashboard);

// === DASHBOARD.JS ===
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
  ? 'http://localhost:5000/api'
  : '/api';

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

    // Streak Info (NEW)
    renderStreaks(data.user);

    // Wallet Info
    if (document.getElementById("walletCredits")) document.getElementById("walletCredits").textContent = formatMinutes(data.wallet?.remaining_time || 0);
    if (document.getElementById("walletSpent")) document.getElementById("walletSpent").textContent = formatMinutes(data.wallet?.spent || 0);
    if (document.getElementById("walletEarned")) document.getElementById("walletEarned").textContent = formatMinutes(data.wallet?.earned || 0);

    function formatMinutes(mins) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h}h ${m}m`;
    }

    // Tasks and Notifications
    window.currentDashboardData = data; // Cache for search filtering
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

// === STREAKS ===
function renderStreaks(user) {
  const countText = document.getElementById("streakCountText");
  const motivText = document.getElementById("streakMotivationalText");
  const progressBar = document.getElementById("streakProgressBar");

  if (!user || !countText || !motivText || !progressBar) return;

  const count = user.streakCount || 1;
  countText.textContent = `${count}-Day Streak`;

  // Motivational messages
  let message = "Keep up the great work!";
  if (count === 1) message = "Start your journey today!";
  else if (count < 3) message = "You're on a roll! Don't stop now.";
  else if (count < 7) message = "Unstoppable! Keep the fire burning.";
  else message = "Legendary! You're a SkillSprint champion.";

  // Custom message if missed today (lastActiveDate check)
  const lastActive = new Date(user.lastActiveDate);
  const now = new Date();
  const isToday = lastActive.getDate() === now.getDate() &&
    lastActive.getMonth() === now.getMonth() &&
    lastActive.getFullYear() === now.getFullYear();

  if (!isToday) {
    message = "Don't break your streak today!";
  }

  motivText.textContent = message;

  // Progress logic: Cycle of 7 days for the progress bar
  const progressPercent = ((count % 7) || 7) * (100 / 7);

  // Small delay for animation
  setTimeout(() => {
    progressBar.style.width = `${progressPercent}%`;
  }, 100);
}

// === TASKS ===
function renderTasks(tasks) {
  const taskList = document.getElementById("taskList");
  if (!taskList) return;

  taskList.innerHTML = "";

  // User Feature: Auto-remove 100% completed tasks from dashboard view
  const activeTasks = tasks.filter(t => {
    const totalSub = t.subTasks ? t.subTasks.length : 0;
    const doneSub = t.subTasks ? t.subTasks.filter(s => s.completed).length : 0;
    const pct = totalSub === 0 ? 0 : Math.round((doneSub / totalSub) * 100);
    return pct < 100;
  });

  if (activeTasks.length === 0) {
    taskList.innerHTML = `<div class="empty-state" style="padding:10px; color:#999;">No active tasks.</div>`;
    return;
  }

  const template = document.getElementById("taskCardTemplate");

  activeTasks.forEach(t => {
    // Calc subtask progress
    const totalSub = t.subTasks ? t.subTasks.length : 0;
    const doneSub = t.subTasks ? t.subTasks.filter(s => s.completed).length : 0;
    const pct = totalSub === 0 ? 0 : Math.round((doneSub / totalSub) * 100);

    const div = document.createElement('div');
    div.className = 'task-card';
    div.onclick = () => location.href = "task.html";

    const itemID = t._id || t.id;
    div.innerHTML = `
      <button class="remove-card-btn" onclick="event.stopPropagation(); window.removeTask('${itemID}')" title="Remove from Dashboard">
        <i class="fa-solid fa-xmark"></i>
      </button>
      <div class="task-left">
        <div class="task-card-header">
          <div class="color-dot" style="background: ${t.priority === 'high' ? '#ef5350' : t.priority === 'medium' ? '#ffb300' : '#4caf50'}"></div>
          <h4 class="task-title" style="font-size:1rem; margin:0;">${t.title}</h4>
        </div>
        <p class="task-description" style="font-size:0.85rem; color:#666;">${t.description || "No description"}</p>
        <div class="task-meta-row">
           <div class="task-meta-item"><i class="fa-solid fa-calendar"></i> ${t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'No Date'}</div>
           <div class="task-meta-item"><i class="fa-solid fa-list-check"></i> ${doneSub}/${totalSub} Subtasks</div>
        </div>
      </div>
      
      <div class="task-right">
        <div class="task-progress-badge" style="background: #e8f5e9; color: #4caf50;">${pct || 0}%</div>
      </div>
    `;

    taskList.appendChild(div);
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
      <button class="close-notif-btn" onclick="deleteNotification('${n._id}')"><i class="fa-solid fa-xmark"></i></button>
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

window.deleteNotification = async (id) => {
  const token = localStorage.getItem("token");
  // Optimistic UI removal
  const list = document.getElementById("notifList");
  // If we wanted to animate removal we could find the element, but for now just reload or let it update on refresh.
  // Actually, let's just call API and reload list
  try {
    // Check if DELETE endpoint exists, if not we just hide it locally
    const res = await fetch(`${API_BASE}/notifications/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.ok) {
      if (typeof showToast === 'function') showToast("Notification dismissed", "success");
      loadNotifications();
    } else {
      // Fallback for local simulation if API missing
      console.warn("Notification delete API failed, hiding locally");
      loadNotifications(); // Depending on implementation could filter locally
    }
  } catch (e) { console.error(e); }
}

// === REMINDERS ===
async function loadReminders() {
  const token = localStorage.getItem("token");
  const list = document.getElementById("reminderList");

  try {
    const res = await fetch(`${API_BASE}/reminders?t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
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
      const isDone = (r.is_done !== undefined) ? r.is_done : r.completed;
      item.className = `reminder-item ${isDone ? 'completed' : ''}`;
      item.setAttribute('data-reminder-id', r._id);
      const timeStr = r.dueTime ? `<div class="reminder-time" style="font-size:0.7rem; color:var(--accent); font-weight:600;"><i class="fa-solid fa-clock"></i> ${r.dueTime}</div>` : '';

      item.innerHTML = `
        <div class="reminder-checkbox ${isDone ? 'checked' : ''}" onclick="toggleReminder('${r._id}', ${!isDone})"></div>
        <div class="reminder-content">
          <div class="reminder-text">${r.text}</div>
          <div class="reminder-meta">
            ${timeStr}
            <div class="reminder-date">${new Date(r.createdAt).toLocaleDateString()}</div>
          </div>
        </div>
        <button class="delete-reminder-btn" onclick="window.deleteReminder('${r._id}')"><i class="fa-solid fa-trash"></i></button>
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
  const timeInput = document.getElementById("newReminderTime");
  const text = input.value.trim();
  const dueTime = timeInput ? timeInput.value : null;

  if (!text) {
    if (typeof showToast === 'function') showToast("Please enter a reminder", "info");
    return;
  }

  // Default to TODAY if no date picker exists in this quick-add form
  const dueDate = new Date();

  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`${API_BASE}/reminders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      // send dueDate so the scheduler picks it up
      body: JSON.stringify({ text, dueTime, dueDate: dueDate.toISOString() })
    });

    if (res.ok) {
      input.value = "";
      if (timeInput) timeInput.value = "";
      loadReminders();
      if (typeof showToast === 'function') showToast("Reminder added", "success");
    } else {
      throw new Error("Failed to add reminder");
    }
  } catch (err) {
    console.error(err);
    if (typeof showToast === 'function') showToast("Failed to add reminder", "error");
  }
}

window.toggleReminder = async (id, completed) => {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`${API_BASE}/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ completed }) // Server route maps 'completed' to 'is_done'
    });
    if (res.ok) {
      loadReminders();
      if (typeof showToast === 'function') showToast(completed ? "Reminder completed" : "Reminder restored", "success");
    }
  } catch (err) { console.error(err); }
};

window.deleteReminder = async (id) => {
  // Direct delete - No confirmation to avoid browser dialog issues
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`${API_BASE}/reminders/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.ok) {
      if (typeof showToast === 'function') showToast("Reminder deleted", "success");
      // 1. Remove from DOM
      const item = document.querySelector(`.reminder-item[data-reminder-id="${id}"]`);
      if (item) item.remove();
      // 2. Reload list
      await loadReminders();
    } else {
      const errData = await res.json();
      console.error("Delete failed:", errData);
      alert("Failed to delete: " + (errData.message || "Unknown server error"));
    }
  } catch (err) {
    console.error("Delete reminder error:", err);
    alert("Connection Error: " + err.message);
  }
};

// Listeners
document.getElementById("addReminderBtn")?.addEventListener("click", addReminder);
document.getElementById("newReminderInput")?.addEventListener("keypress", (e) => {
  if (e.key === "Enter") addReminder();
});

// --- Search Functionality ---
const dashboardSearch = document.querySelector('.search-bar input');
if (dashboardSearch) {
  dashboardSearch.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    filterDashboard(term);
  });
}

function filterDashboard(term) {
  if (!window.currentDashboardData) return;

  // Filter Tasks
  const filteredTasks = window.currentDashboardData.tasks.filter(t =>
    t.title.toLowerCase().includes(term) ||
    (t.description && t.description.toLowerCase().includes(term))
  );
  renderTasks(filteredTasks);

  // Filter Reminders
  // We need to fetch reminders separately because they are loaded into 'list'
  // Let's modify loadReminders to accept a filter term or keep a local copy
  const reminderItems = document.querySelectorAll('.reminder-item');
  reminderItems.forEach(item => {
    const text = item.querySelector('.reminder-text').textContent.toLowerCase();
    if (text.includes(term)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

// Socket
function setupSocket(token) {
  const SOCKET_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
    ? 'http://localhost:5000'
    : '';
  const socket = io(SOCKET_URL, {
    auth: { token }
  });

  socket.on("connect", () => console.log("Socket connected"));
  socket.on("notification", (n) => {
    if (typeof showToast === 'function') showToast(n.message || "New Notification", "info");
    loadNotifications(); // Refresh list
    if (typeof loadPendingInvites === 'function') loadPendingInvites();
    if (typeof loadSchedule === 'function') loadSchedule();
  });
}

// === SCHEDULE ===
async function loadSchedule() {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`${API_BASE}/live-sessions/my-schedule`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const sessions = await res.json();
    renderSessions(sessions);
  } catch (err) {
    console.error("Load schedule error:", err);
  }
}

function renderSessions(sessions) {
  const list = document.getElementById("sessionList");
  if (!list) return;
  list.innerHTML = "";

  if (!sessions || sessions.length === 0) {
    list.innerHTML = `<div class="empty-state" style="padding:10px; color:#999;">No upcoming sessions.</div>`;
    return;
  }

  // Sort by latest/newest first as requested by user
  sessions.sort((a, b) => new Date(b.scheduledDateTime) - new Date(a.scheduledDateTime));

  sessions.forEach(s => {
    const date = new Date(s.scheduledDateTime);
    const day = date.getDate();
    const month = date.toLocaleString('default', { month: 'short' });

    const div = document.createElement('div');
    div.className = 'session-card';
    if (s.status === 'live') div.classList.add('live-now');

    const itemID = s._id || s.id;
    div.innerHTML = `
            <button class="remove-card-btn" onclick="event.stopPropagation(); window.removeSession('${itemID}')" title="Remove from Dashboard">
              <i class="fa-solid fa-xmark"></i>
            </button>
            <div class="session-left">
                <div class="session-time-badge">
                    <span class="session-day">${day}</span>
                    <span class="session-month">${month}</span>
                </div>
                <div class="session-name-group">
                    <h4 class="session-title">${s.sessionName}</h4>
                    <p class="session-purpose">${s.purpose}</p>
                </div>
            </div>
            <div class="session-right">
                <div class="session-meta">
                    <span><i class="fa-solid fa-clock"></i> ${s.durationMinutes} min</span>
                    <span><i class="fa-solid fa-user-tie"></i> ${s.mentorId?.name || 'Mentor'}</span>
                </div>
                <button class="join-session-btn" onclick="location.href='livevideo.html?sessionId=${s._id}'" ${s.status === 'completed' ? 'disabled' : ''}>
                    ${s.status === 'live' ? '<span class="pulse"></span> Join Live' : s.status === 'completed' ? 'Completed' : 'Join'}
                </button>
            </div>
        `;
    list.appendChild(div);
  });
}

window.loadSchedule = loadSchedule;

// === PENDING INVITES ===
async function loadPendingInvites() {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`${API_BASE}/live-sessions/pending-invites`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const invites = await res.json();
    renderPendingInvites(invites);
  } catch (err) {
    console.error("Load invites error:", err);
  }
}

function renderPendingInvites(invites) {
  const container = document.getElementById("pendingInvitesSection");
  const list = document.getElementById("pendingInvitesList");
  if (!container || !list) return;

  if (!invites || invites.length === 0) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  list.innerHTML = "";

  invites.forEach(invite => {
    const div = document.createElement("div");
    div.className = "session-card";
    div.style.borderLeft = "4px solid var(--accent)";

    div.innerHTML = `
      <div class="session-left">
        <div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; border: 2px solid #eee;">
          <img src="${invite.mentorId?.profile_image || 'assets/images/user-avatar.png'}" style="width: 100%; height: 100%; object-fit: cover;" />
        </div>
        <div class="session-name-group">
          <h4 class="session-title">${invite.sessionName}</h4>
          <p class="session-purpose">Invite from <strong>${invite.mentorId?.name}</strong></p>
        </div>
      </div>
      <div class="session-right">
        <div style="display: flex; gap: 8px;">
          <button class="accept-btn" style="background:#4caf50; color:#fff; border:none; padding:5px 12px; border-radius:15px; cursor:pointer; font-size:0.8rem; font-weight:600;">Accept</button>
          <button class="decline-btn" style="background:#ef5350; color:#fff; border:none; padding:5px 12px; border-radius:15px; cursor:pointer; font-size:0.8rem; font-weight:600;">Decline</button>
        </div>
      </div>
    `;

    div.querySelector(".accept-btn").onclick = () => respondInvite(invite._id, 'accept');
    div.querySelector(".decline-btn").onclick = () => respondInvite(invite._id, 'decline');

    list.appendChild(div);
  });
}

async function respondInvite(sessionId, action) {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`${API_BASE}/live-sessions/respond-invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ sessionId, action })
    });
    const data = await res.json();
    if (res.ok) {
      if (typeof showToast === 'function') showToast(data.message, "success");
      loadPendingInvites();
      loadSchedule(); // Refresh upcoming list
    } else {
      alert(data.message);
    }
  } catch (err) {
    console.error("Respond error:", err);
  }
}

// --- Card Removal Handlers ---
window.removeTask = async (id) => {
  if (!confirm("Are you sure you want to remove this task?")) return;
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`${API_BASE}/tasks/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      if (typeof showToast === 'function') showToast("Task removed", "success");
      loadDashboard();
    }
  } catch (err) { console.error(err); }
};

window.removeSession = async (id) => {
  if (!confirm("Remove this session from your dashboard?")) return;
  const token = localStorage.getItem("token");
  try {
    // We'll use a specific 'cancel' or 'remove' endpoint if it exists, 
    // for now we'll assume a DELETE route will be added or use the general one.
    const res = await fetch(`${API_BASE}/live-sessions/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      if (typeof showToast === 'function') showToast("Session removed", "info");
      loadSchedule();
    } else {
      // If DELETE not allowed, maybe just hide it locally for this session
      console.warn("Session delete not supported yet, hiding locally");
      const card = document.querySelector(`.session-card [onclick*='${id}']`)?.closest('.session-card');
      if (card) card.remove();
    }
  } catch (err) { console.error(err); }
};

// Init
document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();
  loadSchedule();
  loadPendingInvites();
});

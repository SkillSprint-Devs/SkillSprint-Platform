// === DASHBOARD.JS ===
const API_BASE = window.API_BASE_URL;

// --- STATE MANAGEMENT ---
window.dashboardState = {
  tasks: [],
  sessions: [],
  reminders: [],
  notifications: [],
  user: null
};

// --- Card Removal Handlers (Refactored to be non-blocking where possible) ---
window.removeTask = async (id) => {
  if (!id || id === 'undefined') return;

  const confirmed = typeof showCustomConfirm === 'function'
    ? await showCustomConfirm("Are you sure you want to remove this task?")
    : confirm("Are you sure you want to remove this task?");

  if (confirmed) {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE}/tasks/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        if (typeof showToast === 'function') showToast("Task removed", "success");
        // Socket listener will handle DOM removal
      } else {
        const err = await res.json();
        if (typeof showToast === 'function') showToast(err.message || "Failed to remove task", "error");
      }
    } catch (err) { console.error("[DASHBOARD] Task removal error:", err); }
  }
};

window.clearAllNotifications = async () => {
  // Check if there are notifications to clear
  if (!window.dashboardState.notifications || window.dashboardState.notifications.length === 0) {
    if (typeof showToast === 'function') showToast("Your notifications are already clear!", "info");
    return;
  }

  const confirmed = typeof showCustomConfirm === 'function'
    ? await showCustomConfirm("Clear all notifications?", "")
    : confirm("Clear all notifications?");

  if (!confirmed) return;

  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`${API_BASE}/notifications`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      if (typeof showToast === 'function') showToast("Notifications cleared", "success");
      loadNotifications();
    }
  } catch (err) { console.error("Clear all failed:", err); }
};

window.removeSession = async (id) => {
  if (!id || id === 'undefined') return;

  const confirmed = typeof showCustomConfirm === 'function'
    ? await showCustomConfirm("Remove this session from your dashboard?")
    : confirm("Remove this session from your dashboard?");

  if (confirmed) {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE}/live-sessions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        if (typeof showToast === 'function') showToast("Session removed", "info");
        // Socket listener will handle refreshing schedule
        loadSchedule();
      } else {
        const err = await res.json();
        if (typeof showToast === 'function') showToast(err.message || "Failed to remove session", "error");
        if (res.status === 404) {
          const card = document.querySelector(`.session-card [onclick*='${id}']`)?.closest('.session-card');
          if (card) card.remove();
        }
      }
    } catch (err) { console.error("[DASHBOARD] Session removal error:", err); }
  }
};

// SIDEBAR TOGGLE
const sidebar = document.getElementById("sidebar");
const toggleBtn = document.getElementById("toggleSidebar");
const aiGuide = document.getElementById("aiGuide");

if (toggleBtn) {
  toggleBtn.innerHTML = '<i class="fa-solid fa-bolt"></i>';

  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');

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

// Holographic 3D Welcome Card Restoration
document.addEventListener('DOMContentLoaded', () => {
  const welcomeCard = document.querySelector('.welcome-card');
  const parallaxContent = welcomeCard?.querySelector('.welcome-parallax-content');
  const parallaxImg = welcomeCard?.querySelector('.welcome-card-img-group');

  if (welcomeCard) {
    let lastMouseX = 0, lastMouseY = 0, lastTime = Date.now();
    let glowIntensity = 1;

    welcomeCard.addEventListener('mousemove', (e) => {
      const rect = welcomeCard.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Calculate cursor speed for glow intensity
      const now = Date.now();
      const deltaT = Math.max(1, now - lastTime);
      const dist = Math.sqrt(Math.pow(x - lastMouseX, 2) + Math.pow(y - lastMouseY, 2));
      const velocity = dist / deltaT;
      glowIntensity = Math.min(2.5, Math.max(0.8, velocity * 1.5));

      // Calculate tilt angles
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = -(y - centerY) / (rect.height / 2) * 8; // Max 8deg
      const rotateY = (x - centerX) / (rect.width / 2) * 10; // Max 10deg

      // Map coords to percentage for CSS gradients
      const percX = (x / rect.width) * 100;
      const percY = (y / rect.height) * 100;

      welcomeCard.style.setProperty('--mouse-x', `${percX.toFixed(1)}%`);
      welcomeCard.style.setProperty('--mouse-y', `${percY.toFixed(1)}%`);
      welcomeCard.style.setProperty('--tilt-x', `${rotateX.toFixed(2)}deg`);
      welcomeCard.style.setProperty('--tilt-y', `${rotateY.toFixed(2)}deg`);
      welcomeCard.style.setProperty('--glow-intensity', glowIntensity.toFixed(2));

      // Inner elements parallax logic
      const moveX = (x - centerX) / (rect.width / 2) * 18;
      const moveY = (y - centerY) / (rect.height / 2) * 18;

      if (parallaxImg) {
        parallaxImg.style.transform = `translate3d(${-moveX}px, ${-moveY}px, 80px)`;
      }
      if (parallaxContent) {
        parallaxContent.style.transform = `translate3d(${moveX / 2}px, ${moveY / 2}px, 40px)`;
      }

      lastMouseX = x; lastMouseY = y; lastTime = now;
    });

    welcomeCard.addEventListener('mouseleave', () => {
      welcomeCard.style.setProperty('--tilt-x', `0deg`);
      welcomeCard.style.setProperty('--tilt-y', `0deg`);
      welcomeCard.style.setProperty('--glow-intensity', '1');
      if (parallaxImg) parallaxImg.style.transform = `translate3d(0,0,0)`;
      if (parallaxContent) parallaxContent.style.transform = `translate3d(0,0,0)`;
    });
  }
});
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

    // User Info - Use fresh data from API response
    const user = data.user || JSON.parse(localStorage.getItem("user") || "{}");
    ["username", "usernameTop"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = user.name || "Guest";
    });

    let profileImgUrl = user.profile_image || "assets/images/user-avatar.png";
    if (profileImgUrl && !profileImgUrl.startsWith("http") && !profileImgUrl.startsWith("assets")) {
      profileImgUrl = profileImgUrl.startsWith("/") ? profileImgUrl : `/${profileImgUrl}`;
    }
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
    window.dashboardState.tasks = data.tasks;
    renderTasks(data.tasks);
    if (document.getElementById("notifList")) loadNotifications();
    if (document.getElementById("reminderList")) loadReminders();

    // Trigger Onboarding if not completed
    if (data.user && !data.user.onboardingCompleted) {
      window.location.href = "onboarding.html";
      return;
    }

    // Load Best Match widget (only for onboarded users)
    loadBestMatches();


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
    window.dashboardState.notifications = notifications;
    renderNotifications(notifications);

    // Update red dot (badge)
    const hasUnread = notifications.some(n => !n.is_read);
    const badge = document.querySelector(".notif-badge");
    if (badge) {
      badge.style.display = hasUnread ? "block" : "none";
    }
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
  if (!dueTime) {
    if (typeof showToast === 'function') showToast("Please set a time for the reminder", "warning");
    return;
  }

  // Default to TODAY if no date picker exists.
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
  if (!window.dashboardState || !window.dashboardState.tasks) return;

  // Filter Tasks
  const filteredTasks = window.dashboardState.tasks.filter(t =>
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

// --- SOCKET SINGLETON ---
let dashboardSocket = null;
function setupSocket(token) {
  if (dashboardSocket) return; // Prevent duplicate connections

  const SOCKET_URL = window.API_SOCKET_URL || '';

  dashboardSocket = io(SOCKET_URL, {
    auth: { token },
    reconnection: true
  });

  dashboardSocket.on("connect", () => console.log("[DASHBOARD] Socket connected"));

  dashboardSocket.on("notification", (n) => {
    console.log("[DASHBOARD] Notification Received:", n);
    if (typeof showToast === 'function') showToast(n.message || "New Notification", "info");

    if (n.type === 'session_update') loadSchedule();
    if (n.type === 'match') {
      // Refresh the Best Match widget when a new match notification arrives
      loadBestMatches();
    }
    loadNotifications();
  });

  // Socket: match:new event
  dashboardSocket.on('match:new', ({ count }) => {
    if (typeof showToast === 'function') showToast(`We found ${count} great match${count !== 1 ? 'es' : ''} for you!`, 'success');
    loadBestMatches();
  });

  // Granular Task Events
  dashboardSocket.on("task_created", (task) => {
    console.log("[DASHBOARD] Task Created:", task._id);
    window.dashboardState.tasks.unshift(task);
    renderTasks(window.dashboardState.tasks);
  });

  dashboardSocket.on("task_updated", (task) => {
    console.log("[DASHBOARD] Task Updated:", task._id);
    const idx = window.dashboardState.tasks.findIndex(t => (t._id || t.id) === (task._id || task.id));
    if (idx !== -1) {
      window.dashboardState.tasks[idx] = task;
      renderTasks(window.dashboardState.tasks);
    }
  });

  dashboardSocket.on("task_deleted", ({ taskId }) => {
    console.log("[DASHBOARD] Task Deleted:", taskId);
    window.dashboardState.tasks = window.dashboardState.tasks.filter(t => (t._id || t.id) !== taskId);
    renderTasks(window.dashboardState.tasks);
  });

  // Granular Reminder Events
  dashboardSocket.on("reminder_created", (reminder) => {
    console.log("[DASHBOARD] Reminder Created:", reminder._id);
    loadReminders(); // Reminders are simpler to reload for now as they are small
  });

  dashboardSocket.on("reminder_updated", (reminder) => {
    console.log("[DASHBOARD] Reminder Updated:", reminder._id);
    const item = document.querySelector(`.reminder-item[data-reminder-id="${reminder._id}"]`);
    if (item) {
      const isDone = reminder.is_done;
      item.className = `reminder-item ${isDone ? 'completed' : ''}`;
      const checkbox = item.querySelector('.reminder-checkbox');
      if (checkbox) checkbox.className = `reminder-checkbox ${isDone ? 'checked' : ''}`;
    }
  });

  dashboardSocket.on("reminder_deleted", ({ reminderId }) => {
    console.log("[DASHBOARD] Reminder Deleted:", reminderId);
    const item = document.querySelector(`.reminder-item[data-reminder-id="${reminderId}"]`);
    if (item) item.remove();
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

    let btnText = 'Join';
    let btnDisabled = '';
    const sDate = new Date(s.scheduledDateTime);

    if (s.status === 'live') {
      btnText = '<span class="pulse"></span> Join Now';
    } else if (s.status === 'scheduled') {
      btnText = `Starts: ${sDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      // We keep it clickable if it's within 10 mins of start, but the join:live socket will block learners
      // However, to follow "Block Join Now unless status === live", I'll disable it for non-mentors or just follow the rule strictly.
      // Actually, let's just make it disabled if not live for simplicity.
      btnDisabled = 'disabled';
    } else if (s.status === 'ended') {
      btnText = 'Session Ended';
      btnDisabled = 'disabled';
    } else if (s.status === 'cancelled') {
      btnText = 'Cancelled';
      btnDisabled = 'disabled';
    }

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
                <button class="join-session-btn" onclick="location.href='livevideo.html?sessionId=${s._id}'" ${btnDisabled}>
                    ${btnText}
                </button>
            </div>
        `;
    list.appendChild(div);
  });
}

window.loadSchedule = loadSchedule;

// ═══════════════════════════════════════════════════════════════
// FIND YOUR BEST MATCH — Dashboard Widget
// ═══════════════════════════════════════════════════════════════
async function loadBestMatches({ forceRefresh = false } = {}) {
  const token = localStorage.getItem('token');
  const section = document.getElementById('bestMatchSection');
  const listEl = document.getElementById('matchUsersList');
  if (!section || !listEl) return;

  // Show section (only for onboarded users — API handles the check)
  section.style.display = '';

  // Load projects panel in parallel — doesn't depend on user suggestions
  loadProjectMatches();
  loadCourseMatches();

  // Skeleton while loading
  listEl.innerHTML = `
    <div class="skeleton skeleton-card" style="height:64px; border-radius:12px;"></div>
    <div class="skeleton skeleton-card" style="height:64px; border-radius:12px;"></div>
    <div class="skeleton skeleton-card" style="height:64px; border-radius:12px;"></div>`;

  try {
    // Invalidate cache first if user explicitly refreshed
    if (forceRefresh) {
      await fetch(`${API_BASE}/matchmaking/invalidate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    }

    const res = await fetch(`${API_BASE}/matchmaking/suggestions`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Match API error');

    const data = await res.json();
    const suggestions = data.suggestions || data || [];

    listEl.innerHTML = '';

    const tabs = document.querySelector('.match-tabs');
    const prefsBtn = document.getElementById('updatePreferencesBtn');

    if (data.coldStart) {
      listEl.innerHTML = `
        <div style="text-align:center; padding:2rem 1rem; background:var(--card-bg, rgba(255,255,255,0.03)); border:1px solid var(--border,rgba(255,255,255,0.08)); border-radius:12px; margin-bottom:1rem;">
          <i class="fa-solid fa-bullseye" style="font-size:2.5rem; color:var(--accent,#DCEF62); margin-bottom:1rem; display:block;"></i>
          <h4 style="margin-bottom:0.5rem; font-size:1.1rem;">Unlock Your Best Matches</h4>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:1.5rem;">Complete your profile to get personalized match suggestions</p>
          <button onclick="window.location.href='getstarted.html'" style="padding:10px 20px; background:var(--accent,#DCEF62); color:#1a1a1a; border:none; border-radius:8px; font-weight:600; cursor:pointer; font-size:0.9rem;">Complete Profile</button>
        </div>
      `;
      if (tabs) tabs.style.display = 'none';
      if (prefsBtn) prefsBtn.style.display = 'none';
    } else if (!suggestions.length) {
      listEl.innerHTML = `<div style="text-align:center; padding:1.5rem; color:var(--text-muted); font-size:0.85rem;">
        <i class="fa-solid fa-user-slash" style="font-size:1.8rem; margin-bottom:0.5rem; display:block; opacity:0.4;"></i>
        No matches found yet.<br>
        <span style="font-size:0.75rem;">Invite more teammates to join SkillSprint!</span>
      </div>`;
      if (tabs) tabs.style.display = 'none';
      if (prefsBtn) prefsBtn.style.display = 'flex';
      return;
    } else {
      if (tabs) tabs.style.display = 'flex';
      if (prefsBtn) prefsBtn.style.display = 'flex';
    }

    suggestions.slice(0, 5).forEach(u => {
      const score = u.score ?? 0;
      const reasons = (u.reasons || []).slice(0, 2);

      // Score ring colour
      let ringColor = '#ef5350';
      if (score >= 70) ringColor = '#4caf50';
      else if (score >= 40) ringColor = '#ff9800';

      const card = document.createElement('div');
      card.style.cssText = `
        display:flex; align-items:center; gap:12px;
        padding:12px 14px; border-radius:12px;
        background:var(--card-bg, rgba(255,255,255,0.04));
        border:1px solid var(--border, rgba(255,255,255,0.07));
        transition:transform .15s, box-shadow .15s;
        cursor:default;`;
      card.addEventListener('mouseenter', () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = '0 6px 24px rgba(0,0,0,.25)'; });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; card.style.boxShadow = ''; });

      // Avatar
      const avatar = document.createElement('img');
      avatar.src = u.profile_image || 'assets/images/user-avatar.png';
      avatar.style.cssText = 'width:40px; height:40px; border-radius:50%; object-fit:cover; flex-shrink:0; cursor:pointer;';
      avatar.onclick = () => window.location.href = `public-profile.html?user=${u._id}`;

      // Score ring
      const ring = document.createElement('div');
      ring.style.cssText = `
        width:40px; height:40px; border-radius:50%; flex-shrink:0;
        background: conic-gradient(${ringColor} ${score}%, rgba(255,255,255,0.05) ${score}%);
        display:flex; align-items:center; justify-content:center; position:relative;`;
      const innerRing = document.createElement('div');
      innerRing.style.cssText = `
        width:30px; height:30px; border-radius:50%;
        background:var(--sidebar-bg, #1a1a2e);
        display:flex; align-items:center; justify-content:center;
        font-size:0.6rem; font-weight:700; color:${ringColor};`;
      innerRing.textContent = `${score}%`;
      ring.appendChild(innerRing);

      // Info
      const info = document.createElement('div');
      info.style.cssText = 'flex:1; min-width:0;';
      info.innerHTML = `
        <div style="font-weight:600; font-size:0.85rem; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"
          onclick="window.location.href='public-profile.html?user=${u._id}'">${u.name || 'User'}</div>
        <div style="font-size:0.72rem; opacity:0.55; margin-bottom:3px;">${u.role || 'Member'}</div>
        <div style="display:flex; flex-wrap:wrap; gap:3px;">
          ${reasons.map(r => `<span style="font-size:0.62rem; background:#f0f0f0; color:#555; border-radius:20px; padding:1px 6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:130px;" title="${r}">${r}</span>`).join('')}
        </div>`;


      // Action buttons
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex; flex-direction:column; gap:5px; flex-shrink:0;';

      const viewBtn = document.createElement('button');
      viewBtn.style.cssText = 'font-size:0.72rem; padding:4px 10px; border-radius:6px; border:1px solid var(--border,rgba(255,255,255,.1)); background:transparent; color:var(--text-muted); cursor:pointer; transition:all .2s; white-space:nowrap;';
      viewBtn.textContent = 'View';
      viewBtn.onclick = () => window.location.href = `public-profile.html?user=${u._id}`;

      const followBtn = document.createElement('button');
      followBtn.style.cssText = 'font-size:0.72rem; padding:4px 10px; border-radius:6px; border:none; background:var(--accent,#DCEF62); color:#1a1a1a; font-weight:600; cursor:pointer; transition:all .2s; white-space:nowrap;';
      followBtn.textContent = 'Follow';
      followBtn.onclick = async () => {
        followBtn.disabled = true;
        followBtn.style.opacity = '0.6';
        try {
          const fr = await fetch(`${API_BASE}/posting/follow/${u._id}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (fr.ok) {
            followBtn.textContent = '✓ Following';
            followBtn.style.background = 'transparent';
            followBtn.style.border = '1px solid rgba(255,255,255,.2)';
            followBtn.style.color = 'var(--text-muted)';
            if (typeof showToast === 'function') showToast(`Following ${u.name}!`, 'success');
          }
        } catch (e) {
          followBtn.disabled = false;
          followBtn.style.opacity = '1';
        }
      };

      actions.appendChild(viewBtn);
      actions.appendChild(followBtn);

      card.appendChild(avatar);
      card.appendChild(ring);
      card.appendChild(info);
      card.appendChild(actions);
      listEl.appendChild(card);
    });

    if (!data.coldStart && suggestions.length > 0 && suggestions.length < 3) {
      const msg = document.createElement('div');
      msg.style.cssText = 'text-align:center; padding:1rem; color:var(--text-muted); font-size:0.8rem; margin-top:0.5rem;';
      msg.textContent = 'Use the platform more to improve your matches';
      listEl.appendChild(msg);
    }
  } catch (err) {
    console.error('[BestMatch] Load error:', err);
    if (listEl) listEl.innerHTML = `<div style="color:var(--danger);font-size:0.8rem;padding:0.5rem;">Could not load suggestions.</div>`;
  }
}

window.loadBestMatches = loadBestMatches;

// ── Project Matches ──────────────────────────────────────────────────────────
async function loadProjectMatches() {
  const token = localStorage.getItem('token');
  const panel = document.getElementById('matchTabProjects');
  if (!panel) return;

  // Skeleton while loading
  panel.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      <div class="skeleton skeleton-card" style="height:80px; border-radius:12px;"></div>
      <div class="skeleton skeleton-card" style="height:80px; border-radius:12px;"></div>
    </div>`;

  try {
    const res = await fetch(`${API_BASE}/matchmaking/projects`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Projects API error');
    const data = await res.json();
    renderProjectMatches(data.projects || []);
  } catch (err) {
    console.error('[BestMatch] Projects load error:', err);
    if (panel) panel.innerHTML = `<div style="color:var(--danger);font-size:0.8rem;padding:0.5rem;">Could not load project matches.</div>`;
  }
}

function renderProjectMatches(projects) {
  const panel = document.getElementById('matchTabProjects');
  if (!panel) return;

  panel.innerHTML = '';

  if (!projects.length) {
    panel.innerHTML = `
      <div style="text-align:center; padding:2rem 1rem; color:var(--text-muted); font-size:0.85rem;">
        <i class="fa-solid fa-folder-open" style="font-size:2rem; margin-bottom:0.5rem; display:block; opacity:0.4;"></i>
        No open projects matched your skills yet.<br>
        <span style="font-size:0.75rem;">Projects you collaborate on will appear here.</span>
      </div>`;
    return;
  }

  const listWrap = document.createElement('div');
  listWrap.style.cssText = 'display:flex; flex-direction:column; gap:10px;';

  projects.forEach(p => {
    const score = p.score ?? 0;
    const reasons = (p.reasons || []).slice(0, 2);
    const skills  = (p.requiredSkills || []).slice(0, 4);
    const desc    = p.description ? (p.description.length > 80 ? p.description.slice(0, 80) + '…' : p.description) : 'No description';

    // Score badge colour — matches user card logic
    let badgeColor = '#ef5350';
    if (score >= 70) badgeColor = '#4caf50';
    else if (score >= 40) badgeColor = '#ff9800';

    const card = document.createElement('div');
    card.style.cssText = `
      display:flex; flex-direction:column; gap:8px;
      padding:12px 14px; border-radius:12px;
      background:var(--card-bg, rgba(255,255,255,0.04));
      border:1px solid var(--border, rgba(255,255,255,0.07));
      transition:transform .15s, box-shadow .15s;`;
    card.addEventListener('mouseenter', () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = '0 6px 24px rgba(0,0,0,.25)'; });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; card.style.boxShadow = ''; });

    // Top row: title + score badge
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px;';
    topRow.innerHTML = `
      <div style="font-weight:600; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1;">
        <i class="fa-solid fa-folder-open" style="color:var(--accent,#DCEF62); margin-right:5px; font-size:0.75rem;"></i>
        ${p.title || 'Untitled Project'}
      </div>
      <span style="
        font-size:0.68rem; font-weight:700; padding:2px 8px; border-radius:20px; flex-shrink:0;
        background:${badgeColor}22; color:${badgeColor}; border:1px solid ${badgeColor}44;">
        ${score}% match
      </span>`;

    // Description
    const descEl = document.createElement('div');
    descEl.style.cssText = 'font-size:0.75rem; opacity:0.55; line-height:1.4;';
    descEl.textContent = desc;

    // Skill chips
    const chipsRow = document.createElement('div');
    chipsRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px;';
    skills.forEach(s => {
      const chip = document.createElement('span');
      chip.style.cssText = 'font-size:0.62rem; background:rgba(220,239,98,0.12); color:var(--accent,#DCEF62); border:1px solid rgba(220,239,98,0.25); border-radius:20px; padding:1px 7px; white-space:nowrap;';
      chip.textContent = s;
      chipsRow.appendChild(chip);
    });
    if (!skills.length && reasons.length) {
      reasons.forEach(r => {
        const chip = document.createElement('span');
        chip.style.cssText = 'font-size:0.62rem; background:#f0f0f0; color:#555; border-radius:20px; padding:1px 6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:130px;';
        chip.title = r;
        chip.textContent = r;
        chipsRow.appendChild(chip);
      });
    }

    // Bottom row: members count + View Project button
    const bottomRow = document.createElement('div');
    bottomRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between;';
    bottomRow.innerHTML = `
      <span style="font-size:0.72rem; opacity:0.45;">
        <i class="fa-solid fa-users" style="margin-right:3px;"></i>${p.memberCount || 0} member${p.memberCount !== 1 ? 's' : ''}
      </span>`;

    const viewBtn = document.createElement('button');
    viewBtn.style.cssText = 'font-size:0.72rem; padding:4px 10px; border-radius:6px; border:none; background:var(--accent,#DCEF62); color:#1a1a1a; font-weight:600; cursor:pointer; transition:all .2s; white-space:nowrap;';
    viewBtn.textContent = 'View Project';
    viewBtn.onclick = () => window.location.href = `board.html?id=${p._id}`;
    bottomRow.appendChild(viewBtn);

    card.appendChild(topRow);
    card.appendChild(descEl);
    if (chipsRow.children.length) card.appendChild(chipsRow);
    card.appendChild(bottomRow);
    listWrap.appendChild(card);
  });

  panel.appendChild(listWrap);
}

// ── Course Matches ──────────────────────────────────────────────────────────
async function loadCourseMatches() {
  const token = localStorage.getItem('token');
  const panel = document.getElementById('matchTabCourses');
  if (!panel) return;

  panel.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      <div class="skeleton skeleton-card" style="height:80px; border-radius:12px;"></div>
      <div class="skeleton skeleton-card" style="height:80px; border-radius:12px;"></div>
    </div>`;

  try {
    const res = await fetch(`${API_BASE}/matchmaking/courses`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Courses API error');
    const data = await res.json();
    renderCourseMatches(data.courses || []);
  } catch (err) {
    console.error('[BestMatch] Courses load error:', err);
    if (panel) panel.innerHTML = `<div style="color:var(--danger);font-size:0.8rem;padding:0.5rem;">Could not load course matches.</div>`;
  }
}

function renderCourseMatches(courses) {
  const panel = document.getElementById('matchTabCourses');
  if (!panel) return;

  panel.innerHTML = '';

  if (!courses.length) {
    panel.innerHTML = `
      <div style="text-align:center; padding:2rem 1rem; color:var(--text-muted); font-size:0.85rem;">
        <i class="fa-solid fa-graduation-cap" style="font-size:2rem; margin-bottom:0.5rem; display:block; opacity:0.4;"></i>
        No courses found matching your learning goals yet.<br>
        <span style="font-size:0.75rem;">Check back later as we add more courses.</span>
      </div>`;
    return;
  }

  const listWrap = document.createElement('div');
  listWrap.style.cssText = 'display:flex; flex-direction:column; gap:10px;';

  courses.forEach(c => {
    const score = c.score ?? 0;
    const reasons = (c.reasons || []).slice(0, 2);
    const tags  = (c.tags || []).slice(0, 4);
    const diff  = c.difficulty || 'Beginner';

    let badgeColor = '#ef5350';
    if (score >= 70) badgeColor = '#4caf50';
    else if (score >= 40) badgeColor = '#ff9800';
    
    let diffColor = '#4caf50';
    if (diff === 'Intermediate') diffColor = '#ff9800';
    if (diff === 'Advanced') diffColor = '#ef5350';

    const card = document.createElement('div');
    card.style.cssText = `
      display:flex; flex-direction:column; gap:8px;
      padding:12px 14px; border-radius:12px;
      background:var(--card-bg, rgba(255,255,255,0.04));
      border:1px solid var(--border, rgba(255,255,255,0.07));
      transition:transform .15s, box-shadow .15s;`;
    card.addEventListener('mouseenter', () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = '0 6px 24px rgba(0,0,0,.25)'; });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; card.style.boxShadow = ''; });

    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px;';
    topRow.innerHTML = `
      <div style="font-weight:600; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1;">
        <i class="fa-solid fa-graduation-cap" style="color:var(--accent,#DCEF62); margin-right:5px; font-size:0.75rem;"></i>
        ${c.title || 'Untitled Course'}
      </div>
      <span style="
        font-size:0.68rem; font-weight:700; padding:2px 8px; border-radius:20px; flex-shrink:0;
        background:${badgeColor}22; color:${badgeColor}; border:1px solid ${badgeColor}44;">
        ${score}% match
      </span>`;

    const diffBadge = document.createElement('div');
    diffBadge.style.cssText = 'font-size:0.75rem;';
    diffBadge.innerHTML = `<span style="border-radius: 4px; padding: 2px 6px; font-size: 0.65rem; font-weight: 600; background: ${diffColor}22; color: ${diffColor}; text-transform: uppercase;">${diff}</span>`;

    const chipsRow = document.createElement('div');
    chipsRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px; margin-top: 4px;';
    tags.forEach(s => {
      const chip = document.createElement('span');
      chip.style.cssText = 'font-size:0.62rem; background:rgba(220,239,98,0.12); color:var(--accent,#DCEF62); border:1px solid rgba(220,239,98,0.25); border-radius:20px; padding:1px 7px; white-space:nowrap;';
      chip.textContent = s;
      chipsRow.appendChild(chip);
    });
    if (!tags.length && reasons.length) {
      reasons.forEach(r => {
        const chip = document.createElement('span');
        chip.style.cssText = 'font-size:0.62rem; background:#f0f0f0; color:#555; border-radius:20px; padding:1px 6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:130px;';
        chip.title = r;
        chip.textContent = r;
        chipsRow.appendChild(chip);
      });
    }

    const bottomRow = document.createElement('div');
    bottomRow.style.cssText = 'display:flex; align-items:center; justify-content:flex-end; margin-top: 5px;';

    const viewBtn = document.createElement('button');
    viewBtn.style.cssText = 'font-size:0.72rem; padding:4px 10px; border-radius:6px; border:none; background:var(--accent,#DCEF62); color:#1a1a1a; font-weight:600; cursor:pointer; transition:all .2s; white-space:nowrap;';
    viewBtn.textContent = 'Start Course';
    viewBtn.onclick = () => { if(c.link) window.open(c.link, '_blank'); else window.location.href = '#'; };
    bottomRow.appendChild(viewBtn);

    card.appendChild(topRow);
    card.appendChild(diffBadge);
    if (chipsRow.children.length) card.appendChild(chipsRow);
    card.appendChild(bottomRow);
    listWrap.appendChild(card);
  });

  panel.appendChild(listWrap);
}

// ── Match Tab Switching ──
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.match-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // Reset all tabs
      document.querySelectorAll('.match-tab').forEach(t => {
        t.style.background = 'transparent';
        t.style.color = 'var(--text-muted)';
        t.style.border = '1px solid var(--border,rgba(255,255,255,.08))';
      });
      document.querySelectorAll('.match-tab-panel').forEach(p => p.style.display = 'none');

      // Activate clicked
      tab.style.background = 'var(--accent,#DCEF62)';
      tab.style.color = '#1a1a1a';
      tab.style.border = 'none';
      const panelId = `matchTab${tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)}`;
      const panel = document.getElementById(panelId);
      if (panel) panel.style.display = '';
    });
  });

  // Refresh button
  const refreshBtn = document.getElementById('refreshMatchBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('i');
      if (icon) icon.style.animation = 'spin 0.7s linear infinite';
      refreshBtn.disabled = true;
      await loadBestMatches({ forceRefresh: true });
      if (icon) icon.style.animation = '';
      refreshBtn.disabled = false;
    });
  }

  // ── Preferences Modal ──
  const prefsBtn = document.getElementById('updatePreferencesBtn');
  const prefsModal = document.getElementById('preferencesModal');
  const closePrefsModal = document.getElementById('closePreferencesModal');
  const prefsForm = document.getElementById('preferencesForm');

  if (prefsBtn && prefsModal) {
    prefsBtn.addEventListener('click', async () => {
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const { user } = await res.json();
          const pd = user?.matchmakingData || {};
          document.getElementById('prefTopSkills').value = (pd.topSkills || []).join(', ');
          document.getElementById('prefSkillsToLearn').value = (pd.skillsToLearn || []).join(', ');
          if (pd.weeklyHours) document.getElementById('prefWeeklyHours').value = pd.weeklyHours;
          if (pd.collabStyle) document.getElementById('prefCollabStyle').value = pd.collabStyle;
        }
      } catch (err) { console.error('Failed to load user info', err); }
      prefsModal.style.display = 'flex';
    });

    closePrefsModal?.addEventListener('click', () => { prefsModal.style.display = 'none'; });
    
    prefsModal.addEventListener('click', (e) => {
      if (e.target === prefsModal) prefsModal.style.display = 'none';
    });

    prefsForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('savePreferencesBtn');
      if (saveBtn) saveBtn.textContent = 'Saving...';
      
      const topSkills = document.getElementById('prefTopSkills').value.split(',').map(s=>s.trim()).filter(Boolean);
      const skillsToLearn = document.getElementById('prefSkillsToLearn').value.split(',').map(s=>s.trim()).filter(Boolean);
      const weeklyHours = document.getElementById('prefWeeklyHours').value;
      const collabStyle = document.getElementById('prefCollabStyle').value;

      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE}/matchmaking/preferences`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ matchmakingData: { topSkills, skillsToLearn, weeklyHours, collabStyle } })
        });
        if (res.ok) {
          if (typeof showToast === 'function') showToast("Preferences updated! Refreshing your matches...", "success");
          prefsModal.style.display = 'none';
          await loadBestMatches({ forceRefresh: true }); // ensure we invalidate client side or rely on backend busting cache
        } else {
          const err = await res.json();
          if (typeof showToast === 'function') showToast(err.message || 'Error saving preferences', 'error');
        }
      } catch (err) {
        console.error('Save preferences error', err);
      } finally {
        if (saveBtn) saveBtn.textContent = 'Save Preferences';
      }
    });
  }
});


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

// Init
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  if (token && window.io) setupSocket(token);

  // Only auto-load if on actual dashboard page (checks for a unique dashboard ID)
  if (document.getElementById("taskList") || document.getElementById("streakProgressBar")) {
    loadDashboard();
    loadSchedule();
    loadPendingInvites();
  }

  // Clear All Listener
  document.getElementById("clearAllNotifsBtn")?.addEventListener("click", window.clearAllNotifications);

  // Welcome Card Spotlight Effect
  const welcomeCard = document.querySelector('.welcome-card');
  if (welcomeCard) {
    welcomeCard.addEventListener('mousemove', (e) => {
      const rect = welcomeCard.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      welcomeCard.style.setProperty('--mouse-x', `${x}px`);
      welcomeCard.style.setProperty('--mouse-y', `${y}px`);
    });
  }
});

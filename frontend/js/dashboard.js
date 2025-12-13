// === DASHBOARD.JS ===

// SIDEBAR TOGGLE
const sidebar = document.getElementById("sidebar");
const toggleBtn = document.getElementById("toggleSidebar");
const aiGuide = document.getElementById("aiGuide");

// Set initial icon (expanded state)
if (toggleBtn) {
  toggleBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i>';

  toggleBtn.addEventListener("click", () => {
    const collapsed = sidebar.classList.toggle("collapsed");

    if (collapsed) {
      toggleBtn.textContent = "S";
      if (aiGuide)
        aiGuide.innerHTML =
          '<i class="fa-solid fa-robot" aria-hidden="true" style="font-size:1.25rem;"></i>';
    } else {
      toggleBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i>';
      if (aiGuide)
        aiGuide.innerHTML =
          '<p>Learn with your AI guide!</p><button type="button">Open Chat</button>';
    }
  });
}

// FETCH DASHBOARD DATA
async function loadDashboard() {
  const token = localStorage.getItem("token");
  if (!token) {
    alert("Session expired, please log in again.");
    window.location.href = "login.html";
    return;
  }

  try {
    const res = await fetch("http://127.0.0.1:5000/api/dashboard", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to load dashboard.");

    console.log("Dashboard data:", data);

    // Load user from localStorage as single source of truth for user info UI
    const user = JSON.parse(localStorage.getItem("user") || "{}");

    // Update user info UI elements
    ["username", "usernameTop"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = user.name || "User";
    });

    // Update profile avatar images 
    const profileImgUrl = user.profile_image || "assets/images/user-avatar.png";
    ["creatorAvatar", "creatorAvatarSmall", "profileAvatar"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.src = profileImgUrl;
    });

    // user profile fields present in the DOM
    if (document.getElementById("profileName")) document.getElementById("profileName").textContent = user.name || "";
    if (document.getElementById("profilePosition")) document.getElementById("profilePosition").textContent = user.role || "";
    if (document.getElementById("connectionsCount")) document.getElementById("connectionsCount").textContent = user.followers_count || 0;
    if (document.getElementById("followingCount")) document.getElementById("followingCount").textContent = user.following_count || 0;

    // wallet info from API response
    document.querySelector(".wallet-card:nth-child(1) div:nth-child(2)").textContent = `$${data.wallet?.remaining_time || "0"}`;
    document.querySelector(".wallet-card:nth-child(2) div:nth-child(2)").textContent = `$${data.wallet?.spent || 0}`;
    document.querySelector(".wallet-card:nth-child(3) div:nth-child(2)").textContent = `$${data.wallet?.earned || 0}`;

    // --- Notifications ---
    // Fetch all notifications from the dedicated endpoint
    await loadNotifications();

    // --- Real-time Notifications ---
    // Initialize Socket.IO
    // The token is already defined at the top of loadDashboard, but we need it here for the socket.
    // Re-declaring for clarity within this scope, or using the outer 'token' variable.
    // Using the outer 'token' variable is fine.
    if (token && window.io) {
      const socket = io("http://127.0.0.1:5000", {
        auth: { token },
        transports: ["websocket"]
      });

      socket.on("connect", () => {
        console.log("Dashboard socket connected:", socket.id);
      });

      // Listen for new notifications
      socket.on("notification", (notification) => {
        console.log("New notification received:", notification);

        // Play sound (optional, browser policy dependent)
        // const audio = new Audio('assets/sounds/notification.mp3');
        // audio.play().catch(e => console.log("Audio autoplay blocked"));

        // Prepend to list
        const notifList = document.getElementById("notifList");
        if (notifList) {
          // Remove empty state if present
          const empty = notifList.querySelector(".empty-state");
          if (empty) empty.remove();

          const div = document.createElement("div");
          div.className = "notif-item highlight-new"; // optional class for animation
          div.id = `notif-${notification._id}`;

          let iconClass = "fa-circle-info";
          if (notification.type === "chat") iconClass = "fa-comment";
          if (notification.type === "task") iconClass = "fa-list-check";
          if (notification.type === "invite") iconClass = "fa-user-plus";
          if (notification.type === "reminder") iconClass = "fa-clock";

          div.innerHTML = `
            <div class="notif-icon"><i class="fa-solid ${iconClass}"></i></div>
            <div class="notif-content">
              <h4>
                ${notification.title}
                 <button class="delete-notif-btn" onclick="deleteNotification('${notification._id}')" title="Delete">×</button>
              </h4>
              <p>${notification.message}</p>
              <span class="time">Just now</span>
            </div>
          `;

          notifList.prepend(div);

          // Update bell icon badge? (optional)
        }
      });

      socket.on("connect_error", (err) => {
        console.error("Socket connection error:", err.message);
      });
    }

    // --- Render Tasks ---
    const taskList = document.getElementById("taskList");
    const taskFilter = document.getElementById("taskFilter");

    if (taskList) {
      const renderTasks = (filter = "all") => {
        taskList.innerHTML = "";

        const filtered = data.tasks.filter(t => {
          if (filter === "all") return true;
          if (filter === "ongoing") return t.status === "in_progress" || t.status === "open";
          if (filter === "completed") return t.status === "completed";
          if (filter === "pending") return !t.status || t.status === "open";
        });

        // EMPTY STATE
        if (filtered.length === 0) {
          taskList.innerHTML = `
              <div class="empty-task">
                <img src="assets/images/empty.png" alt="empty" style="width:120px; opacity:0.8; margin-bottom:10px;">
                <h4>Wohoo! No upcoming tasks 🎉</h4>
                <p>Enjoy the free time or create a new task!</p>
              </div>
            `;
          return;
        }

        // TEMPLATE
        const template = document.getElementById("taskCardTemplate");

        filtered.forEach(t => {
          const card = template.content.cloneNode(true);

          // Title
          card.querySelector(".task-title").textContent = t.title;

          // Description
          card.querySelector(".task-description").textContent = t.description || "No description provided.";

          // Priority Color (Red, Yellow, Green)
          const dot = card.querySelector(".color-dot");
          let priorityColor = "#4caf50"; // default Low/Green
          if (t.priority === 'high') priorityColor = "#ef5350"; // Red
          if (t.priority === 'medium') priorityColor = "#ffb300"; // Yellow
          if (t.priority === 'low') priorityColor = "#4caf50"; // Green
          dot.style.background = priorityColor;
          // Also set title prompt/tooltip
          dot.title = `Priority: ${t.priority || 'low'}`;

          // Subtasks
          const subCount = t.subtasks ? t.subtasks.length : 0;
          card.querySelector(".subtasks-count").textContent = `${subCount} Sub-tasks`;

          // Footer
          const dateStr = t.dueDate ? new Date(t.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "No Date";
          card.querySelector(".task-due-date").textContent = `due ${dateStr}`;

          const progress = t.progress || 0;
          const badge = card.querySelector(".task-progress-badge");
          badge.textContent = `${progress}% completed`;
          // Badge color based on progress magnitude matching the reference image's pastel feel
          // or we can stick to priority color. The request said "Color of progress badge remains based on percentage scaling used in system."
          // Using a simple scaling for now:
          if (progress < 30) badge.style.backgroundColor = "#ffcdd2"; // light red
          else if (progress < 70) badge.style.backgroundColor = "#fff9c4"; // light yellow
          else badge.style.backgroundColor = "#c8e6c9"; // light green

          taskList.appendChild(card);
        });
      };

      // First load
      renderTasks();

      // Filter dropdown
      if (taskFilter) {
        taskFilter.addEventListener("change", (e) => renderTasks(e.target.value));
      }
    }
  } catch (err) {
    console.error("Dashboard load error:", err);
    alert("Error loading dashboard data: " + err.message);
  }
}


async function loadNotifications() {
  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    const res = await fetch("http://127.0.0.1:5000/api/notifications", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const notifications = await res.json();
    renderNotifications(notifications);
  } catch (err) {
    console.error("Failed to load notifications:", err);
  }
}

function renderNotifications(notifications) {
  const notifList = document.getElementById("notifList");
  if (!notifList) return;

  notifList.innerHTML = "";

  if (!notifications || notifications.length === 0) {
    notifList.innerHTML = `<p class="empty-state">You don’t have any notifications yet.</p>`;
    return;
  }

  notifications.forEach(n => {
    const div = document.createElement("div");
    div.className = "notif-item";
    div.id = `notif-${n._id}`;

    // Icon based on type (optional enhancement)
    let iconClass = "fa-circle-info";
    if (n.type === "chat") iconClass = "fa-comment";
    if (n.type === "task") iconClass = "fa-list-check";
    if (n.type === "invite") iconClass = "fa-user-plus";
    if (n.type === "reminder") iconClass = "fa-clock";

    div.innerHTML = `
      <div class="notif-icon"><i class="fa-solid ${iconClass}"></i></div>
      <div class="notif-content">
        <h4>
          ${n.title || "Notification"}
          <button class="delete-notif-btn" onclick="deleteNotification('${n._id}')" title="Delete">×</button>
        </h4>
        <p>${n.message || ""}</p>
        <span class="time">${new Date(n.created_at).toLocaleString()}</span>
      </div>
    `;
    notifList.appendChild(div);
  });
}

window.deleteNotification = async (id) => {
  const token = localStorage.getItem("token");
  const el = document.getElementById(`notif-${id}`);

  // Optimistic removal
  if (el) el.remove();

  try {
    await fetch(`http://127.0.0.1:5000/api/notifications/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    // check if empty
    const notifList = document.getElementById("notifList");
    if (notifList && notifList.children.length === 0) {
      notifList.innerHTML = `<p class="empty-state">You don’t have any notifications yet.</p>`;
    }

  } catch (err) {
    console.error("Error deleting notification:", err);
    // revert or toast?
  }
};




// Initialize on page load
document.addEventListener("DOMContentLoaded", loadDashboard);


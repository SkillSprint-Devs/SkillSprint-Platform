document.addEventListener("DOMContentLoaded", async () => {

  window.alert = msg => showToast(msg, "info");

  const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
    ? 'http://localhost:5000/api'
    : '/api';

  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  // --- State ---
  let currentUser = {};
  let projects = []; // Manual projects
  let dynamicProjects = []; // Boards+PairSessions
  let education = [];
  let skills = [];

  // --- Modal Helpers ---
  function openModal(id) {
    document.getElementById(id).classList.add('active');
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove('active');
  }

  // --- Dynamic Fetching ---
  async function fetchDynamicContent() {
    try {
      // Fetch concurrently but handle individually to be resilient
      const [boardsRes, pairsRes, achRes] = await Promise.allSettled([
        fetch(`${API_BASE}/board/all`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/pair-programming/all`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE.replace('/api', '')}/api/certificates/achievements`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      let boards = [];
      if (boardsRes.status === 'fulfilled' && boardsRes.value.ok) {
        const boardsData = await boardsRes.value.json();
        boards = Array.isArray(boardsData.data) ? boardsData.data : (Array.isArray(boardsData) ? boardsData : []);
      }

      let pairs = [];
      if (pairsRes.status === 'fulfilled' && pairsRes.value.ok) {
        pairs = await pairsRes.value.json();
      }

      let achievements = [];
      if (achRes.status === 'fulfilled' && achRes.value.ok) {
        const achData = await achRes.value.json();
        achievements = achData.achievements || [];
      }

      dynamicProjects = [
        ...boards.map(b => ({
          id: b._id,
          title: b.name,
          description: "Smartboard Session",
          tech_stack: ["Whiteboard", "Collaboration"],
          link: `board.html?id=${b._id}`,
          isDynamic: true,
          type: 'Board'
        })),
        ...pairs.map(p => ({
          id: p._id,
          title: p.agenda || "Pair Programming",
          description: `Session with ${p.mentor?.name || 'Mentor'}`,
          tech_stack: p.tags || ["Pair Programming"],
          link: `pair-programming.html?id=${p._id}`,
          isDynamic: true,
          type: 'Pair'
        }))
      ];

      renderAchievements(achievements);
      // If UI was already rendered, we might need to refresh project count
      const projCountEl = document.getElementById("projectsCount");
      if (projCountEl) projCountEl.textContent = projects.length + dynamicProjects.length;
      renderProjects(); // Refresh list to include dynamic ones
    } catch (err) {
      console.error("Failed to fetch dynamic content", err);
      renderAchievements([]); // Clear loading state
    }
  }

  function renderAchievements(achievements) {
    const container = document.getElementById("achievementsList");
    if (!container) return;

    if (achievements.length === 0) {
      container.innerHTML = `<span style="color:var(--text-muted);">No achievements yet.</span>`;
      return;
    }

    container.innerHTML = achievements.map(ach => `
        <div class="achievement-mini-card" style="background:#fff; border:1px solid #eee; padding:1rem; border-radius:12px; display:flex; align-items:center; gap:1rem; flex:1; min-width:200px;">
           <i class="fa-solid ${ach.type === 'certificate' ? 'fa-certificate' : 'fa-award'}" style="font-size:1.5rem; color:var(--user-accent);"></i>
           <div>
              <div style="font-weight:700; font-size:0.9rem;">${ach.title}</div>
              <div style="font-size:0.75rem; color:var(--text-muted);">${ach.courseName}</div>
           </div>
        </div>
    `).join("");
  }

  // --- UI Rendering ---
  function updateUI(user) {
    currentUser = user;
    skills = (user.skills || []).filter(s => s && s !== '[]');
    projects = user.projects || []; // Manual Only
    education = user.education || [];

    // Identity
    document.getElementById("profileName").textContent = user.name || "User";
    document.getElementById("profileRole").textContent = (user.role || "Student").toUpperCase();
    const designationEl = document.getElementById("profileDesignation");
    if (designationEl) designationEl.textContent = user.designation || "No designation";

    const locationEl = document.getElementById("profileLocation");
    if (locationEl) locationEl.innerHTML = `<i class="fa-solid fa-location-dot"></i> <span>${user.location || "Not specified"}</span>`;

    const bioEl = document.getElementById("profileBio");
    if (bioEl) bioEl.textContent = user.bio || "No bio yet.";

    // Goal
    const goalDisplay = document.getElementById("goalDisplay");
    if (goalDisplay) goalDisplay.textContent = user.primary_goal || "Set your goal...";
    const goalInput = document.getElementById("goalInput");
    if (goalInput) goalInput.value = user.primary_goal || "";

    // Preferences
    const prefs = user.learning_preferences || {};
    if (prefs.style) {
      const radio = document.querySelector(`input[name="learning_style"][value="${prefs.style}"]`);
      if (radio) radio.checked = true;
    }
    if (prefs.depth) {
      const radio = document.querySelector(`input[name="explanation_depth"][value="${prefs.depth}"]`);
      if (radio) radio.checked = true;
    }

    const imgEl = document.getElementById("profileImage");
    if (imgEl) {
      const fallback = "assets/images/user-avatar.png";
      const rawImg = user.profile_image || "";
      if (!rawImg) {
        imgEl.src = fallback;
      } else if (rawImg.startsWith("http")) {
        imgEl.src = rawImg;
      } else {
        // Ensure single leading slash
        const cleanPath = rawImg.startsWith("/") ? rawImg : `/${rawImg}`;
        imgEl.src = cleanPath;
      }

      imgEl.onerror = () => { imgEl.src = fallback; };
    }

    // Unified setLink logic
    const setLink = (id, url, name) => {
      const el = document.getElementById(id);
      if (!el) return;

      let cleanUrl = (url || "").toString().trim();

      // If empty, show as "Add" placeholder
      if (!cleanUrl || cleanUrl === 'null' || cleanUrl === 'undefined') {
        el.style.display = 'flex';
        el.style.opacity = '0.4';
        el.href = 'javascript:void(0)';
        el.title = `Add ${name}`;
        el.onclick = (e) => {
          e.preventDefault();
          document.getElementById('editIdentityBtn').click();
        };
        return;
      }

      // Add https if missing but not for local paths
      if (!/^https?:\/\//i.test(cleanUrl) && !cleanUrl.startsWith('/') && !cleanUrl.startsWith('data:')) {
        cleanUrl = `https://${cleanUrl}`;
      }

      el.style.display = 'flex';
      el.style.opacity = '1';
      el.href = cleanUrl;
      el.title = name;
      el.onclick = null; // Remove placeholder click handler
    };

    setLink("githubLink", user.github, "GitHub");
    setLink("linkedinLink", user.linkedin, "LinkedIn");
    setLink("portfolioLink", user.portfolio, "Portfolio");

    // Stats
    const streakEl = document.getElementById("streakCount");
    if (streakEl) streakEl.textContent = user.streakCount || 0;

    const projCountEl = document.getElementById("projectsCount");
    if (projCountEl) projCountEl.textContent = projects.length + dynamicProjects.length;

    renderSkills();
    renderProjects();
    renderEducation();
  }

  function renderSkills() {
    const container = document.getElementById("skillsContainer");
    if (!container) return;

    if (skills.length === 0) {
      container.innerHTML = `<span style="color:var(--text-muted);">No skills added.</span>`;
      return;
    }

    container.innerHTML = skills.map((skill, index) => `
        <span class="skill-tag">
            ${skill}
            <i class="fa-solid fa-xmark remove-skill-btn" data-index="${index}" style="font-size:0.8rem; margin-left:4px;"></i>
        </span>
    `).join("");

    // Bind remove events
    document.querySelectorAll('.remove-skill-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.target.dataset.index);
        skills.splice(idx, 1);
        await saveField('skills', skills);
      });
    });
  }

  function renderProjects() {
    const container = document.getElementById("projectsList");
    if (!container) return;

    // Merge Manual + Dynamic
    const allProjects = [...projects, ...dynamicProjects];

    if (allProjects.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:1.5rem; color:var(--text-muted);">No projects yet.</div>`;
      return;
    }

    container.innerHTML = allProjects.map((p, index) => {
      // Need to know real index for manual projects to edit/delete
      // If it's dynamic, verified by isDynamic flag
      const isManual = !p.isDynamic;
      // Find index in 'projects' array if manual
      const manualIndex = isManual ? projects.indexOf(p) : -1;

      return `
        <div class="list-card-item ${p.isDynamic ? 'auto-generated' : ''}">
            <div style="flex:1;">
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
                    <h4 style="margin:0; font-size:1.1rem; font-weight:700;">${p.title}</h4>
                    ${p.isDynamic
          ? `<span style="font-size:0.65rem; background:#e0f2fe; color:#0284c7; padding:2px 6px; border-radius:4px; font-weight:600;">AUTO</span>`
          : ''}
                    ${p.link ? `<a href="${p.link}" target="_blank" style="color:var(--text-muted); font-size:0.9rem;"><i class="fa-solid fa-external-link-alt"></i></a>` : ''}
                </div>
                <p style="margin:0.25rem 0; color:#4b5563; font-size:0.95rem;">${p.description || "No description"}</p>
                <div style="font-size:0.8rem; color:#6b7280; font-weight:500;">
                    ${(p.tech_stack || []).join(" • ")}
                </div>
            </div>
            ${isManual ? `
            <div class="action-btn-group">
                <button class="action-btn edit-project-btn" data-index="${manualIndex}"><i class="fa-solid fa-pen"></i></button>
                <button class="action-btn delete-project-btn" data-index="${manualIndex}"><i class="fa-solid fa-trash"></i></button>
            </div>
            ` : ''}
        </div>
        `;
    }).join("");

    // Bind Edit/Delete
    document.querySelectorAll('.delete-project-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (await showConfirm("Delete Project?", "Are you sure you want to delete this project? This action cannot be undone.", "Delete", true)) {
          const idx = parseInt(btn.closest('.action-btn').dataset.index);
          projects.splice(idx, 1);
          await saveField("projects", projects);
        }
      });
    });

    document.querySelectorAll('.edit-project-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.closest('.action-btn').dataset.index);
        const p = projects[idx];
        // Populate Modal
        const form = document.getElementById("projectForm");
        form.index.value = idx;
        form.title.value = p.title;
        form.description.value = p.description;
        form.tech_stack.value = (p.tech_stack || []).join(", ");
        form.link.value = p.link || "";

        document.getElementById("projectModalTitle").textContent = "Edit Project";
        openModal("projectModal");
      });
    });
  }

  function renderEducation() {
    const container = document.getElementById("educationList");
    if (!container) return;

    if (education.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:1.5rem; color:var(--text-muted);">No education added.</div>`;
      return;
    }

    container.innerHTML = education.map((edu, index) => `
        <div class="list-card-item">
            <div style="flex:1;">
                <h4 style="margin:0; font-size:1.1rem; font-weight:700;">${edu.degree}</h4>
                <p style="margin:0.25rem 0; font-size:0.95rem; font-weight:500;">${edu.institution}</p>
                <p style="margin:0; font-size:0.85rem; color:var(--text-muted);">${edu.year || ""} • ${edu.grade || ""}</p>
            </div>
            <div class="action-btn-group">
                <button class="action-btn edit-edu-btn" data-index="${index}"><i class="fa-solid fa-pen"></i></button>
                <button class="action-btn delete-edu-btn" data-index="${index}"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `).join("");

    // Bind Edit/Delete
    document.querySelectorAll('.delete-edu-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (await showConfirm("Delete Entry?", "Are you sure you want to remove this education entry?", "Delete", true)) {
          const idx = parseInt(btn.closest('.action-btn').dataset.index);
          education.splice(idx, 1);
          await saveField("education", education);
        }
      });
    });

    document.querySelectorAll('.edit-edu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.closest('.action-btn').dataset.index);
        const edu = education[idx];
        const form = document.getElementById("eduForm");
        form.index.value = idx;
        form.degree.value = edu.degree;
        form.institution.value = edu.institution;
        form.year.value = edu.year || "";
        form.grade.value = edu.grade || "";

        document.getElementById("eduModalTitle").textContent = "Edit Education";
        openModal("eduModal");
      });
    });
  }


  // --- CRUD API ---
  async function saveField(field, value, refreshWholeUser = false) {
    try {
      const fd = new FormData();
      // Handle file or JSON
      if (value instanceof File) {
        fd.append(field, value);
      } else {
        fd.append(field, typeof value === 'object' ? JSON.stringify(value) : value);
      }

      const res = await fetch(`${API_BASE}/auth/update-profile`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Saved!", "success");
        if (refreshWholeUser) {
          updateUI(data.user);
        } else {
          currentUser = data.user;
          // Only re-render relevant part
          if (field === 'projects') renderProjects();
          if (field === 'education') renderEducation();
          if (field === 'skills') renderSkills();
          if (field === 'profile_image') updateUI(data.user);
        }

        // Global Sync
        if (window.updateGlobalUserUI) window.updateGlobalUserUI(data.user);
        else localStorage.setItem("user", JSON.stringify(data.user));

      } else {
        alert(data.message || "Failed to save");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving");
    }
  }


  // --- Event Listeners ---

  // Goal Editing
  const goalDisplay = document.getElementById("goalDisplay");
  const goalEditArea = document.getElementById("goalEditArea");
  const saveGoalBtn = document.getElementById("saveGoalBtn");
  const cancelGoalBtn = document.getElementById("cancelGoalBtn");
  const goalInput = document.getElementById("goalInput");

  if (goalDisplay && goalEditArea) {
    goalDisplay.onclick = () => {
      goalDisplay.style.display = 'none';
      goalEditArea.style.display = 'block';
      goalInput.focus();
    };

    cancelGoalBtn.onclick = () => {
      goalDisplay.style.display = 'block';
      goalEditArea.style.display = 'none';
      goalInput.value = currentUser.primary_goal || "";
    };

    saveGoalBtn.onclick = async () => {
      const newVal = goalInput.value.trim();
      if (newVal) {
        await saveField('primary_goal', newVal);
        currentUser.primary_goal = newVal; // Update local state for immediate sync
        goalDisplay.textContent = newVal;
      }
      goalDisplay.style.display = 'block';
      goalEditArea.style.display = 'none';
    };
  }

  // Preferences Sync
  document.querySelectorAll('input[name="learning_style"], input[name="explanation_depth"]').forEach(radio => {
    radio.onchange = async () => {
      const style = document.querySelector('input[name="learning_style"]:checked')?.value;
      const depth = document.querySelector('input[name="explanation_depth"]:checked')?.value;

      const prefs = { style, depth };
      await saveField('learning_preferences', prefs);
    };
  });

  // Avatar Upload
  const uploadBtn = document.getElementById("uploadAvatarBtn");
  const avatarInput = document.getElementById("avatarInput");
  if (uploadBtn && avatarInput) {
    uploadBtn.onclick = () => avatarInput.click();
    avatarInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        await saveField('profile_image', file, true);
      }
    };
  }

  // Logout
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      if (await showConfirm("Logout", "Are you sure you want to logout from SkillSprint?", "Logout")) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "login.html";
      }
    };
  }

  // Identity Modal
  document.getElementById("editIdentityBtn").addEventListener("click", () => {
    // Prefill
    const form = document.getElementById("identityForm");
    form.name.value = currentUser.name || "";
    form.designation.value = currentUser.designation || "";
    form.location.value = currentUser.location || "";
    form.bio.value = currentUser.bio || "";
    form.github.value = (currentUser.github && currentUser.github !== 'null') ? currentUser.github : "";
    form.linkedin.value = (currentUser.linkedin && currentUser.linkedin !== 'null') ? currentUser.linkedin : "";
    form.portfolio.value = (currentUser.portfolio && currentUser.portfolio !== 'null') ? currentUser.portfolio : "";

    if (currentUser.privacy) {
      form.showSkills.checked = currentUser.privacy.showSkills !== false;
      form.showStreaks.checked = currentUser.privacy.showStreaks !== false;
    } else {
      form.showSkills.checked = true;
      form.showStreaks.checked = true;
    }

    openModal("identityModal");
  });

  // Privacy settings button removed from HTML
  const privacyBtn = document.getElementById("togglePrivacySettings");
  if (privacyBtn) {
    privacyBtn.addEventListener("click", () => {
      document.getElementById("editIdentityBtn").click();
    });
  }

  document.getElementById("identityForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    // Construct Privacy Obj
    const privacy = {
      showSkills: fd.get("showSkills") === "on",
      showStreaks: fd.get("showStreaks") === "on",
    };

    // We can't use saveField for multiple fields easily unless we pass FormData directly
    // Let's do a custom fetch here
    const updateFd = new FormData();
    updateFd.append("name", fd.get("name"));
    updateFd.append("designation", fd.get("designation"));
    updateFd.append("location", fd.get("location"));
    updateFd.append("bio", fd.get("bio"));
    updateFd.append("github", fd.get("github"));
    updateFd.append("linkedin", fd.get("linkedin"));
    updateFd.append("portfolio", fd.get("portfolio"));
    updateFd.append("privacy", JSON.stringify(privacy));

    try {
      const res = await fetch(`${API_BASE}/auth/update-profile`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: updateFd
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Profile Updated", "success");
        updateUI(data.user);
        closeModal("identityModal");
        if (window.updateGlobalUserUI) window.updateGlobalUserUI(data.user);
      }
    } catch (err) { console.error(err); }
  });


  // Skills Input
  document.getElementById("addSkillBtn").addEventListener("click", () => {
    const val = document.getElementById("newSkillInput").value.trim();
    if (val && val !== '[]') {
      skills.push(val);
      // Filter just in case malformed data exists
      skills = skills.filter(s => s && s !== '[]');
      saveField("skills", skills);
      document.getElementById("newSkillInput").value = "";
    }
  });
  document.getElementById("newSkillInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      document.getElementById("addSkillBtn").click();
    }
  });


  // Project Modal
  document.getElementById("addProjectModalBtn").addEventListener("click", () => {
    document.getElementById("projectForm").reset();
    document.getElementById("projectForm").index.value = "-1";
    document.getElementById("projectModalTitle").textContent = "Add Project";
    openModal("projectModal");
  });

  document.getElementById("projectForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const newProj = {
      title: fd.get("title"),
      description: fd.get("description"),
      tech_stack: fd.get("tech_stack").split(",").map(s => s.trim()).filter(Boolean),
      link: fd.get("link")
    };

    const idx = parseInt(fd.get("index"));
    if (idx >= 0) {
      projects[idx] = newProj;
    } else {
      projects.push(newProj);
    }

    await saveField("projects", projects);
    closeModal("projectModal");
  });


  // Education Modal
  document.getElementById("addEduModalBtn").addEventListener("click", () => {
    document.getElementById("eduForm").reset();
    document.getElementById("eduForm").index.value = "-1";
    document.getElementById("eduModalTitle").textContent = "Add Education";
    openModal("eduModal");
  });

  document.getElementById("eduForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);

    const newEdu = {
      degree: fd.get("degree"),
      institution: fd.get("institution"),
      year: fd.get("year"),
      grade: fd.get("grade")
    };

    const idx = parseInt(fd.get("index"), 10);
    if (idx >= 0) {
      education[idx] = newEdu;
    } else {
      education.push(newEdu);
    }

    await saveField("education", education);
    closeModal("eduModal");
  });


  // --- Navbar Init ---
  if (window.initNavbar) {
    window.initNavbar({
      activePage: 'Profile',
      contextIcon: 'fa-user',
      backUrl: 'dashboard.html',
      showSearch: false,
      primaryAction: {
        show: true,
        label: 'Edit Profile',
        icon: 'fa-pen',
        onClick: () => {
          document.getElementById('editIdentityBtn').click();
        }
      }
    });
  }

  // --- Initialization ---
  async function loadProfile() {
    await fetchDynamicContent();
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        updateUI(data);
      }
    } catch (err) { console.error(err); }
  }

  loadProfile();
});

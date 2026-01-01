document.addEventListener("DOMContentLoaded", async () => {

  window.alert = msg => showToast(msg, "info");

  const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
    ? 'http://localhost:5000/api'
    : '/api';

  const token = localStorage.getItem("token");
  if (!token) {
    alert("Please login first!");
    window.location.href = "login.html";
    return;
  }

  // Nav buttons
  document.getElementById("backBtn")?.addEventListener("click", () => {
    window.location.href = "dashboard.html";
  });
  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("token");
    alert("Logged out successfully!");
    window.location.href = "login.html";
  });

  // UI references
  const editBtn = document.getElementById("editProfileBtn");
  const editSection = document.getElementById("editProfileSection");
  const form = document.getElementById("editProfileForm");

  const profileProjectsContainer = document.getElementById("profileProjects");
  const profileEducationContainer = document.getElementById("profileEducation");
  const profileAchievementsContainer = document.getElementById("profileAchievements");

  // State arrays
  let projects = [];
  let education = [];
  let achievements = [];


  function togglePanel(btn, panel) {
    const isHidden = panel.classList.toggle("hidden");
    btn.setAttribute("aria-expanded", !isHidden);
    panel.setAttribute("aria-hidden", isHidden);
  }

  // Update profile UI and sync data
  function updateProfileUI(user) {
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value || "";
    };
    const setInputValue = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value || "";
    };

    setText("profileName", user.name);
    setText("profileEmail", user.email);
    setText("profileRole", user.role);
    setText("profileDesignation", user.designation || "—");
    setText("profileLocation", user.location || "Not specified");
    setText("profileBio", user.bio || "—");

    const profileImageEl = document.getElementById("profileImage");
    if (profileImageEl) {
      profileImageEl.src = user.profile_image
        ? user.profile_image.startsWith("http")
          ? user.profile_image
          : `/${user.profile_image}`
        : "assets/images/user-avatar.png";
    }

    // Skills
    const skillsContainer = document.getElementById("profileSkills");
    if (skillsContainer) {
      skillsContainer.innerHTML = "";
      (user.skills || []).forEach(skill => {
        const tag = document.createElement("span");
        tag.className = "skill-tag";
        tag.textContent = skill;
        skillsContainer.appendChild(tag);
      });
    }

    projects = user.projects || [];
    education = user.education || [];
    achievements = user.achievements || [];

    renderProjects();
    renderEducation();
    renderAchievements();

    // Social links
    const setHref = (id, url) => {
      const el = document.getElementById(id);
      if (el) el.href = url || "#";
    };
    setHref("githubLink", user.github);
    setHref("linkedinLink", user.linkedin);
    setHref("portfolioLink", user.portfolio);

    // Prefill form inputs
    setInputValue("editName", user.name);
    setInputValue("editRole", user.role || "student");
    setInputValue("editLocation", user.location);
    setInputValue("editDesignation", user.designation);
    setInputValue("editBio", user.bio);
    setInputValue("editSkills", (user.skills || []).join(", "));
    setInputValue("editGithub", user.github);
    setInputValue("editLinkedin", user.linkedin);
    setInputValue("editPortfolio", user.portfolio);
  }

  // Render Projects
  function renderProjects() {
    if (!profileProjectsContainer) return;
    profileProjectsContainer.innerHTML = "";

    projects.forEach((p, idx) => {
      const card = document.createElement("div");
      card.className = "project-card";

      card.innerHTML = `
        <div class="project-controls">
          <button class="btn-edit-project" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-delete-project" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="project-view">
          <h4>${p.title}</h4>
          <p>${p.description || ""}</p>
          <small>${(p.tech_stack || []).join(", ")}</small><br/>
          ${p.link ? `<a href="${p.link}" target="_blank" rel="noopener">View Project</a>` : ""}
        </div>
        <form class="project-edit-form hidden">
          <input type="text" name="editTitle" value="${p.title}" required />
          <textarea name="editDescription">${p.description || ""}</textarea>
          <input type="text" name="editTechStack" value="${(p.tech_stack || []).join(", ")}" />
          <input type="url" name="editLink" value="${p.link || ""}" />
          <div class="form-actions">
            <button type="submit" class="btn-primary">Save</button>
            <button type="button" class="btn-cancel-edit">Cancel</button>
          </div>
        </form>
      `;

      profileProjectsContainer.appendChild(card);

      const view = card.querySelector(".project-view");
      const edit = card.querySelector(".project-edit-form");
      const btnEdit = card.querySelector(".btn-edit-project");
      const btnDelete = card.querySelector(".btn-delete-project");
      const btnCancel = card.querySelector(".btn-cancel-edit");

      btnEdit.addEventListener("click", () => {
        view.classList.add("hidden");
        edit.classList.remove("hidden");
      });
      btnCancel.addEventListener("click", () => {
        edit.classList.add("hidden");
        view.classList.remove("hidden");
      });

      edit.addEventListener("submit", async e => {
        e.preventDefault();
        const fd = new FormData(edit);
        projects[idx] = {
          title: fd.get("editTitle").trim(),
          description: fd.get("editDescription").trim(),
          tech_stack: fd.get("editTechStack").split(",").map(s => s.trim()).filter(Boolean),
          link: fd.get("editLink").trim() || null,
        };
        const updatedUser = await saveListToBackend("projects", projects);
        if (updatedUser) {
          projects = updatedUser.projects || [];
          education = updatedUser.education || [];
          achievements = updatedUser.achievements || [];
          renderProjects();
        }
      });

      btnDelete.addEventListener("click", async () => {
        const confirmed = await showConfirm(`Delete project "${p.title}"?`);
        if (confirmed) {
          projects.splice(idx, 1);
          const updatedUser = await saveListToBackend("projects", projects);
          if (updatedUser) {
            projects = updatedUser.projects || [];
            education = updatedUser.education || [];
            achievements = updatedUser.achievements || [];
            renderProjects();
          }
        }
      });
    });
  }

  // Render Education
  function renderEducation() {
    if (!profileEducationContainer) return;
    profileEducationContainer.innerHTML = "";

    education.forEach((edu, idx) => {
      const card = document.createElement("div");
      card.className = "education-card";

      card.innerHTML = `
        <div class="education-controls">
          <button class="btn-edit-education" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-delete-education" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="education-view">
          <strong>${edu.degree}</strong><br/>
          <span>${edu.institution}</span><br/>
          <small>${edu.year || "N/A"} • Grade: ${edu.grade || "N/A"}</small>
        </div>
        <form class="education-edit-form hidden">
          <input type="text" name="editDegree" value="${edu.degree}" required />
          <input type="text" name="editInstitution" value="${edu.institution}" required />
          <input type="text" name="editYear" value="${edu.year || ""}" />
          <input type="text" name="editGrade" value="${edu.grade || ""}" />
          <div class="form-actions">
            <button type="submit" class="btn-primary">Save</button>
            <button type="button" class="btn-cancel-education">Cancel</button>
          </div>
        </form>
      `;

      profileEducationContainer.appendChild(card);

      const view = card.querySelector(".education-view");
      const edit = card.querySelector(".education-edit-form");
      const btnEdit = card.querySelector(".btn-edit-education");
      const btnDelete = card.querySelector(".btn-delete-education");
      const btnCancel = card.querySelector(".btn-cancel-education");

      btnEdit.addEventListener("click", () => {
        view.classList.add("hidden");
        edit.classList.remove("hidden");
      });
      btnCancel.addEventListener("click", () => {
        edit.classList.add("hidden");
        view.classList.remove("hidden");
      });

      edit.addEventListener("submit", async e => {
        e.preventDefault();
        const fd = new FormData(edit);
        education[idx] = {
          degree: fd.get("editDegree").trim(),
          institution: fd.get("editInstitution").trim(),
          year: fd.get("editYear").trim() || "N/A",
          grade: fd.get("editGrade").trim() || "N/A",
        };
        const updatedUser = await saveListToBackend("education", education);
        if (updatedUser) {
          projects = updatedUser.projects || [];
          education = updatedUser.education || [];
          achievements = updatedUser.achievements || [];
          renderEducation();
        }
      });

      btnDelete.addEventListener("click", async () => {
        const confirmed = await showConfirm(`Delete education "${education[idx].degree}"?`);
        if (confirmed) {
          education.splice(idx, 1);
          const updatedUser = await saveListToBackend("education", education);
          if (updatedUser) {
            projects = updatedUser.projects || [];
            education = updatedUser.education || [];
            achievements = updatedUser.achievements || [];
            renderEducation();
          }
        }
      });
    });
  }

  // Render Achievements
  function renderAchievements() {
    if (!profileAchievementsContainer) return;
    profileAchievementsContainer.innerHTML = "";

    achievements.forEach((a, idx) => {
      const card = document.createElement("div");
      card.className = `achievement-item badge-${a.type || "bronze"}`;

      card.innerHTML = `
        <div class="achievement-header">
          <span>${a.title}</span>
          <div class="achievement-controls">
            <button class="btn-edit-achievement" title="Edit"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-delete-achievement" title="Delete"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
        ${a.details ? `<small>${a.details}</small>` : ""}
        <form class="achievement-edit-form hidden">
          <input type="text" name="editTitle" value="${a.title}" required />
          <select name="editType">
            <option value="bronze" ${a.type === "bronze" ? "selected" : ""}>Bronze</option>
            <option value="silver" ${a.type === "silver" ? "selected" : ""}>Silver</option>
            <option value="gold" ${a.type === "gold" ? "selected" : ""}>Gold</option>
          </select>
          <textarea name="editDetails">${a.details || ""}</textarea>
          <div class="form-actions">
            <button type="submit" class="btn-primary">Save</button>
            <button type="button" class="btn-cancel-achievement">Cancel</button>
          </div>
        </form>
      `;

      profileAchievementsContainer.appendChild(card);

      const editForm = card.querySelector(".achievement-edit-form");
      const btnEdit = card.querySelector(".btn-edit-achievement");
      const btnDelete = card.querySelector(".btn-delete-achievement");
      const btnCancel = editForm.querySelector(".btn-cancel-achievement");

      btnEdit.addEventListener("click", () => {
        editForm.classList.remove("hidden");
        card.querySelector("small")?.classList.add("hidden");
      });
      btnCancel.addEventListener("click", () => {
        editForm.classList.add("hidden");
        card.querySelector("small")?.classList.remove("hidden");
      });

      editForm.addEventListener("submit", async e => {
        e.preventDefault();
        const fd = new FormData(editForm);
        achievements[idx] = {
          title: fd.get("editTitle").trim(),
          type: fd.get("editType"),
          details: fd.get("editDetails").trim(),
        };
        const updatedUser = await saveListToBackend("achievements", achievements);
        if (updatedUser) {
          projects = updatedUser.projects || [];
          education = updatedUser.education || [];
          achievements = updatedUser.achievements || [];
          renderAchievements();
        }
      });

      btnDelete.addEventListener("click", async () => {
        const confirmed = await showConfirm(`Delete achievement "${a.title}"?`);
        if (confirmed) {
          achievements.splice(idx, 1);
          const updatedUser = await saveListToBackend("achievements", achievements);
          if (updatedUser) {
            projects = updatedUser.projects || [];
            education = updatedUser.education || [];
            achievements = updatedUser.achievements || [];
            renderAchievements();
          }
        }
      });
    });
  }

  // Setup Add Panel
  function setupAddPanel(btnId, type, renderFn, listRef) {
    const btn = document.getElementById(btnId);
    if (!btn) {
      console.error(`Button with id '${btnId}' not found.`);
      return;
    }

    // Create add panel once
    const panel = document.createElement("div");
    panel.className = "add-panel hidden";
    panel.innerHTML = getAddFormHTML(type);
    btn.after(panel);

    btn.addEventListener("click", () => togglePanel(btn, panel));

    const cancelBtn = panel.querySelector(".btn-add-cancel");
    if (!cancelBtn) {
      console.error(`Cancel button not found inside ${type} add panel.`);
      return;
    }

    cancelBtn.addEventListener("click", () => {
      panel.classList.add("hidden");
      btn.setAttribute("aria-expanded", false);
      panel.querySelector("form").reset();
    });

    panel.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();

      const fd = new FormData(e.target);
      const newItem = createNewItem(type, fd);


      listRef.push(newItem);


      const updatedUser = await saveListToBackend(type, listRef);

      if (updatedUser) {
        projects = updatedUser.projects || [];
        education = updatedUser.education || [];
        achievements = updatedUser.achievements || [];

        renderFn();

        panel.classList.add("hidden");
        e.target.reset();
      } else {
        listRef.pop();
      }
    });
  }

  function getAddFormHTML(type) {
    if (type === "projects")
      return `
      <form>
        <input name="title" placeholder="Title" required />
        <textarea name="description" placeholder="Description"></textarea>
        <input name="tech_stack" placeholder="Tech stack (comma separated)" />
        <input name="link" placeholder="Project link" />
        <div class="form-actions"><button class="btn-primary">Add</button><button type="button" class="btn-add-cancel">Cancel</button></div>
      </form>`;
    if (type === "education")
      return `
      <form>
        <input name="degree" placeholder="Degree" required />
        <input name="institution" placeholder="Institution" required />
        <input name="year" placeholder="Year" />
        <input name="grade" placeholder="Grade" />
        <div class="form-actions"><button class="btn-primary">Add</button><button type="button" class="btn-add-cancel">Cancel</button></div>
      </form>`;
    return `
      <form>
        <input name="title" placeholder="Title" required />
        <select name="type">
          <option value="bronze">Bronze</option>
          <option value="silver">Silver</option>
          <option value="gold">Gold</option>
        </select>
        <textarea name="details" placeholder="Details"></textarea>
        <div class="form-actions"><button class="btn-primary">Add</button><button type="button" class="btn-add-cancel">Cancel</button></div>
      </form>`;
  }

  function createNewItem(type, fd) {
    if (type === "projects")
      return {
        title: fd.get("title").trim(),
        description: fd.get("description").trim(),
        tech_stack: fd.get("tech_stack").split(",").map(s => s.trim()).filter(Boolean),
        link: fd.get("link").trim() || null,
      };
    if (type === "education")
      return {
        degree: fd.get("degree").trim(),
        institution: fd.get("institution").trim(),
        year: fd.get("year").trim() || "N/A",
        grade: fd.get("grade").trim() || "N/A",
      };
    return {
      title: fd.get("title").trim(),
      type: fd.get("type"),
      details: fd.get("details").trim(),
    };
  }

  async function saveListToBackend(field, list) {
    try {
      const formData = new FormData();
      formData.append(field, JSON.stringify(list));

      const res = await fetch(`${API_BASE}/auth/update-profile`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();
      console.log("Updated user response:", data);

      if (!res.ok) {
        alert(data.message || `Failed to update ${field}`);
        return null;
      }

      return data.user || null;
    } catch (err) {
      console.error("saveListToBackend error:", err);
      alert(`Error updating ${field}`);
      return null;
    }
  }


  function showConfirm(message) {
    return new Promise((resolve) => {
      const confirmDiv = document.createElement("div");
      confirmDiv.style = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex; align-items: center; justify-content: center;
        z-index: 9999;
      `;

      confirmDiv.innerHTML = `
        <div style="background: white; padding: 1.5rem 2rem; border-radius: 8px; max-width: 320px; text-align: center;">
          <p style="margin-bottom: 1rem;">${message}</p>
          <button id="confirmYes" style="margin-right: 1rem; padding: 0.5rem 1rem;">Yes</button>
          <button id="confirmNo" style="padding: 0.5rem 1rem;">No</button>
        </div>
      `;

      document.body.appendChild(confirmDiv);

      confirmDiv.querySelector("#confirmYes").onclick = () => {
        resolve(true);
        document.body.removeChild(confirmDiv);
      };

      confirmDiv.querySelector("#confirmNo").onclick = () => {
        resolve(false);
        document.body.removeChild(confirmDiv);
      };
    });
  }

  // Load profile and initialize
  async function loadProfile() {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const user = await res.json();
      if (!res.ok) return alert(user.message || "Failed to load profile");
      updateProfileUI(user);
    } catch (err) {
      console.error(err);
      alert("Error loading profile");
    }
  }

  await loadProfile();


  editBtn?.addEventListener("click", () => editSection.classList.toggle("hidden"));


  form.addEventListener("submit", async e => {
    e.preventDefault();

    const formData = new FormData();

    formData.append("name", form.editName.value.trim());
    formData.append("role", form.editRole.value.trim());
    formData.append("location", form.editLocation.value.trim());
    formData.append("designation", form.editDesignation.value.trim());
    formData.append("bio", form.editBio.value.trim());
    formData.append("skills", form.editSkills.value.trim());
    formData.append("github", form.editGithub.value.trim());
    formData.append("linkedin", form.editLinkedin.value.trim());
    formData.append("portfolio", form.editPortfolio.value.trim());


    formData.append("projects", JSON.stringify(projects));
    formData.append("education", JSON.stringify(education));
    formData.append("achievements", JSON.stringify(achievements));


    const fileInput = document.getElementById("editProfileImage");
    if (fileInput && fileInput.files.length > 0) {
      formData.append("profile_image", fileInput.files[0]);
    }

    try {
      const res = await fetch(`${API_BASE}/auth/update-profile`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();
      alert(data.message);

      if (res.ok && data.user) {
        projects = data.user.projects || [];
        education = data.user.education || [];
        achievements = data.user.achievements || [];

        updateProfileUI(data.user);
        localStorage.setItem("user", JSON.stringify(data.user));
        editSection.classList.add("hidden");
      }
    } catch (err) {
      console.error("Profile update error:", err);
      alert("Error updating profile");
    }
  });

  setupAddPanel("addProjectBtn", "projects", renderProjects, projects);
  setupAddPanel("addEducationBtn", "education", renderEducation, education);
  setupAddPanel("addAchievementBtn", "achievements", renderAchievements, achievements);
});





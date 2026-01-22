(function () {
  const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
    ? 'http://localhost:5000/api'
    : '/api';
  const navHTML = `
    <style>
      .bottom-nav {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: #1A1A1A;
        border-radius: 40px;
        padding: 10px 25px;
        display: flex;
        gap: 25px;
        justify-content: center;
        align-items: center;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        z-index: 10000;
      }
      .bottom-nav .nav-item {
        color: #DCEF62;
        font-size: 1.4rem;
        transition: 0.3s;
        text-decoration: none;
      }
      .bottom-nav .nav-create {
        color: #1A1A1A;
        font-size: 1.3rem;
        background: #DCEF62;
        border: none;
        cursor: pointer;
        transition: 0.3s;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .bottom-nav .nav-create i {
        color: #1A1A1A;
      }
      .bottom-nav .nav-item:hover,
      .bottom-nav .nav-create:hover {
        transform: translateY(-2px);
      }

      #floatingCreateMenu {
        position: fixed;
        bottom: 80px;
        right: 20px;
        display: none;
        flex-direction: column;
        gap: 10px;
        background: #222;
        border-radius: 8px;
        padding: 10px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        z-index: 10001;
      }
      #floatingCreateMenu button {
        background: #DCEF62;
        border: none;
        padding: 8px 12px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
        color: #1A1A1A;
      }

      #createBoardModal {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.6);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 10002;
      }
      #createBoardModal .modal-content {
        background: #fff;
        padding: 20px 30px;
        border-radius: 10px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 2px 15px rgba(0,0,0,0.3);
        color: #111;
      }
    </style>

    <nav class="bottom-nav" id="floatingBottomNav">
      <a href="chat.html" class="nav-item" title="Chat"><i class="fa-solid fa-comments"></i></a>
      <a href="collaborations.html" class="nav-item" title="Collabs"><i class="fa-solid fa-users"></i></a>

      <button class="nav-create" id="createBtn" title="Create New"><i class="fa-solid fa-plus"></i></button>

      <a href="live-history.html" class="nav-item" title="Live Sessions"><i class="fa-solid fa-clock-rotate-left"></i></a>
      <a href="pair-programming.html" class="nav-item" title="Code"><i class="fa-solid fa-code"></i></a>
    </nav>

    <div id="floatingCreateMenu">
      <button id="btnCreatePairProgramming">Create Pair-Programming Project</button>
      <button id="btnCreateBoard">Create Board</button>
      <button id="btnCreateLiveSession">Create Live Session</button>
    </div>

    <div id="createPairModal" style="display:none; position: fixed; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.6); align-items:center; justify-content:center; z-index:10002;">
      <div style="background:#fff; padding:25px 35px; border-radius:12px; max-width:450px; width:95%; box-shadow: 0 4px 20px rgba(0,0,0,0.3); color:#111; position: relative;">
        <button id="closePairModal" style="position:absolute; top:15px; right:15px; font-size:20px; background:none; border:none; cursor:pointer;">✕</button>
        <h2 style="margin-bottom:20px; color:var(--sidebar-bg);">New Programming Project</h2>
        <label style="display:block; margin-bottom:5px; font-weight:600;">Project Name *</label>
        <input type="text" id="pairProjectTitleInput" placeholder="e.g. My Awesome App" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ddd;" required />
        <button id="submitCreatePairProject" style="width:100%; background:#DCEF62; border:none; padding:12px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:1rem; margin-top:20px;" disabled>Create Project</button>
        <div id="pairCreateError" style="color:red; margin-top:8px; display:none;"></div>
      </div>
    </div>

    <div id="createBoardModal" style="display:none; position: fixed; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.6); align-items:center; justify-content:center; z-index:10002;">
      <div style="background:#fff; padding:25px 35px; border-radius:12px; max-width:450px; width:95%; box-shadow: 0 4px 20px rgba(0,0,0,0.3); color:#111; position: relative;">
        <button id="closeBoardModal" style="position:absolute; top:15px; right:15px; font-size:20px; background:none; border:none; cursor:pointer;">✕</button>
        <h2 style="margin-bottom:20px; color:var(--sidebar-bg);">New Smartboard</h2>
        <label style="display:block; margin-bottom:5px; font-weight:600;">Board Name *</label>
        <input type="text" id="boardTitleInput" placeholder="e.g. Brainstorming" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ddd;" required />
        <button id="submitCreateBoard" style="width:100%; background:#DCEF62; border:none; padding:12px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:1rem; margin-top:20px;" disabled>Create Board</button>
      </div>
    </div>

    <div id="createLiveSessionModal" style="display:none; position: fixed; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.6); align-items:center; justify-content:center; z-index:10002;">
      <div style="background:#fff; padding:25px 35px; border-radius:12px; max-width:500px; width:95%; box-shadow: 0 4px 20px rgba(0,0,0,0.3); color:#111; position: relative; max-height: 90vh; overflow-y: auto;">
        <button id="closeLiveModal" style="position:absolute; top:15px; right:15px; font-size:20px; background:none; border:none; cursor:pointer;">✕</button>
        <h2 style="margin-bottom:20px; color:var(--sidebar-bg);">Create Live Session</h2>
        
        <div style="display:flex; flex-direction:column; gap:15px;">
          <div class="form-group">
            <label style="display:block; margin-bottom:5px; font-weight:600;">Session Name *</label>
            <input type="text" id="sessionNameInput" placeholder="e.g. React Deep Dive" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ddd;" required />
          </div>

          <div class="form-group">
            <label style="display:block; margin-bottom:5px; font-weight:600;">Purpose / Description *</label>
            <textarea id="sessionPurposeInput" placeholder="What will be covered?" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ddd; height:80px;" required></textarea>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
             <div class="form-group">
               <label style="display:block; margin-bottom:5px; font-weight:600;">Duration (45-75m) *</label>
               <input type="number" id="sessionDurationInput" value="60" min="45" max="75" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ddd;" required />
             </div>
             <div class="form-group">
               <label style="display:block; margin-bottom:5px; font-weight:600;">Max Mentees (Max 3)</label>
               <input type="number" id="sessionMaxUser" value="3" max="3" readonly style="width:100%; padding:10px; border-radius:8px; border:1px solid #ddd; background:#f5f5f5;" />
             </div>
          </div>

          <div class="form-group">
            <label style="display:block; margin-bottom:5px; font-weight:600;">Scheduled Date & Time *</label>
            <input type="datetime-local" id="sessionDateTimeInput" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ddd;" required />
          </div>

          <div class="form-group" style="position:relative;">
            <label style="display:block; margin-bottom:5px; font-weight:600;">Invite Users</label>
            <div style="display:flex; flex-wrap:wrap; gap:5px; padding:5px; border:1px solid #ddd; border-radius:8px; min-height:45px; align-items:center;" id="selectedUsersContainer">
                <input type="text" id="sessionInviteInput" placeholder="Search by name or email..." style="border:none; outline:none; flex:1; min-width:150px; padding:5px;" />
            </div>
            <div id="userSearchResults" style="display:none; position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #ddd; border-top:none; border-radius:0 0 8px 8px; z-index:10; max-height:200px; overflow-y:auto; box-shadow: 0 5px 15px rgba(0,0,0,0.1);"></div>
          </div>

          <button id="submitCreateLiveSession" style="background:#DCEF62; border:none; padding:12px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:1rem; margin-top:10px;">Create Session</button>
          <div id="liveCreateError" style="color:red; margin-top:8px; display:none; font-size:0.9rem;"></div>
        </div>
      </div>
    </div>
  `;

  document.addEventListener("DOMContentLoaded", () => {
    document.body.insertAdjacentHTML("beforeend", navHTML);

    const createBtn = document.getElementById("createBtn");
    const createMenu = document.getElementById("floatingCreateMenu");

    const boardModal = document.getElementById("createBoardModal");
    const boardTitleInput = document.getElementById("boardTitleInput");
    const submitBoardBtn = document.getElementById("submitCreateBoard");
    const btnCreateBoard = document.getElementById("btnCreateBoard");

    const pairModal = document.getElementById("createPairModal");
    const pairTitleInput = document.getElementById("pairProjectTitleInput");
    const submitPairBtn = document.getElementById("submitCreatePairProject");
    const btnCreatePairProgramming = document.getElementById("btnCreatePairProgramming");

    const liveModal = document.getElementById("createLiveSessionModal");
    const submitLiveBtn = document.getElementById("submitCreateLiveSession");
    const btnCreateLiveSession = document.getElementById("btnCreateLiveSession");

    // CREATE MENU TOGGLE
    createBtn.addEventListener("click", () => {
      createMenu.style.display = createMenu.style.display === "flex" ? "none" : "flex";
    });

    // --- BOARD ---
    btnCreateBoard.addEventListener("click", () => {
      createMenu.style.display = "none";
      boardModal.style.display = "flex";
      boardTitleInput.focus();
    });
    document.getElementById("closeBoardModal").addEventListener("click", () => boardModal.style.display = "none");
    boardTitleInput.addEventListener("input", () => submitBoardBtn.disabled = !boardTitleInput.value.trim());

    submitBoardBtn.addEventListener("click", async () => {
      const title = boardTitleInput.value.trim();
      submitBoardBtn.disabled = true;
      submitBoardBtn.textContent = "Creating...";
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE}/board/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: title }),
        });
        const data = await res.json();
        if (data.success) window.location.href = `board.html?id=${data.data._id}`;
      } catch (e) { console.error(e); }
      finally { submitBoardBtn.disabled = false; submitBoardBtn.textContent = "Create Board"; }
    });

    // --- PAIR PROGRAMMING ---
    btnCreatePairProgramming.addEventListener("click", () => {
      createMenu.style.display = "none";
      pairModal.style.display = "flex";
      pairTitleInput.focus();
    });
    document.getElementById("closePairModal").addEventListener("click", () => pairModal.style.display = "none");
    pairTitleInput.addEventListener("input", () => submitPairBtn.disabled = !pairTitleInput.value.trim());

    submitPairBtn.addEventListener("click", async () => {
      const title = pairTitleInput.value.trim();
      submitPairBtn.disabled = true;
      submitPairBtn.textContent = "Creating...";
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE}/pair-programming/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: title }),
        });
        const data = await res.json();
        if (data.success) {
          const joinUrl = `${window.location.origin}/pair-programming.html?join=${data.data.shareLinks[data.data.shareLinks.length - 1].token}`;
          prompt("Copy this invite link:", joinUrl);
          pairModal.style.display = "none";
        }
      } catch (err) { console.error(err); }
      finally { submitPairBtn.disabled = false; submitPairBtn.textContent = "Create Project"; }
    });

    // --- LIVE SESSION ---
    btnCreateLiveSession.addEventListener("click", () => {
      createMenu.style.display = "none";
      liveModal.style.display = "flex";
      document.getElementById("liveCreateError").style.display = "none";
      selectedUsers.clear();
      renderSelectedUsers();
    });
    document.getElementById("closeLiveModal").addEventListener("click", () => liveModal.style.display = "none");

    submitLiveBtn.addEventListener("click", async () => {
      const name = document.getElementById("sessionNameInput").value.trim();
      const purpose = document.getElementById("sessionPurposeInput").value.trim();
      const duration = parseInt(document.getElementById("sessionDurationInput").value);
      const rawDateTime = document.getElementById("sessionDateTimeInput").value;
      const scheduledDateTime = rawDateTime ? new Date(rawDateTime).toISOString() : null;
      const invitedUserIds = Array.from(selectedUsers.keys());
      const errorEl = document.getElementById("liveCreateError");

      if (!name || !purpose || !rawDateTime) {
        errorEl.textContent = "Please fill all required fields.";
        errorEl.style.display = "block";
        return;
      }

      submitLiveBtn.disabled = true;
      submitLiveBtn.textContent = "Creating...";

      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE}/live-sessions/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionName: name, purpose, durationMinutes: duration, scheduledDateTime, invitedUserIds }),
        });
        const data = await res.json();
        if (res.ok) {
          liveModal.style.display = "none";
          if (typeof showToast === 'function') showToast("Session scheduled successfully!", "success");
          if (window.loadSchedule) window.loadSchedule();
          else window.location.reload();
        } else {
          errorEl.textContent = data.message || "Failed to create session.";
          errorEl.style.display = "block";
        }
      } catch (err) {
        errorEl.textContent = "Connection error.";
        errorEl.style.display = "block";
      } finally {
        submitLiveBtn.disabled = false;
        submitLiveBtn.textContent = "Create Session";
      }
    });

    // TYPEAHEAD SEARCH LOGIC
    const inviteInput = document.getElementById("sessionInviteInput");
    const resultsContainer = document.getElementById("userSearchResults");
    const selectedContainer = document.getElementById("selectedUsersContainer");
    const selectedUsers = new Map();

    const debounce = (func, wait) => {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
      };
    };

    inviteInput.addEventListener("input", debounce(async (e) => {
      const query = e.target.value.trim();
      if (query.length < 2) {
        resultsContainer.style.display = "none";
        return;
      }
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE}/auth/search-users?q=${query}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const users = await res.json();
        renderSearchResults(users);
      } catch (err) { console.error("Search error:", err); }
    }, 300));

    function renderSearchResults(users) {
      resultsContainer.innerHTML = "";
      if (users.length === 0) {
        resultsContainer.innerHTML = '<div style="padding:10px; color:#999; font-size:0.9rem;">No users found</div>';
      } else {
        users.forEach(user => {
          if (selectedUsers.has(user._id)) return;
          const div = document.createElement("div");
          div.style = "padding:10px; cursor:pointer; display:flex; align-items:center; gap:10px; border-bottom:1px solid #f0f0f0;";
          div.innerHTML = `
                    <img src="${user.profile_image || 'assets/images/user-avatar.png'}" style="width:30px; height:30px; border-radius:50%;" />
                    <div>
                        <div style="font-weight:600; font-size:0.9rem;">${user.name}</strong></div>
                        <div style="font-size:0.75rem; color:#999;">${user.email}</div>
                    </div>
                `;
          div.addEventListener("click", () => {
            if (selectedUsers.size >= 3) return alert("Max 3 mentees allowed");
            selectedUsers.set(user._id, user);
            renderSelectedUsers();
            inviteInput.value = "";
            resultsContainer.style.display = "none";
          });
          resultsContainer.appendChild(div);
        });
      }
      resultsContainer.style.display = "block";
    }

    function renderSelectedUsers() {
      // Keep the input reference
      const input = inviteInput;
      selectedContainer.innerHTML = "";
      selectedUsers.forEach((user, id) => {
        const tag = document.createElement("div");
        tag.style = "background:#f0f0f0; padding:2px 8px; border-radius:15px; display:flex; align-items:center; gap:5px; font-size:0.8rem;";
        tag.innerHTML = `${user.name} <span style="cursor:pointer; font-weight:bold;">✕</span>`;
        tag.querySelector("span").addEventListener("click", () => {
          selectedUsers.delete(id);
          renderSelectedUsers();
        });
        selectedContainer.appendChild(tag);
      });
      selectedContainer.appendChild(input);
      input.focus();
    }
  });
})();

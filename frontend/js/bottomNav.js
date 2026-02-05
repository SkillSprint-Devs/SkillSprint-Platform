(function () {
  const API_BASE = window.API_BASE_URL;
  const navHTML = `
    <style>
      /* --- OBSIDIAN HUB STYLES --- */
      .bottom-nav-container {
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
      }

      /* Floating Dock */
      .bottom-nav {
        background: rgba(10, 10, 10, 0.85); /* Deep Obsidian */
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 24px;
        padding: 8px 12px;
        display: flex;
        gap: 20px;
        align-items: center;
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .bottom-nav:hover {
        border-color: rgba(220, 239, 98, 0.3);
        box-shadow: 0 25px 60px rgba(0,0,0,0.7), 0 0 30px rgba(220, 239, 98, 0.1);
      }

      .nav-item {
        color: rgba(255, 255, 255, 0.6);
        font-size: 1.4rem;
        transition: all 0.3s;
        text-decoration: none;
        padding: 10px;
        border-radius: 12px;
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
      }

      .nav-item:hover {
        color: #DCEF62;
        background: rgba(255, 255, 255, 0.05);
        transform: translateY(-3px);
      }

      /* The "Nexus" Button */
      .nav-create {
        width: 64px;
        height: 64px;
        background: radial-gradient(circle at 30% 30%, #DCEF62, #a8c945);
        border: none;
        border-radius: 20px;
        color: #0a0a0a;
        font-size: 1.8rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        box-shadow: 0 10px 30px rgba(220, 239, 98, 0.3);
        margin: 0 10px;
        position: relative;
        z-index: 10001;
      }

      .nav-create:hover {
        transform: scale(1.1) rotate(90deg);
        box-shadow: 0 0 40px rgba(220, 239, 98, 0.5);
      }

      .nav-create.active {
        transform: rotate(45deg);
        background: #fff;
      }

      /* --- ACTION GRID PANEL --- */
      #floatingCreateMenu {
        position: absolute;
        bottom: 100px; /* Sits above dock */
        display: none; /* Flex when active */
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        width: 600px;
        max-width: 90vw;
        perspective: 1000px;
        opacity: 0;
        transform: translateY(20px) scale(0.95);
        transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
        pointer-events: none; /* Prevent clicks when hidden */
      }

      #floatingCreateMenu.active {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: all;
      }

      /* Action Cards */
      .action-card {
        background: rgba(20, 20, 20, 0.95);
        backdrop-filter: blur(24px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 24px;
        border-radius: 24px;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        display: flex;
        flex-direction: column;
        gap: 12px;
        position: relative;
        overflow: hidden;
        text-align: left;
      }

      .action-card::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 100%);
        opacity: 0;
        transition: opacity 0.3s;
      }

      .action-card:hover {
        border-color: #DCEF62;
        transform: translateY(-5px);
        box-shadow: 0 15px 40px rgba(0, 0, 0, 0.4), 0 0 20px rgba(220, 239, 98, 0.1);
      }

      .action-card:hover::before {
        opacity: 1;
      }

      .action-icon {
        font-size: 2rem;
        color: #DCEF62;
        background: rgba(220, 239, 98, 0.1);
        width: 56px;
        height: 56px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 4px;
        transition: all 0.3s;
      }

      .action-card:hover .action-icon {
        background: #DCEF62;
        color: #0a0a0a;
        transform: rotate(-10deg) scale(1.1);
      }

      .action-title {
        color: #fff;
        font-size: 1.2rem;
        font-weight: 700;
        font-family: 'Outfit', sans-serif;
      }

      .action-desc {
        color: rgba(255, 255, 255, 0.5);
        font-size: 0.9rem;
        line-height: 1.4;
      }

      /* Special Large Card for Live Session */
      .action-card.large {
        grid-column: span 2;
        background: linear-gradient(135deg, rgba(20,20,20,0.95), rgba(30,35,20,0.95));
      }

      /* --- PREMIUM MODALS --- */
      .custom-modal-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 20000;
        opacity: 0;
        transition: opacity 0.3s;
      }

      .custom-modal-overlay.active {
        display: flex;
        opacity: 1;
      }

      .premium-modal {
        background: #141414;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 24px;
        padding: 40px;
        width: 100%;
        max-width: 600px;
        position: relative;
        box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
        transform: scale(0.95) translateY(20px);
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        overflow: hidden;
      }

      .custom-modal-overlay.active .premium-modal {
        transform: scale(1) translateY(0);
      }

      /* Modal Header */
      .pm-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 30px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 20px;
      }

      .pm-title {
        font-size: 1.8rem;
        font-weight: 700;
        color: #fff;
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .pm-close {
        background: rgba(255, 255, 255, 0.1);
        border: none;
        color: #fff;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .pm-close:hover {
        background: rgba(255, 0, 0, 0.2);
        color: #ff4444;
      }

      /* Modal Form */
      .pm-form-group {
        margin-bottom: 20px;
      }

      .pm-label {
        display: block;
        color: rgba(255, 255, 255, 0.7);
        font-size: 0.9rem;
        font-weight: 600;
        margin-bottom: 8px;
        letter-spacing: 0.5px;
      }

      .pm-input, .pm-textarea, .pm-select {
        width: 100%;
        background: rgba(0, 0, 0, 0.3);
        border: 2px solid rgba(255, 255, 255, 0.15);
        border-radius: 14px;
        padding: 14px 18px;
        color: #fff;
        font-size: 1rem;
        font-family: inherit;
        transition: all 0.2s;
      }

      .pm-input:focus, .pm-textarea:focus, .pm-select:focus {
        outline: none;
        border-color: #DCEF62;
        background: rgba(0, 0, 0, 0.5);
        box-shadow: 0 0 20px rgba(220, 239, 98, 0.15);
      }

      .pm-textarea {
        resize: vertical;
        min-height: 100px;
      }

      .pm-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
      }

      /* Submit Button */
      .pm-submit-btn {
        width: 100%;
        background: linear-gradient(135deg, #DCEF62, #a8c945);
        color: #0a0a0a;
        font-weight: 800;
        font-size: 1.1rem;
        padding: 16px;
        border: none;
        border-radius: 16px;
        cursor: pointer;
        transition: all 0.3s;
        margin-top: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
      }

      .pm-submit-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 30px rgba(220, 239, 98, 0.3);
      }

      .pm-submit-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
      }

      /* Typeahead overrides for dark mode */
      #userSearchResults {
        background: #1E1E1E !important;
        border-color: #333 !important;
      }
      #userSearchResults div {
        color: #fff !important;
        border-bottom: 1px solid #333 !important;
      }
      #userSearchResults div:hover {
        background: #333 !important;
      }

      /* --- MENU OVERLAY --- */
      #createMenuOverlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 9999; /* Below nav (10000) */
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.4s ease;
      }

      #createMenuOverlay.active {
        opacity: 1;
        pointer-events: all;
      }
    </style>

    <div id="createMenuOverlay"></div>

    <div class="bottom-nav-container">
        
        <!-- THE OBSIDIAN GRID HUB -->
        <div id="floatingCreateMenu">
            <!-- Board Card -->
            <div class="action-card" id="btnCreateBoard">
                <div class="action-icon"><i class="fa-solid fa-chalkboard-user"></i></div>
                <div class="action-title">SmartBoard</div>
                <div class="action-desc">Infinite canvas for brainstorming and visual planning.</div>
            </div>

            <!-- Pair Card -->
            <div class="action-card" id="btnCreatePairProgramming">
                <div class="action-icon"><i class="fa-solid fa-code-branch"></i></div>
                <div class="action-title">Pair Code</div>
                <div class="action-desc">Real-time collaborative coding environment.</div>
            </div>

            <!-- Live Session (Large) -->
            <div class="action-card large" id="btnCreateLiveSession">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div class="action-icon"><i class="fa-solid fa-headset"></i></div>
                        <div class="action-title">Live Session</div>
                        <div class="action-desc">Host a mentorship session or workshop.</div>
                    </div>
                    <i class="fa-solid fa-arrow-right" style="color:rgba(255,255,255,0.2); font-size:2rem;"></i>
                </div>
            </div>
        </div>

        <!-- FLOATING DOCK -->
        <nav class="bottom-nav" id="floatingBottomNav">
            <a href="chat.html" class="nav-item" title="Chat"><i class="fa-solid fa-comments"></i></a>
            <a href="posting.html" class="nav-item" title="Feed"><i class="fa-solid fa-rss"></i></a>

            <button class="nav-create" id="createBtn" title="Create New">
                <i class="fa-solid fa-plus"></i>
            </button>

            <a href="task.html" class="nav-item" title="Tasks"><i class="fa-solid fa-list-check"></i></a>
            <a href="quiz.html" class="nav-item" title="Quiz"><i class="fa-solid fa-graduation-cap"></i></a>
        </nav>
    </div>

    <!-- MODAL: NEW BOARD -->
    <div id="createBoardModal" class="custom-modal-overlay">
        <div class="premium-modal">
            <div class="pm-header">
                <div class="pm-title"><i class="fa-solid fa-chalkboard-user" style="color:#DCEF62;"></i> New Board</div>
                <button id="closeBoardModal" class="pm-close"><i class="fa-solid fa-times"></i></button>
            </div>
            
            <div class="pm-form-group">
                <label class="pm-label">Board Name</label>
                <input type="text" id="boardTitleInput" class="pm-input" placeholder="e.g. System Architecture V2">
            </div>

            <div class="pm-form-group">
                <label class="pm-label">Description (Optional)</label>
                <textarea id="boardDescInput" class="pm-textarea" placeholder="What is this board for?"></textarea>
            </div>

            <div class="pm-form-group">
                <label class="pm-label">Privacy</label>
                <select id="boardPrivacyInput" class="pm-select">
                    <option value="private">Private (Only Me)</option>
                    <option value="public">Public (Everyone)</option>
                </select>
            </div>

            <button id="submitCreateBoard" class="pm-submit-btn">Create Board <i class="fa-solid fa-arrow-right"></i></button>
        </div>
    </div>

    <!-- MODAL: NEW PAIR PROJECT -->
    <div id="createPairModal" class="custom-modal-overlay">
        <div class="premium-modal" style="max-height: 90vh; overflow-y: auto;">
            <div class="pm-header">
                <div class="pm-title"><i class="fa-solid fa-code" style="color:#DCEF62;"></i> Pair Programming</div>
                <button id="closePairModal" class="pm-close"><i class="fa-solid fa-times"></i></button>
            </div>
            
            <div class="pm-form-group">
                <label class="pm-label">Project Title</label>
                <input type="text" id="pairProjectTitleInput" class="pm-input" placeholder="e.g. Algorithm Practice">
            </div>

            <div class="pm-form-group">
                <label class="pm-label">Goal / Description</label>
                <textarea id="pairDescInput" class="pm-textarea" placeholder="What do you want to achieve together?"></textarea>
            </div>

            <div class="pm-form-group">
                <label class="pm-label">Primary Language</label>
                <select id="pairLanguageInput" class="pm-select">
                    <option value="js">JavaScript (Node.js)</option>
                    <option value="python">Python</option>
                    <option value="html">HTML</option>
                    <option value="css">CSS</option>
                    <option value="php">PHP</option>
                </select>
            </div>

            <div class="pm-form-group" style="margin-top:20px;">
                <label class="pm-label">Invite Members (Max 2 + You)</label>
                <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.15); border-radius:14px; padding:12px; display:flex; flex-direction:column; gap:12px;">
                    <!-- Owner Role -->
                    <div id="ownerRoleRow" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:10px;">
                        <span style="color:#fff; font-size:0.9rem; font-weight:600;">You (Owner)</span>
                        <div class="role-toggles" id="ownerRoleToggles" style="display:flex; background:rgba(0,0,0,0.2); border-radius:8px; padding:2px;">
                            <button type="button" class="role-btn active" data-role="driver" style="border:none; background:#DCEF62; color:#000; padding:4px 12px; border-radius:6px; font-size:0.8rem; font-weight:700; cursor:pointer;">Driver</button>
                            <button type="button" class="role-btn" data-role="navigator" style="border:none; background:transparent; color:#fff; padding:4px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;">Navigator</button>
                        </div>
                    </div>
                    
                    <!-- Invited Members Container -->
                    <div id="pairMembersContainer" style="display:flex; flex-direction:column; gap:8px;"></div>
                    
                    <input type="text" id="pairInviteSearch" placeholder="Search to invite members..." style="background:transparent; border:none; border-bottom:1px solid rgba(255,255,255,0.1); color:#fff; outline:none; padding:8px 0; font-size:0.9rem;">
                    <div id="pairSearchResults" style="display:none; background:#141414; border:1px solid rgba(255,255,255,0.1); border-radius:12px; max-height:150px; overflow-y:auto; margin-top:5px; box-shadow:0 10px 30px rgba(0,0,0,0.8);"></div>
                </div>
            </div>

            <button id="submitCreatePairProject" class="pm-submit-btn">Create Project <i class="fa-solid fa-code-commit"></i></button>
        </div>
    </div>

    <!-- MODAL: NEW LIVE SESSION -->
    <div id="createLiveSessionModal" class="custom-modal-overlay">
        <div class="premium-modal">
            <div class="pm-header">
                <div class="pm-title"><i class="fa-solid fa-headset" style="color:#DCEF62;"></i> Schedule Session</div>
                <button id="closeLiveModal" class="pm-close"><i class="fa-solid fa-times"></i></button>
            </div>
            
            <div class="pm-form-group">
                <label class="pm-label">Session Topic</label>
                <input type="text" id="sessionNameInput" class="pm-input" placeholder="e.g. Mock Interview">
            </div>

            <div class="pm-form-group">
                <label class="pm-label">Agenda / Description</label>
                <textarea id="sessionPurposeInput" class="pm-textarea" placeholder="Outline the session goals..."></textarea>
            </div>

            <div class="pm-row">
                <div class="pm-form-group">
                    <label class="pm-label">Duration (Min)</label>
                    <input type="number" id="sessionDurationInput" class="pm-input" value="60" min="15" max="180">
                </div>
                <div class="pm-form-group">
                    <label class="pm-label">Date & Time</label>
                    <input type="datetime-local" id="sessionDateTimeInput" class="pm-input">
                </div>
            </div>

            <div class="pm-form-group" style="position:relative;">
                <label class="pm-label">Invite Participants</label>
                <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.15); border-radius:14px; padding:8px; display:flex; flex-wrap:wrap; gap:8px; min-height:50px;">
                    <div id="selectedUsersContainer" style="display:flex; flex-wrap:wrap; gap:5px; width:100%;"></div>
                    <input type="text" id="sessionInviteInput" placeholder="Search users..." style="background:transparent; border:none; color:#fff; outline:none; flex:1; min-width:120px;">
                </div>
                <div id="userSearchResults" style="display:none; position:absolute; top:100%; left:0; right:0; background:#1E1E1E; border:1px solid #333; border-radius:12px; z-index:100; max-height:200px; overflow-y:auto; margin-top:5px; box-shadow:0 10px 40px rgba(0,0,0,0.5);"></div>
            </div>

            <button id="submitCreateLiveSession" class="pm-submit-btn">Schedule Event <i class="fa-solid fa-calendar-check"></i></button>
            <div id="liveCreateError" style="color:#ff4444; margin-top:15px; display:none; font-size:0.9rem; text-align:center;"></div>
        </div>
    </div>
  `;

  document.addEventListener("DOMContentLoaded", () => {
    document.body.insertAdjacentHTML("beforeend", navHTML);

    // --- ELEMENTS ---
    const createBtn = document.getElementById("createBtn");
    const createMenu = document.getElementById("floatingCreateMenu");
    const menuOverlay = document.getElementById("createMenuOverlay");

    // Utility: Debounce
    const debounce = (func, wait) => {
      let timeout;
      return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); };
    };

    // Toggle Menu Logic
    const toggleMenu = () => {
      const isActive = createMenu.classList.contains("active");
      if (isActive) {
        // CLOSE
        createMenu.classList.remove("active");
        createBtn.classList.remove("active");
        menuOverlay.classList.remove("active");
        setTimeout(() => {
          if (!createMenu.classList.contains("active")) createMenu.style.display = "none";
        }, 300);
      } else {
        // OPEN
        createMenu.style.display = "grid";
        setTimeout(() => {
          createMenu.classList.add("active");
          createBtn.classList.add("active");
          menuOverlay.classList.add("active");
        }, 10);
      }
    };

    createBtn.addEventListener("click", toggleMenu);

    // Close when clicking overlay
    menuOverlay.addEventListener("click", () => {
      if (createMenu.classList.contains("active")) toggleMenu();
    });

    // State for Modals
    const selectedUsers = new Map();
    const pairMembers = new Map();

    // --- MODAL HANDLERS ---
    const clearForm = (modalId) => {
      const modal = document.getElementById(modalId);
      if (!modal) return;
      const inputs = modal.querySelectorAll("input, textarea");
      inputs.forEach(input => {
        if (input.type === 'number') input.value = input.defaultValue || 60;
        else if (input.type === 'datetime-local') input.value = '';
        else if (input.type === 'text' || input.tagName === 'TEXTAREA') input.value = '';
        else input.value = '';
      });

      const selects = modal.querySelectorAll("select");
      selects.forEach(s => s.selectedIndex = 0);

      // Hide results
      const searchResults = modal.querySelectorAll("[id$='SearchResults'], #userSearchResults");
      searchResults.forEach(r => r.style.display = 'none');

      const errors = modal.querySelectorAll("[id$='Error']");
      errors.forEach(e => e.style.display = 'none');

      // Clear Specific States
      if (modalId === "createLiveSessionModal") {
        selectedUsers.clear();
        if (typeof renderSelected === 'function') renderSelected();
      }
      if (modalId === "createPairModal") {
        pairMembers.clear();
        if (typeof renderPairMembers === 'function') renderPairMembers();

        // Reset Owner Role Toggles to Navigator
        document.querySelectorAll("#ownerRoleToggles .role-btn").forEach(b => {
          b.classList.remove("active");
          b.style.background = "transparent";
          b.style.color = "#fff";
        });
        const navBtn = document.querySelector("#ownerRoleToggles .role-btn[data-role='navigator']");
        if (navBtn) {
          navBtn.classList.add("active");
          navBtn.style.background = "#DCEF62";
          navBtn.style.color = "#000";
        }
      }
    };

    const setupModal = (triggerId, modalId, closeId) => {
      const trigger = document.getElementById(triggerId);
      const modal = document.getElementById(modalId);
      const close = document.getElementById(closeId);

      if (trigger) {
        trigger.addEventListener("click", () => {
          modal.classList.add("active");
          // Close the menu immediately
          createMenu.classList.remove("active");
          createBtn.classList.remove("active");
          menuOverlay.classList.remove("active");
          setTimeout(() => createMenu.style.display = "none", 300);
        });
      }

      if (close) {
        close.addEventListener("click", () => {
          modal.classList.remove("active");
          clearForm(modalId);
        });
      }

      // Close on outside click
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.classList.remove("active");
          clearForm(modalId);
        }
      });
    };

    setupModal("btnCreateBoard", "createBoardModal", "closeBoardModal");
    setupModal("btnCreatePairProgramming", "createPairModal", "closePairModal");
    setupModal("btnCreateLiveSession", "createLiveSessionModal", "closeLiveModal");


    // --- API & SUBMIT LOGIC ---

    // 1. BOARD
    const submitBoard = document.getElementById("submitCreateBoard");
    const boardTitle = document.getElementById("boardTitleInput");

    submitBoard.addEventListener("click", async () => {
      const name = boardTitle.value.trim();
      const desc = document.getElementById("boardDescInput").value.trim();
      const privacy = document.getElementById("boardPrivacyInput").value;

      if (!name) return showToast("Board name is required", "error");

      submitBoard.disabled = true;
      submitBoard.textContent = "Forging...";

      try {
        const token = localStorage.getItem("token");
        // Assuming backend accepts these extra fields or ignores them
        const res = await fetch(`${API_BASE}/board/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name, description: desc, privacy }),
        });
        const data = await res.json();
        if (data.success) {
          clearForm("createBoardModal");
          window.location.href = `board.html?id=${data.data._id}`;
        }
        else showToast(data.message || "Failed", "error");
      } catch (e) { console.error(e); showToast("Connection error", "error"); }
      finally {
        submitBoard.disabled = false;
        submitBoard.innerHTML = 'Create Board <i class="fa-solid fa-arrow-right"></i>';
      }
    });

    // 2. PAIR PROGRAMMING
    const submitPair = document.getElementById("submitCreatePairProject");
    const pairMembersContainer = document.getElementById("pairMembersContainer");
    const pairInviteSearch = document.getElementById("pairInviteSearch");
    const pairSearchResults = document.getElementById("pairSearchResults");

    // Role Toggles for Owner
    document.querySelectorAll("#ownerRoleToggles .role-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#ownerRoleToggles .role-btn").forEach(b => {
          b.classList.remove("active");
          b.style.background = "transparent";
          b.style.color = "#fff";
          b.style.fontWeight = "600";
        });
        btn.classList.add("active");
        btn.style.background = "#DCEF62";
        btn.style.color = "#000";
        btn.style.fontWeight = "700";
      });
    });

    function renderPairMembers() {
      pairMembersContainer.innerHTML = "";
      pairMembers.forEach((user, id) => {
        const row = document.createElement("div");
        row.style = "display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:10px;";

        row.innerHTML = `
          <div style="display:flex; flex-direction:column;">
            <span style="color:#fff; font-size:0.9rem; font-weight:600;">${user.name}</span>
            <span style="color:rgba(255,255,255,0.4); font-size:0.75rem;">${user.email}</span>
          </div>
          <div style="display:flex; gap:12px; align-items:center;">
            <div class="role-toggles" style="display:flex; background:rgba(0,0,0,0.2); border-radius:8px; padding:2px;">
              <button type="button" class="role-btn-remote ${user.role === 'driver' ? 'active' : ''}" data-id="${id}" data-role="driver" style="border:none; background:${user.role === 'driver' ? '#DCEF62' : 'transparent'}; color:${user.role === 'driver' ? '#000' : '#fff'}; padding:4px 12px; border-radius:6px; font-size:0.8rem; font-weight:700; cursor:pointer;">Driver</button>
              <button type="button" class="role-btn-remote ${user.role === 'navigator' ? 'active' : ''}" data-id="${id}" data-role="navigator" style="border:none; background:${user.role === 'navigator' ? '#DCEF62' : 'transparent'}; color:${user.role === 'navigator' ? '#000' : '#fff'}; padding:4px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;">Navigator</button>
            </div>
            <i class="fa-solid fa-times-circle" style="color:rgba(255,0,0,0.4); cursor:pointer;" title="Remove"></i>
          </div>
        `;

        // Handle role toggle
        row.querySelectorAll(".role-btn-remote").forEach(btn => {
          btn.addEventListener("click", () => {
            const userId = btn.dataset.id;
            const newRole = btn.dataset.role;
            const userData = pairMembers.get(userId);
            if (userData) {
              userData.role = newRole;
              pairMembers.set(userId, userData);
              renderPairMembers();
            }
          });
        });

        // Handle remove
        row.querySelector(".fa-times-circle").addEventListener("click", () => {
          pairMembers.delete(id);
          renderPairMembers();
        });

        pairMembersContainer.appendChild(row);
      });

      // Show/Hide search based on limit (Max 2 invited users)
      if (pairMembers.size >= 2) {
        pairInviteSearch.parentElement.style.display = "none";
      } else {
        pairInviteSearch.parentElement.style.display = "block";
      }
    }

    pairInviteSearch.addEventListener("input", debounce(async (e) => {
      const query = e.target.value.trim();
      if (query.length < 2) { pairSearchResults.style.display = "none"; return; }

      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE}/auth/search-users?q=${query}`, { headers: { Authorization: `Bearer ${token}` } });
        const users = await res.json();

        pairSearchResults.innerHTML = "";
        if (users.length === 0) pairSearchResults.innerHTML = '<div style="padding:10px; color:#aaa;">No users found</div>';

        users.forEach(user => {
          if (pairMembers.has(user._id)) return;
          const div = document.createElement("div");
          div.style = "padding:10px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.05); color:#fff;";
          div.innerHTML = `<div style="font-weight:bold;">${user.name}</div><div style="font-size:0.8rem; color:#aaa;">${user.email}</div>`;
          div.addEventListener("click", () => {
            pairMembers.set(user._id, { ...user, role: 'navigator' });
            renderPairMembers();
            pairInviteSearch.value = "";
            pairSearchResults.style.display = "none";
          });
          pairSearchResults.appendChild(div);
        });
        pairSearchResults.style.display = "block";
      } catch (err) { console.error(err); }
    }, 300));

    submitPair.addEventListener("click", async () => {
      const title = document.getElementById("pairProjectTitleInput").value.trim();
      const desc = document.getElementById("pairDescInput").value.trim();
      const language = document.getElementById("pairLanguageInput").value;

      const ownerRole = document.querySelector("#ownerRoleToggles .role-btn.active").dataset.role;

      const invitedMembers = [];
      pairMembers.forEach((user, id) => {
        invitedMembers.push({
          userId: id,
          role: user.role
        });
      });

      if (!title) return showToast("Project title is required", "error");

      submitPair.disabled = true;
      submitPair.textContent = "Forging Project...";

      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE}/pair-programming/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: title,
            description: desc,
            language,
            ownerRole,
            invitedMembers
          }),
        });
        const data = await res.json();
        if (data.success) {
          showToast("Project created!", "success");
          clearForm("createPairModal");
          window.location.href = `pair-programming.html?id=${data.data._id}`;
        } else {
          showToast(data.message || "Failed to create project", "error");
        }
      } catch (err) {
        console.error(err);
        showToast("Connection error", "error");
      } finally {
        submitPair.disabled = false;
        submitPair.innerHTML = 'Create Project <i class="fa-solid fa-code-commit"></i>';
      }
    });

    // 3. LIVE SESSION (Existing logic adapted)
    const submitLive = document.getElementById("submitCreateLiveSession");
    const selectedContainer = document.getElementById("selectedUsersContainer");
    const inviteInput = document.getElementById("sessionInviteInput");
    const resultsContainer = document.getElementById("userSearchResults");

    submitLive.addEventListener("click", async () => {
      const name = document.getElementById("sessionNameInput").value.trim();
      // ... (rest of live session logic handled similarly to before, just cleaner UI)
      // Re-using essential logic for brevity but ensuring it grabs the new IDs
      const purpose = document.getElementById("sessionPurposeInput").value.trim();
      const duration = document.getElementById("sessionDurationInput").value;
      const rawDateTime = document.getElementById("sessionDateTimeInput").value;

      if (!name || !purpose || !rawDateTime) return showToast("Please fill required fields", "warning");

      submitLive.disabled = true;
      submitLive.textContent = "Scheduling...";

      try {
        const token = localStorage.getItem("token");
        const invitedUserIds = Array.from(selectedUsers.keys());
        const scheduledDateTime = new Date(rawDateTime).toISOString();

        const res = await fetch(`${API_BASE}/live-sessions/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionName: name, purpose, durationMinutes: parseInt(duration), scheduledDateTime, invitedUserIds }),
        });
        const data = await res.json();
        if (res.ok) {
          document.getElementById("createLiveSessionModal").classList.remove("active");
          clearForm("createLiveSessionModal");
          showToast("Session scheduled!", "success");
          if (window.loadSchedule) window.loadSchedule();
        } else {
          showToast(data.message || "Failed", "error");
        }
      } catch (err) { console.error(err); showToast("Error scheduling", "error"); }
      finally {
        submitLive.disabled = false;
        submitLive.innerHTML = 'Schedule Event <i class="fa-solid fa-calendar-check"></i>';
      }
    });


    inviteInput.addEventListener("input", debounce(async (e) => {
      const query = e.target.value.trim();
      if (query.length < 2) { resultsContainer.style.display = "none"; return; }

      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE}/auth/search-users?q=${query}`, { headers: { Authorization: `Bearer ${token}` } });
        const users = await res.json();

        resultsContainer.innerHTML = "";
        if (users.length === 0) resultsContainer.innerHTML = '<div style="padding:10px; color:#aaa;">No users found</div>';

        users.forEach(user => {
          if (selectedUsers.has(user._id)) return;
          const div = document.createElement("div");
          div.style.padding = "10px";
          div.style.cursor = "pointer";
          div.innerHTML = `<div style="font-weight:bold;">${user.name}</div><div style="font-size:0.8rem; color:#aaa;">${user.email}</div>`;
          div.addEventListener("click", () => {
            selectedUsers.set(user._id, user);
            renderSelected();
            inviteInput.value = "";
            resultsContainer.style.display = "none";
          });
          resultsContainer.appendChild(div);
        });
        resultsContainer.style.display = "block";
      } catch (err) { console.error(err); }
    }, 300));

    function renderSelected() {
      selectedContainer.innerHTML = "";
      selectedUsers.forEach((user, id) => {
        const tag = document.createElement("div");
        tag.style = "background:#DCEF62; color:#000; padding:4px 10px; border-radius:20px; font-size:0.85rem; display:flex; align-items:center; gap:6px;";
        tag.innerHTML = `<span>${user.name}</span> <i class="fa-solid fa-times" style="cursor:pointer;"></i>`;
        tag.querySelector("i").addEventListener("click", () => {
          selectedUsers.delete(id);
          renderSelected();
        });
        selectedContainer.appendChild(tag);
      });
    }

    // Helper Toast if not present
    function showToast(msg, type = 'info') {
      if (window.showToast) window.showToast(msg, type);
      else alert(msg);
    }

  });
})();

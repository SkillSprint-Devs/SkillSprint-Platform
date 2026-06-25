// /js/pair-programming-sio.js
import io from "https://cdn.socket.io/4.5.4/socket.io.esm.min.js";

let socket = null;
let currentBoardId = null;
let currentUserId = null;

// Internal UI callbacks with default no-op implementations
let _loadBoardMembers = () => { };
let _loadBoard = () => { };
let _renderComments = () => { };
let _onlineUserIds = new Set();
let _getCurrentFile = () => null;
let _getEditor = () => null;
let _getActiveTab = () => null;
let _closeTab = () => { };
let _showToast = (msg, type, dur) => {
  console.warn("showToast not implemented", msg, type, dur);
};

// Setter functions for UI to inject implementations
export function setLoadBoardMembers(fn) {
  _loadBoardMembers = fn;
}

export function setLoadBoard(fn) {
  _loadBoard = fn;
}

export function setRenderComments(fn) {
  _renderComments = fn;
}

export function setOnlineUserIds(userIdsSet) {
  _onlineUserIds = userIdsSet;
}

export function setGetCurrentFile(fn) {
  _getCurrentFile = fn;
}

export function setGetEditor(fn) {
  _getEditor = fn;
}

export function setGetActiveTab(fn) {
  _getActiveTab = fn;
}

export function setCloseTab(fn) {
  _closeTab = fn;
}

export function setShowToast(fn) {
  _showToast = fn;
}

export function setCurrentUserId(userId) {
  currentUserId = userId;
}

let _isOwner = false;
export function setIsOwner(val) {
  console.log("[SIO] setIsOwner set to:", val);
  _isOwner = !!val;
}

export function initSocket(token, boardIdParam) {
  currentBoardId = boardIdParam;

  if (!token) {
    _showToast("Please login to continue", "error");
    window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
    return;
  }

  console.log("Initializing socket with boardId:", currentBoardId);

  const backendUrl = window.API_SOCKET_URL;
  socket = io(`${backendUrl}/pair-programming`, {
    transports: ["websocket", "polling"],
    auth: { token }
  });


  socket.on("connect", () => {
    console.log("Socket connected:", socket.id);
    if (currentBoardId) {
      console.log("Joining board:", currentBoardId);
      socket.emit("join-board", { boardId: currentBoardId });
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected");
    _showToast("Connection lost. Reconnecting...", "error");
  });

  socket.on("connect_error", (err) => {
    console.error("Socket connection error:", err);
    _showToast("Failed to connect to server", "error");
  });

  socket.on("user-meta", ({ name, color }) => {
    console.log("Syncing user meta from server:", { name, color });
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const updated = { ...user, name: name || user.name, colorTag: color || user.colorTag };
    localStorage.setItem("user", JSON.stringify(updated));
    // Also notify global-auth if needed
    if (window.updateGlobalUserUI) window.updateGlobalUserUI(updated);
  });

  socket.on("user-joined", ({ userId }) => {
    console.log("User joined:", userId);
    _onlineUserIds.add(userId);
    _loadBoardMembers();
  });

  socket.on("initial-presence", ({ userIds }) => {
    console.log("Initial presence:", userIds);
    userIds.forEach(id => _onlineUserIds.add(id));
    _loadBoardMembers();
  });

  socket.on("user-left", ({ userId }) => {
    console.log("User left:", userId);
    _showToast("A user left the board", "info");
    _onlineUserIds.delete(userId);
    _loadBoardMembers();
  });

  socket.on("content-update", ({ userId, fileId, patch }) => {
    console.log("Content update from:", userId, "for file:", fileId);

    if (userId === currentUserId) {
      console.log("Skipping own update");
      return;
    }

    const currentFile = _getCurrentFile();
    const editor = _getEditor();

    if (currentFile && currentFile._id === fileId && editor) {
      console.log("Applying remote changes");
      const cursor = editor.getCursor();
      editor.setValue(patch.text);
      editor.setCursor(cursor);
      _renderComments(); // Re-apply markers
      _showToast("Remote changes applied", "info", 1000);
    }
  });

  socket.on("file-saved", ({ fileId }) => {
    console.log("File saved:", fileId);
    const currentFile = _getCurrentFile();
    if (currentFile && currentFile._id === fileId) {
      const header = document.getElementById("activeFilename");
      if (header) {
        const originalText = header.textContent;
        header.textContent = originalText + " (Sync)";
        setTimeout(() => {
          header.textContent = originalText.replace(" *", "");
        }, 1500);
      }
    }
  });

  socket.on("folder-created", ({ folder }) => {
    console.log("Folder created:", folder);
    _loadBoard();
    _showToast("New folder created", "success");
  });

  socket.on("file-created", ({ folderId, file }) => {
    console.log("File created:", file.name);
    _loadBoard();
    _showToast(`New file created: ${file.name}`, "success");
  });

  socket.on("folder-updated", ({ folder }) => {
    console.log("Folder updated:", folder);
    _loadBoard();
  });

  socket.on("file-updated", ({ folderId, file }) => {
    console.log("File updated:", file.name);
    _loadBoard();
  });

  socket.on("folder-deleted", ({ folderId }) => {
    console.log("Folder deleted:", folderId);
    _loadBoard();
    _showToast("Folder deleted", "info");
  });

  socket.on("file-deleted", ({ folderId, fileId }) => {
    console.log("File deleted:", fileId);
    const activeTab = _getActiveTab();
    if (activeTab && activeTab.includes(fileId)) {
      _closeTab(activeTab);
    }
    _loadBoard();
    _showToast("File deleted", "info");
  });

  socket.on("comment-created", ({ comment }) => {
    console.log("Comment created:", comment);
    _loadBoard(); // Reload board to get updated comments for files

    // Only show toast if it's someone else's comment
    const authorId = comment.authorId?._id || comment.authorId;
    if (authorId !== currentUserId) {
      _showToast("New comment added", "info");
    }
  });

  socket.on("typing", ({ userId, fileId, status }) => {
    if (userId === currentUserId) return;

    const currentFile = _getCurrentFile();
    if (currentFile && currentFile._id === fileId && status) {
      _showToast("Someone is typing...", "info", 1000);
    }
  });

  // ── Remote Cursors (setBookmark-based, anchored in CodeMirror) ──────────────
  // Maps userId → { bookmark, container }
  const remoteCursors = {};

  socket.on("cursor-update", ({ userId, name, fileId, cursor, color }) => {
    if (userId === currentUserId) return;

    const editor = _getEditor();
    const currentFile = _getCurrentFile();

    // Only render if the sender is editing the currently open file
    if (!editor || !currentFile || currentFile._id !== fileId) {
      // Clean up stale bookmark if file changed
      if (remoteCursors[userId]) {
        try { remoteCursors[userId].bookmark.clear(); } catch (_) {}
        delete remoteCursors[userId];
      }
      return;
    }

    // cursor is { line, ch } from CodeMirror getCursor()
    if (!cursor || cursor.line === undefined || cursor.ch === undefined) return;

    const col   = color || "#8C52FF";
    const label = name  || "User";

    // ── Build (or reuse) the cursor widget DOM element ──
    let entry = remoteCursors[userId];
    if (!entry) {
      const container = document.createElement("div");
      container.className = "pp-remote-cursor-widget";
      container.style.cssText = [
        "position:relative",
        "display:inline-block",
        "pointer-events:none",
        "z-index:100"
      ].join(";");

      // Caret bar
      const caret = document.createElement("div");
      caret.className = "pp-cursor-caret";
      caret.style.cssText = [
        `background:${col}`,
        "width:2px",
        "height:1.2em",
        "display:inline-block",
        "vertical-align:text-bottom",
        "border-radius:1px",
        "animation:pp-cursor-blink 1s step-end infinite"
      ].join(";");

      // Name tag — sits directly below the caret bar
      const tag = document.createElement("div");
      tag.className = "pp-cursor-tag";
      tag.textContent = label;
      tag.style.cssText = [
        `background:${col}`,
        "color:#000",
        "font-size:10px",
        "font-weight:700",
        "padding:1px 5px",
        "border-radius:0 3px 3px 3px",
        "white-space:nowrap",
        "position:absolute",
        "top:100%",
        "left:0",
        "z-index:101",
        "line-height:1.6"
      ].join(";");

      container.appendChild(caret);
      container.appendChild(tag);

      // Place the bookmark at the cursor position
      const pos = { line: cursor.line, ch: cursor.ch };
      const bookmark = editor.setBookmark(pos, {
        widget: container,
        insertLeft: true
      });

      entry = { bookmark, container };
      remoteCursors[userId] = entry;
    } else {
      // ── Move existing bookmark to new position ──
      // setBookmark cannot be repositioned; clear and re-create
      try { entry.bookmark.clear(); } catch (_) {}

      // Update colors / name in case they changed
      const caret = entry.container.querySelector(".pp-cursor-caret");
      const tag   = entry.container.querySelector(".pp-cursor-tag");
      if (caret) caret.style.background = col;
      if (tag)   { tag.style.background = col; tag.textContent = label; }

      const pos = { line: cursor.line, ch: cursor.ch };
      entry.bookmark = editor.setBookmark(pos, {
        widget: entry.container,
        insertLeft: true
      });
    }

    // Auto-remove after 5 s of inactivity
    clearTimeout(entry.hideTimer);
    entry.hideTimer = setTimeout(() => {
      if (remoteCursors[userId]) {
        try { remoteCursors[userId].bookmark.clear(); } catch (_) {}
        delete remoteCursors[userId];
      }
    }, 5000);
  });

  socket.on("terminal:output", ({ data }) => {
    // Dispatch custom event to be picked up by main UI
    const event = new CustomEvent("terminal-output", { detail: data });
    window.dispatchEvent(event);
  });

  socket.on("roles-updated", ({ members }) => {
    console.log("Roles updated remote:", members);
    _loadBoard(); // Reload everything to ensure sync
    _showToast("Roles have been reassigned", "info");
  });

  socket.on("role-request", ({ userId: requesterId, userName, role }) => {
    console.log("[SIO] role-request received:", { 
      requesterId, 
      currentUserId, 
      _isOwner, 
      userName, 
      role 
    });

    // Case-insensitive string comparison for safety
    const isMe = requesterId && currentUserId && 
                 requesterId.toString().toLowerCase() === currentUserId.toString().toLowerCase();

    if (isMe) {
      console.log("[SIO] Skipping dialog: I am the requester");
      return;
    }

    if (!_isOwner) {
      console.log("[SIO] Skipping dialog: I am not marked as owner");
      // Fallback: if we haven't set _isOwner yet, we might still be the owner.
      // But for now, we rely on the setIsOwner call from main.js
      return;
    }

    console.log("[SIO] Showing Approve/Deny dialog...");
    _showDriverRequestDialog(requesterId, userName, role);
  });

  socket.on("role-request-response", ({ approved, message }) => {
    if (approved) {
      _showToast(message, "success", 5000);
    } else {
      _showToast(message, "error", 5000);
    }
  });

  // Handle board deletion
  socket.on("board-deleted", ({ boardId }) => {
    if (boardId === currentBoardId) {
      alert("This project has been deleted by the owner.");
      window.location.href = "dashboard.html";
    }
  });
}

// ── Driver-Request Approve / Deny Dialog ─────────────────────────────────────
function _showDriverRequestDialog(requesterId, userName, role) {
  // Remove any existing dialog first (avoid duplicates)
  const existing = document.getElementById("pp-driver-request-dialog");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "pp-driver-request-dialog";
  overlay.className = "pp-drq-overlay";

  overlay.innerHTML = `
    <div class="pp-drq-box">
      <div class="pp-drq-icon"><i class="fa-solid fa-steering-wheel"></i></div>
      <h3 class="pp-drq-title">Driver Role Request</h3>
      <p class="pp-drq-body">
        <strong>${userName}</strong> is requesting to become the
        <span class="pp-drq-badge">${role}</span>.
        <br>Do you want to approve this?
      </p>
      <div class="pp-drq-actions">
        <button class="pp-drq-btn pp-drq-approve" id="pp-drq-approve">
          <i class="fa-solid fa-circle-check"></i> Approve
        </button>
        <button class="pp-drq-btn pp-drq-deny" id="pp-drq-deny">
          <i class="fa-solid fa-circle-xmark"></i> Deny
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Animate in
  requestAnimationFrame(() => overlay.classList.add("pp-drq-visible"));

  const close = () => {
    overlay.classList.remove("pp-drq-visible");
    setTimeout(() => overlay.remove(), 300);
  };

  overlay.querySelector("#pp-drq-approve").addEventListener("click", async () => {
    close();
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${window.API_BASE_URL}/pair-programming/${currentBoardId}/respond-driver-request`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ requesterId, action: "approve" })
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        _showToast(err.message || "Failed to approve request", "error");
      }
    } catch (e) {
      _showToast("Network error — could not approve request", "error");
    }
  });

  overlay.querySelector("#pp-drq-deny").addEventListener("click", async () => {
    close();
    try {
      const token = localStorage.getItem("token");
      await fetch(
        `${window.API_BASE_URL}/pair-programming/${currentBoardId}/respond-driver-request`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ requesterId, action: "deny" })
        }
      );
    } catch (_) { /* silent */ }
  });

  // Auto-dismiss after 60 s if owner doesn't respond
  const autoClose = setTimeout(() => {
    close();
    _showToast("Driver request timed out (no response)", "info");
  }, 60_000);

  // Cancel auto-close if user acts
  overlay.querySelectorAll(".pp-drq-btn").forEach(btn =>
    btn.addEventListener("click", () => clearTimeout(autoClose), { once: true })
  );
}

// Emitters - ALL FUNCTIONS PROPERLY EXPORTED

export function emitTyping(boardId, fileId, status) {
  if (socket && socket.connected) {
    socket.emit("typing", { boardId, fileId, status });
  }
}

// ── Throttled cursor emitter (max 1 event per 50 ms ≈ 20 FPS) ────────────────
let _cursorThrottleTimer = null;
let _pendingCursorPayload = null;

export function emitCursorUpdate(boardId, fileId, cursor, color) {
  if (!socket || !socket.connected) return;

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  _pendingCursorPayload = {
    boardId,
    fileId,
    cursor,           // { line, ch } — CodeMirror structural coords
    name: user.name  || "User",
    color: color || user.colorTag || "#8C52FF"
  };

  if (_cursorThrottleTimer !== null) return; // already scheduled

  _cursorThrottleTimer = setTimeout(() => {
    if (_pendingCursorPayload && socket && socket.connected) {
      socket.emit("cursor-update", _pendingCursorPayload);
    }
    _cursorThrottleTimer  = null;
    _pendingCursorPayload = null;
  }, 50);
}

export function emitContentUpdate(boardId, fileId, patch) {
  if (socket && socket.connected) {
    console.log("Emitting content update for file:", fileId);
    socket.emit("content-update", { boardId, fileId, patch });
  }
}

export function emitJoinBoard(boardId) {
  if (socket && socket.connected) {
    socket.emit("join-board", { boardId });
  }
}

export function emitLeaveBoard(boardId) {
  if (socket && socket.connected) {
    socket.emit("leave-board", { boardId });
  }
}

// TERMINAL EMITTERS
export function emitTerminalStart(boardId, fileId, code, language) {
  if (socket && socket.connected) {
    socket.emit("terminal:start", { boardId, fileId, code, language });
  }
}

export function emitTerminalInput(boardId, data) {
  if (socket && socket.connected) {
    socket.emit("terminal:input", { boardId, data });
  }
}

export function emitTerminalKill(boardId) {
  if (socket && socket.connected) {
    socket.emit("terminal:kill", { boardId });
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    console.log("Socket manually disconnected");
  }
}

// Get socket status
export function isSocketConnected() {
  return socket && socket.connected;
}

export function getSocketId() {
  return socket ? socket.id : null;
}
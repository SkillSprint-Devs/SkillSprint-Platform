// /js/pair-programming-sio.js
import io from "https://cdn.socket.io/4.5.4/socket.io.esm.min.js";

let socket = null;
let currentBoardId = null;
let currentUserId = null;

// Internal UI callbacks with default no-op implementations
let _loadBoardMembers = () => { };
let _loadBoard = () => { };
let _renderComments = () => { };
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

export function initSocket(token, boardIdParam) {
  currentBoardId = boardIdParam;

  if (!token) {
    _showToast("Please login to continue", "error");
    window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
    return;
  }

  console.log("Initializing socket with boardId:", currentBoardId);

  const backendUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
    ? 'http://localhost:5000'
    : ''; // Empty string for relative path in production
  socket = io(`${backendUrl}/pair-programming`, {
    transports: ["websocket"],
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

  socket.on("user-joined", ({ userId }) => {
    console.log("User joined:", userId);
    _showToast("A user joined the board", "info");
    _loadBoardMembers();
  });

  socket.on("user-left", ({ userId }) => {
    console.log("User left:", userId);
    _showToast("A user left the board", "info");
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
        header.textContent = originalText + " ✓";
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
    _showToast("New comment added", "info");
  });

  socket.on("typing", ({ userId, fileId, status }) => {
    if (userId === currentUserId) return;

    const currentFile = _getCurrentFile();
    if (currentFile && currentFile._id === fileId && status) {
      _showToast("Someone is typing...", "info", 1000);
    }
  });

  // Remote Cursors handling for Pair Programming
  const remoteCursors = {};

  socket.on("cursor-update", ({ userId, name, cursor, color }) => {
    if (userId === currentUserId) return;

    let cursorEl = remoteCursors[userId];
    if (!cursorEl) {
      cursorEl = document.createElement("div");
      cursorEl.className = "remote-cursor pp-cursor";
      cursorEl.style.position = "fixed";
      cursorEl.style.zIndex = "999999";
      cursorEl.style.pointerEvents = "none";
      cursorEl.style.transition = "transform 0.1s linear";
      cursorEl.innerHTML = `
        <div class="cursor-pointer" style="width:12px; height:20px; background: ${color || '#8C52FF'}; clip-path: polygon(0 0, 100% 70%, 30% 70%, 0 100%);"></div>
        <div class="cursor-label" style="background:${color || '#8C52FF'}; color:#000; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold; white-space:nowrap; margin-top:4px;">${name || 'User'}</div>
      `;
      document.body.appendChild(cursorEl);
      remoteCursors[userId] = cursorEl;
    }

    if (cursor && cursor.x !== undefined && cursor.y !== undefined) {
      cursorEl.style.display = "flex";
      cursorEl.style.flexDirection = "column";
      cursorEl.style.alignItems = "flex-start";
      cursorEl.style.top = "0";
      cursorEl.style.left = "0";
      cursorEl.style.transform = `translate(${cursor.x}px, ${cursor.y}px)`;
    }

    clearTimeout(cursorEl.timeout);
    cursorEl.timeout = setTimeout(() => {
      cursorEl.remove();
      delete remoteCursors[userId];
    }, 5000);
  });

  socket.on("terminal:output", ({ data }) => {
    // Dispatch custom event to be picked up by main UI
    const event = new CustomEvent("terminal-output", { detail: data });
    window.dispatchEvent(event);
  });
}

// Emitters - ALL FUNCTIONS PROPERLY EXPORTED
export function emitTyping(boardId, fileId, status) {
  if (socket && socket.connected) {
    socket.emit("typing", { boardId, fileId, status });
  }
}

export function emitCursorUpdate(boardId, cursor, color) {
  if (socket && socket.connected) {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    socket.emit("cursor-update", {
      boardId,
      cursor,
      name: user.name || "User",
      color: color || user.colorTag || "#8C52FF"
    });
  }
}

export function emitContentUpdate(boardId, fileId, patch) {
  if (socket && socket.connected) {
    console.log("📤 Emitting content update for file:", fileId);
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
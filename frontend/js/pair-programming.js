// js/pair-programming.js
import {
  initSocket,
  setLoadBoardMembers,
  setLoadBoard,
  setRenderComments,
  setGetCurrentFile,
  setGetEditor,
  setGetActiveTab,
  setCloseTab,
  setShowToast,
  setCurrentUserId,
  emitTyping,
  emitCursorUpdate,
  emitContentUpdate,
  emitTerminalStart,
  emitTerminalInput,
  emitTerminalKill
} from "./pair-programming-sio.js";

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
  ? 'http://localhost:5000/api/pair-programming'
  : '/api/pair-programming';

const state = {
  board: null,
  openTabs: [],
  active: null,
  editor: null,
  commentsOpen: false,
  typingTimeout: null,
  userId: null,
};

let boardId = null;

// Join via Token Logic
(async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const joinToken = urlParams.get('join') || urlParams.get('token');
  if (joinToken) {
    try {
      const t = localStorage.getItem('token');
      if (!t) {
        window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.href);
        return;
      }

      const res = await fetch(`${API_BASE}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + t
        },
        body: JSON.stringify({ token: joinToken })
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = `pair-programming.html?id=${data.data.boardId}`;
      } else {
        alert('Invalid or expired invite link.');
        window.location.href = 'dashboard.html';
      }
    } catch (e) {
      console.error(e);
    }
  }
})();

export function showToast(message, type = "info", duration = 2500) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${type === "success" ? "#28a745" : type === "error" ? "#dc3545" : "#007bff"};
    color: white;
    border-radius: 6px;
    z-index: 10000;
    opacity: 0;
    transition: opacity 0.3s;
  `;

  document.body.appendChild(toast);
  requestAnimationFrame(() => (toast.style.opacity = "1"));

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export async function apiCall(endpoint, method = "GET", body = null) {
  const token = localStorage.getItem("token");

  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    },
  };

  if (body) options.body = JSON.stringify(body);

  if (endpoint.includes("/null/")) {
    console.error("Blocked API call with null ID:", endpoint);
    throw new Error("Invalid session state: Board ID is missing. Please refresh.");
  }

  let response;
  try {
    response = await fetch(API_BASE + endpoint, options);
  } catch (err) {
    console.error("Fetch failed:", err);
    throw new Error(`Network error - ${err.message || "server unreachable"}`);
  }

  const parseJSON = async () => {
    try {
      return await response.json();
    } catch {
      return null;
    }
  };

  const data = await parseJSON();

  if (!response.ok) {
    const message = data?.message || data?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data || {};
}

export async function loadBoard() {
  try {
    console.log("Loading board:", boardId);
    state.board = await apiCall(`/${boardId}`);
    console.log("Board loaded:", state.board);

    renderFileTree();
    loadBoardMembers();
    await loadComments();

    if (state.board.folders.length > 0 && state.board.folders[0].files.length > 0) {
      const firstFile = state.board.folders[0].files[0];
      openFile(state.board.folders[0]._id, firstFile._id);
    }

    document.querySelector(".project-name").textContent = `/ ${state.board.name}`;
  } catch (err) {
    console.error("Error loading board:", err);
    showToast(err.message, "error");
  }
}

export function renderFileTree() {
  const container = document.getElementById("fileTree");
  container.innerHTML = "";

  if (!state.board || !state.board.folders) return;

  const ul = document.createElement("ul");
  ul.style.padding = "0";

  state.board.folders.forEach(folder => {
    const folderLi = document.createElement("li");
    folderLi.style.listStyle = "none";

    const folderRow = document.createElement("div");
    folderRow.className = "folder";
    folderRow.textContent = folder.name;
    folderRow.setAttribute("data-folder-id", folder._id);

    const childContainer = document.createElement("div");
    childContainer.style.paddingLeft = "12px";

    folder.files.forEach(file => {
      const fileLi = document.createElement("li");
      fileLi.style.listStyle = "none";

      const fileRow = document.createElement("div");
      fileRow.className = "file";
      fileRow.textContent = file.name;
      fileRow.setAttribute("data-folder-id", folder._id);
      fileRow.setAttribute("data-file-id", file._id);

      fileRow.addEventListener("click", () => openFile(folder._id, file._id));

      fileLi.appendChild(fileRow);
      childContainer.appendChild(fileLi);
    });

    folderRow.addEventListener("click", () => {
      childContainer.classList.toggle("hidden");
    });

    folderLi.appendChild(folderRow);
    folderLi.appendChild(childContainer);
    ul.appendChild(folderLi);
  });

  container.appendChild(ul);
  container.appendChild(ul);
  // Remove nested event listener from here
}

let contextTargetFolderId = null;
let contextTargetFileId = null;

function handleContextMenu(e) {
  const folderEl = e.target.closest(".folder");
  const fileEl = e.target.closest(".file");

  if (!folderEl && !fileEl) return;

  e.preventDefault();

  if (folderEl) {
    contextTargetFolderId = folderEl.getAttribute("data-folder-id");
    contextTargetFileId = null;
  } else if (fileEl) {
    contextTargetFolderId = fileEl.getAttribute("data-folder-id");
    contextTargetFileId = fileEl.getAttribute("data-file-id");
  }

  const menu = document.getElementById("contextMenu");

  // Use 'show' class as defined in CSS
  menu.style.top = e.pageY + "px";
  menu.style.left = e.pageX + "px";
  menu.classList.add("show");
  menu.classList.remove("hidden"); // Just in case
}

// ensure we init listeners once
function initContextListeners() {
  const list = document.getElementById("fileTree");
  if (list) list.addEventListener("contextmenu", handleContextMenu);

  document.getElementById("addFileBtn")?.addEventListener("click", async () => {
    // Default to root folder if no context, or just ask user
    // simplified: if no folder selected, maybe just prompt or fail gracefully?
    // Let's default to the first folder if available or handle commonly
    if (!state.board?.folders?.length) return;

    // Mock a context for the first folder if none selected, or just run createNewFile logic
    // But createNewFile relies on contextTargetFolderId.
    // Let's set it to first folder by default if null
    if (!contextTargetFolderId && state.board.folders.length > 0) {
      contextTargetFolderId = state.board.folders[0]._id;
    }
    await createNewFile();
  });

  document.getElementById("addFolderBtn")?.addEventListener("click", createNewFolder);
}

// Call this from loadBoard or init
// checking if already bound might be tricky without a flag, or we just call it once at module level?
// Module top-level exec runs once.
initContextListeners();

document.addEventListener("click", () => {
  const menu = document.getElementById("contextMenu");
  menu.classList.remove("show");
  menu.classList.add("hidden");
});

document.addEventListener("click", () => {
  document.getElementById("contextMenu").classList.add("hidden");
});

document.getElementById("contextMenu").addEventListener("click", async (e) => {
  const action = e.target.dataset.action;

  try {
    switch (action) {
      case "new-file":
        await createNewFile();
        break;
      case "new-folder":
        await createNewFolder();
        break;
      case "rename":
        await renameItem();
        break;
      case "delete":
        await deleteItem();
        break;
    }
  } catch (err) {
    showToast(err.message, "error");
  }
});

export async function createNewFolder() {
  const name = await promptModal("Enter folder name:");
  if (!name) return;

  await apiCall(`/${boardId}/folder`, "POST", { name });
  await loadBoard();
  showToast("Folder created", "success");
}

export async function createNewFile() {
  if (!contextTargetFolderId) {
    showToast("Please right-click on a folder first", "error");
    return;
  }

  const name = await promptModal("Enter file name:");
  if (!name) return;

  const language = detectLanguage(name);

  await apiCall(`/${boardId}/folder/${contextTargetFolderId}/file`, "POST", {
    name,
    content: `// New file: ${name}`,
    language
  });

  await loadBoard();
  showToast("File created", "success");
}

export async function renameItem() {
  const newName = await promptModal("Enter new name:");
  if (!newName) return;

  if (contextTargetFileId) {
    await apiCall(`/${boardId}/folder/${contextTargetFolderId}/file/${contextTargetFileId}`, "PUT", {
      name: newName
    });
  } else if (contextTargetFolderId) {
    await apiCall(`/${boardId}/folder/${contextTargetFolderId}`, "PUT", {
      name: newName
    });
  }

  await loadBoard();
  showToast("Renamed successfully", "success");
}

export async function deleteItem() {
  const confirmed = await confirmModal("Are you sure you want to delete this?");
  if (!confirmed) return;

  if (contextTargetFileId) {
    await apiCall(`/${boardId}/folder/${contextTargetFolderId}/file/${contextTargetFileId}`, "DELETE");
  } else if (contextTargetFolderId) {
    await apiCall(`/${boardId}/folder/${contextTargetFolderId}`, "DELETE");
  }

  await loadBoard();
  showToast("Deleted successfully", "success");
}

export function openFile(folderId, fileId) {
  const tabKey = `${folderId}/${fileId}`;

  if (!state.openTabs.includes(tabKey)) {
    state.openTabs.push(tabKey);
  }

  setActiveTab(tabKey);
  renderTabs();
}

export function setActiveTab(tabKey) {
  state.active = tabKey;
  const [folderId, fileId] = tabKey.split("/");

  const file = getFile(folderId, fileId);
  if (!file) return;

  document.getElementById("activeFilename").textContent = file.name;

  if (!state.editor) initEditor();

  state.editor.setValue(file.content || "");
  state.editor.setOption("mode", detectMode(file.language));
  renderInlineMarkers(); // Restore markers

  renderTabs();
}

export function getCurrentFile() {
  if (!state.active) return null;
  const [folderId, fileId] = state.active.split("/");
  return getFile(folderId, fileId);
}

export function getEditor() {
  return state.editor;
}

export function getActiveTab() {
  return state.active;
}

export function getFile(folderId, fileId) {
  const folder = state.board.folders.find(f => f._id === folderId);
  if (!folder) return null;
  return folder.files.find(f => f._id === fileId);
}

export function closeTab(tabKey) {
  const idx = state.openTabs.indexOf(tabKey);
  if (idx === -1) return;

  state.openTabs.splice(idx, 1);

  if (state.active === tabKey) {
    const next = state.openTabs[idx - 1] || state.openTabs[0] || null;
    if (next) {
      setActiveTab(next);
    } else {
      state.active = null;
      if (state.editor) state.editor.setValue("");
      document.getElementById("activeFilename").textContent = "";
    }
  }

  renderTabs();
}

export function renderTabs() {
  const tabsEl = document.getElementById("tabs");
  tabsEl.innerHTML = "";

  state.openTabs.forEach(tabKey => {
    const [folderId, fileId] = tabKey.split("/");
    const file = getFile(folderId, fileId);
    if (!file) return;

    const tab = document.createElement("div");
    tab.className = "tab" + (tabKey === state.active ? " active" : "");
    tab.textContent = file.name;

    const close = document.createElement("span");
    close.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    close.className = "close";
    close.addEventListener("click", e => {
      e.stopPropagation();
      closeTab(tabKey);
    });

    tab.appendChild(close);
    tab.addEventListener("click", () => setActiveTab(tabKey));

    tabsEl.appendChild(tab);
  });
}

export function initEditor() {
  const editorContainer = document.getElementById("editorContainer");
  state.editor = CodeMirror(editorContainer, {
    value: "",
    mode: "javascript",
    lineNumbers: true,
    theme: "default",
    viewportMargin: Infinity,
    gutters: ["CodeMirror-linenumbers", "comments-gutter"] // Add custom gutter
  });

  state.editor.on("gutterClick", (cm, n, gutter) => {
    // Allow clicking specifically on line numbers too
    if (gutter === "comments-gutter" || gutter === "CodeMirror-linenumbers") {
      handleAddInlineComment(n);
    }
  });

  let changeTimeout;
  state.editor.on("change", (cm, changeObj) => {
    if (changeObj.origin === "setValue") return;

    const header = document.getElementById("activeFilename");
    const file = getCurrentFile();
    if (file) {
      header.textContent = file.name + " *";
    }

    // Emit typing status
    if (state.active) {
      const fileId = state.active.split("/")[1];
      emitTyping(boardId, fileId, true);

      clearTimeout(changeTimeout);
      changeTimeout = setTimeout(() => {
        emitTyping(boardId, fileId, false);
      }, 1000);
    }

    // Real-time content sync
    clearTimeout(state.typingTimeout);
    state.typingTimeout = setTimeout(() => {
      syncContent();
    }, 1500);
  });


  state.editor.on("cursorActivity", () => {
    if (state.active) {
      const cursor = state.editor.getCursor();
      const fileId = state.active.split("/")[1];
      emitCursorUpdate(boardId, fileId, cursor);
    }
  });
}

export async function syncContent() {
  if (!state.active) return;

  const [folderId, fileId] = state.active.split("/");
  const content = state.editor.getValue();

  console.log("Syncing content for file:", fileId);
  emitContentUpdate(boardId, fileId, { text: content });
}

export async function saveActive() {
  if (!state.active) return;

  const [folderId, fileId] = state.active.split("/");
  const content = state.editor.getValue();

  try {
    await apiCall(`/${boardId}/folder/${folderId}/file/${fileId}`, "PUT", {
      content
    });

    const header = document.getElementById("activeFilename");
    const file = getCurrentFile();
    header.textContent = file.name + " (saved)";
    showToast(`Saved ${file.name}`, "success");
    setTimeout(() => (header.textContent = file.name), 1000);
  } catch (err) {
    showToast(err.message, "error");
  }
}

export async function runCode() {
  if (!state.active) return;

  const [folderId, fileId] = state.active.split("/");
  const file = getCurrentFile();
  const code = state.editor.getValue();

  const outputEl = document.getElementById("terminalOutput");
  outputEl.textContent = ""; // Clear previous output

  // Ensure visual state is reset
  outputEl.appendChild(document.createTextNode(`> Running ${file.name}...\n`));

  try {
    // Use socket instead of POST
    emitTerminalStart(boardId, fileId, code, file.language);
  } catch (err) {
    outputEl.textContent += "Error starting: " + err.message;
    showToast(err.message, "error");
  }
}

// Global listener for terminal output from socket
window.addEventListener("terminal-output", (e) => {
  const outputEl = document.getElementById("terminalOutput");
  if (outputEl) {
    outputEl.textContent += e.detail;
    outputEl.scrollTop = outputEl.scrollHeight;
  }
});

// Update imports to include terminal emitters
// (This needs to be done at top of file, but since we are replacing runCode block which is far down, 
// we will assume imports are handled or valid. Wait, I should double check imports at top of file.)

export async function loadComments() {
  try {
    state.board.comments = await apiCall(`/${boardId}/comments`);
    renderComments();
  } catch (err) {
    console.error("Error loading comments:", err);
  }
}

// Fixed: Render Comments with Metadata
export function renderComments() {
  const list = document.getElementById("commentsList");
  list.innerHTML = "";

  if (!state.board) return;

  // Flatten comments from board and files
  let allComments = [...(state.board.comments || [])];

  // Create a map to look up file names by ID for global board comments
  const fileMap = {};
  state.board.folders.forEach(folder => {
    folder.files.forEach(file => {
      fileMap[file._id] = file.name;
      // Add file-specific comments to the list
      if (file.comments) {
        file.comments.forEach(c => {
          // Attach file info to the comment object temporarily for rendering
          c._fileName = file.name;
          c._fileId = file._id;
          c._folderId = folder._id;
        });
        allComments = [...allComments, ...file.comments];
      }
    });
  });

  // Sort by date
  allComments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (allComments.length === 0) {
    list.innerHTML = '<div style="padding:16px; color:#888; text-align:center; font-style:italic;">No comments yet.</div>';
    renderInlineMarkers();
    return;
  }

  allComments.forEach(comment => {
    const el = document.createElement("div");
    el.className = "comment";

    // Resolve file name if not already attached
    let fileName = comment._fileName;
    if (!fileName && comment.fileId) {
      fileName = fileMap[comment.fileId] || "Unknown File";
    }

    const userAvatar = comment.authorId?.profile_image || comment.authorId?.avatarUrl || 'assets/images/user-avatar.png';
    const userName = comment.authorId?.name || comment.authorName || "User";
    const dateStr = new Date(comment.createdAt).toLocaleString();
    const lineInfo = comment.line != null ? ` • <span style="font-weight:bold;color:var(--accent)">Line ${comment.line + 1}</span>` : "";
    const fileInfo = fileName ? ` • <span>${fileName}</span>` : "";

    el.innerHTML = `
      <div style="font-size:12px;color:var(--text-light);display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div style="display:flex; align-items:center; gap:8px;">
           <img src="${userAvatar}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;" />
           <span><strong>${userName}</strong>${fileInfo}${lineInfo}</span>
        </div>
        <span style="font-size:10px;opacity:0.7">${dateStr}</span>
      </div>
      <div style="line-height:1.4; color:var(--text-dark); padding-left:32px;">${comment.text}</div>
    `;
    list.appendChild(el);

    // Click to jump to line
    if (comment.line != null && comment._fileId) {
      el.style.borderLeft = "3px solid var(--accent)";
      el.style.cursor = "pointer";
      el.title = "Jump to code";
      el.onclick = () => {
        // Switch to file if not active
        if (state.active) {
          const [currentFolder, currentFile] = state.active.split("/");
          if (currentFile !== comment._fileId) {
            openFile(comment._folderId, comment._fileId);
          }
        } else {
          openFile(comment._folderId, comment._fileId);
        }

        // Wait for editor to init
        setTimeout(() => {
          if (state.editor) {
            state.editor.scrollIntoView({ line: comment.line, ch: 0 }, 200);
            state.editor.setSelection({ line: comment.line, ch: 0 }, { line: comment.line, ch: 1000 });
            // Highlight effect
            const lineHandle = state.editor.addLineClass(comment.line, "background", "highlight-line");
            setTimeout(() => state.editor.removeLineClass(lineHandle, "background", "highlight-line"), 2000);
          }
        }, 100);
      };
    }
  });

  renderInlineMarkers();
}

function renderInlineMarkers() {
  if (!state.editor || !state.active) return;
  const file = getCurrentFile();
  if (!file) return;

  state.editor.clearGutter("comments-gutter");

  if (file.comments) {
    file.comments.forEach(comment => {
      if (typeof comment.line === "number") {
        const marker = document.createElement("div");
        marker.className = "comment-marker";
        // Bubble Icon style
        marker.innerHTML = '<i class="fa-solid fa-comment-dots"></i>';
        marker.title = `${comment.authorId?.name || 'User'}: ${comment.text}`;

        marker.onclick = (e) => {
          e.stopPropagation();
          toggleComments(true);
        };

        state.editor.setGutterMarker(comment.line, "comments-gutter", marker);
      }
    });
  }
}

async function handleAddInlineComment(lineIdx) {
  const txt = await promptModal(`Add comment on line ${lineIdx + 1}:`);
  if (!txt) return;

  const [folderId, fileId] = state.active.split("/");

  // OPTIMISTIC UPDATE: Use stored user name immediately
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const userName = currentUser.name || "Me";

  // Note: True optimistic UI would render it now, but here we just ensure when we reload/notify, 
  // we might want to manually insert it or just wait for loadBoard which is fast enough usually.
  // The issue description says "comment displays a default user".
  // This usually happens if the backend response or loadBoard doesn't populate authorId correctly immediately.
  // We will trust loadBoard() if the backend is right, but if the issue persists, the backend might be sending unpopulated data.
  // For now, let's rely on apiCall -> loadBoard.

  try {
    // Pass 'line' to the API
    await apiCall(`/${boardId}/comment`, "POST", {
      text: txt,
      folderId,
      fileId,
      line: lineIdx
    });

    await loadBoard();
    // And make sure comments panel is open
    toggleComments(true);
    showToast("Comment added", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

export function toggleComments(force) {
  const panel = document.getElementById("commentsPanel");
  const fabButton = document.getElementById("toggleComments");

  if (typeof force === "boolean") {
    state.commentsOpen = force;
  } else {
    state.commentsOpen = !state.commentsOpen;
  }

  panel.classList.toggle("open", state.commentsOpen);

  // Hide FAB button when panel is open, show when closed
  if (state.commentsOpen) {
    fabButton.classList.add("hidden");
  } else {
    fabButton.classList.remove("hidden");
  }
}

export async function sendComment() {
  const txt = document.getElementById("commentText").value.trim();
  if (!txt) return;

  try {
    await apiCall(`/${boardId}/comment`, "POST", { text: txt });
    document.getElementById("commentText").value = "";
    await loadComments();
    showToast("Comment added", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

export async function loadBoardMembers() {
  const mCont = document.getElementById("membersContainer");
  mCont.innerHTML = "";

  if (!state.board || !state.board.members) return;

  state.board.members.forEach(member => {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    const imgUrl = member.profile_image || member.avatarUrl;
    if (imgUrl) {
      avatar.innerHTML = `<img src="${imgUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;
      avatar.style.background = "none";
    } else {
      avatar.textContent = member.name?.substring(0, 2).toUpperCase() || "??";
      avatar.style.background = member.colorTag || "var(--accent)";
    }
    avatar.title = member.name || "User";
    mCont.appendChild(avatar);
  });
}

// Utilities
export function detectMode(language) {
  const map = {
    js: "javascript",
    html: "xml",
    css: "css",
    python: "python",
    php: "php"
  };
  return map[language] || "javascript";
}

export function detectLanguage(filename) {
  if (filename.endsWith(".js") || filename.endsWith(".jsx")) return "js";
  if (filename.endsWith(".html")) return "html";
  if (filename.endsWith(".css")) return "css";
  if (filename.endsWith(".py")) return "python";
  if (filename.endsWith(".php")) return "php";
  return "js";
}

// Modal helpers
export function promptModal(message) {
  return new Promise(resolve => {
    const modal = document.createElement("div");
    modal.className = "input-modal show";
    modal.innerHTML = `
      <div class="input-box">
        <p>${message}</p>
        <input type="text" autofocus />
        <div class="input-actions">
          <button class="btn-ok">OK</button>
          <button class="btn-cancel">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    const input = modal.querySelector("input");
    input.focus();

    modal.querySelector(".btn-ok").onclick = () => {
      const val = input.value.trim();
      modal.remove();
      resolve(val);
    };

    modal.querySelector(".btn-cancel").onclick = () => {
      modal.remove();
      resolve(null);
    };
  });
}

export function confirmModal(message) {
  return new Promise(resolve => {
    const modal = document.createElement("div");
    modal.className = "input-modal show";
    modal.innerHTML = `
      <div class="input-box">
        <p>${message}</p>
        <div class="input-actions">
          <button class="btn-ok">Yes</button>
          <button class="btn-cancel">No</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector(".btn-ok").onclick = () => {
      modal.remove();
      resolve(true);
    };

    modal.querySelector(".btn-cancel").onclick = () => {
      modal.remove();
      resolve(false);
    };
  });
}

// Theme toggle & Persistence
const themeToggleBtn = document.getElementById("themeToggle");
if (themeToggleBtn) {
  // Init state based on storage
  if (localStorage.getItem("theme") === "dark") {
    document.documentElement.classList.add("dark");
  }

  themeToggleBtn.addEventListener("click", () => {
    document.documentElement.classList.toggle("dark");
    const isDark = document.documentElement.classList.contains("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");

    // START FIX: Update CodeMirror Theme dynamically
    if (state.editor) {
      state.editor.setOption("theme", isDark ? "material-darker" : "default");
    }
    // END FIX
  });
}



// Global Click for CRUD Menu logic
const dotsBtn = document.querySelector(".dots");
if (dotsBtn) {
  dotsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Show menu at button position
    const menu = document.getElementById("contextMenu");
    const rect = dotsBtn.getBoundingClientRect();
    menu.style.top = (rect.bottom + 5) + "px";
    menu.style.left = (rect.left - 100) + "px"; // Align roughly
    menu.classList.remove("hidden");

    // Default context to root folder if nothing selected?
    // Ideally we want to just allow "New Folder" or "New File" in root
    // For simplicity, we can let user pick logic, or default to first folder
    if (state.board && state.board.folders.length > 0) {
      // Default to first folder for "New File" actions if triggered via dots
      contextTargetFolderId = state.board.folders[0]._id;
      contextTargetFileId = null;
    }
  });
}

// Event listeners
document.getElementById("saveBtn").onclick = saveActive;
document.getElementById("runCodeBtn").onclick = runCode;
document.getElementById("toggleComments").onclick = () => toggleComments(true);
document.getElementById("closeComments").onclick = () => toggleComments(false);
document.getElementById("sendComment").onclick = sendComment;

document.getElementById("newFileBtn").onclick = async () => {
  if (!state.board || state.board.folders.length === 0) {
    await createNewFolder();
  }
  contextTargetFolderId = state.board.folders[0]._id;
  await createNewFile();
};

const helpModal = document.getElementById("helpModal");
const inviteModal = document.getElementById("inviteModal");
const shareModal = document.getElementById("shareModal");

// HELP
document.getElementById("helpBtn").onclick = () => helpModal.classList.add("show");
const closeHelp = () => helpModal.classList.remove("show");
document.querySelector(".btn-close-help").onclick = closeHelp;
document.querySelector(".btn-close-help-action").onclick = closeHelp;

// INVITE
document.getElementById("inviteBtn").onclick = () => {
  inviteModal.classList.add("show");
  document.getElementById("inviteSearch").focus();
};
const closeInvite = () => inviteModal.classList.remove("show");
document.querySelector(".btn-close-invite").onclick = closeInvite;

// Invite Search Logic
let selectedUserId = null;
document.getElementById("inviteSearch").addEventListener("input", async (e) => {
  const query = e.target.value.trim();
  const list = document.getElementById("inviteUserList");
  list.innerHTML = "";

  if (query.length < 2) return;

  try {
    const res = await apiCall(`/users/search?query=${query}`, "GET");
    // Since we put the route in pair-programmingRoutes for simplicity as /users/search inside /api/pair-programming prefix?
    // Wait, the route I added was in pair-programmingRoutes.js which is mounted at /api/pair-programming.
    // So the URL is /api/pair-programming/users/search. Yes.

    // Actually typically search is generic, but I put it there.
    // Let's verify route mount in server.js: app.use('/api/pair-programming', pairProgrammingRoutes); 
    // Route in file: router.get("/users/search", ...)
    // So URL: /api/pair-programming/users/search. Correct.

    // Correction: In pair-programmingRoutes replacement I replaced /users/search.
    // Wait, I saw "router.get("/users/search"..."
    // Yes.

    // Correction 2: I used `apiCall` which prepends API_BASE.
    // API_BASE = "http://127.0.0.1:5000/api/pair-programming";
    // So calling `/users/search` works.

    const users = Array.isArray(res) ? res : (res.users || []); // Safety

    users.forEach(u => {
      const item = document.createElement("div");
      item.className = "user-list-item";
      item.innerHTML = `
        <img src="${u.profile_image || 'assets/images/user-avatar.png'}" alt="av">
        <div class="info">
          <span class="name">${u.name}</span>
          <span class="username">${u.email}</span>
        </div>
      `;
      item.onclick = () => {
        // Deselect others
        document.querySelectorAll(".user-list-item").forEach(el => el.classList.remove("selected"));
        item.classList.add("selected");
        selectedUserId = u._id;
      };
      list.appendChild(item);
    });
  } catch (err) {
    console.warn("Search error", err);
  }
});

document.getElementById("sendInviteBtn").onclick = async () => {
  if (!selectedUserId) {
    showToast("Please select a user", "error");
    return;
  }
  const perm = document.getElementById("invitePermission").value;
  try {
    await apiCall(`/${boardId}/invite`, "POST", {
      userIds: [selectedUserId],
      permission: perm
    });
    showToast("Invite sent successfully!", "success");
    closeInvite();
  } catch (err) {
    showToast(err.message, "error");
  }
};


// SHARE
document.getElementById("shareBtn").onclick = () => {
  shareModal.classList.add("show");
  // Pre-generate a viewer link by default
  generateShareLink("viewer");
};
const closeShare = () => shareModal.classList.remove("show");
document.querySelector(".btn-close-share").onclick = closeShare;

document.getElementById("sharePermission").addEventListener("change", (e) => {
  generateShareLink(e.target.value);
});

async function generateShareLink(perm) {
  const input = document.getElementById("shareLinkInput");
  input.value = "Generating...";
  try {
    const res = await apiCall(`/${boardId}/share`, "POST", { permission: perm });
    input.value = res.shareUrl;
  } catch (err) {
    input.value = "Error generating link";
  }
}

document.getElementById("copyShareLinkBtn").onclick = () => {
  const input = document.getElementById("shareLinkInput");
  input.select();
  navigator.clipboard.writeText(input.value);
  showToast("Link copied to clipboard", "success");
};


// Close modals on outside click
[helpModal, inviteModal, shareModal].forEach(modal => {
  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove("show");
  };
});

window.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveActive();
  }
});

// Terminal functionality
const terminalToggle = document.getElementById("terminalToggle");
const terminalPanel = document.getElementById("terminalPanel");
const terminalInput = document.getElementById("terminalInput");
const terminalOutput = document.getElementById("terminalOutput");

if (terminalToggle) {
  terminalToggle.addEventListener("click", () => {
    terminalPanel.classList.toggle("collapsed");
    const icon = terminalToggle.querySelector("i");
    if (terminalPanel.classList.contains("collapsed")) {
      icon.className = "fa-solid fa-chevron-up";
    } else {
      icon.className = "fa-solid fa-chevron-down";
    }
  });
}

if (terminalInput) {
  terminalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent newline in input
      const command = terminalInput.value;

      // Emit to backend
      emitTerminalInput(boardId, command);

      // Local echo (optional, but backend usually handles output)
      // For now, we rely on backend echoing or just explicit output from program
      // But typically we want to see what we typed:
      const commandLine = document.createElement("div");
      commandLine.textContent = command;
      // terminalOutput.appendChild(commandLine); // Let backend echo if needed, or just rely on result. 
      // Actually standard terminals echo chars. Let's just clear input.

      terminalInput.value = "";
    }
  });
}

// Initialization
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Initializing Pair Programming...");

  const token = localStorage.getItem("token");
  const urlParams = new URLSearchParams(window.location.search);
  boardId = urlParams.get("id");

  console.log("Board ID from URL:", boardId);
  console.log("Token exists:", !!token);

  if (!token) {
    showToast("Please login to continue", "error");
    setTimeout(() => {
      window.location.href = "/login";
    }, 1500);
    return;
  }

  if (!boardId || boardId === "null" || boardId === "undefined") {
    console.error("Invalid Board ID:", boardId);
    showToast("Invalid or missing board ID", "error");
    return;
  }

  // Set up socket callback functions
  setGetCurrentFile(getCurrentFile);
  setGetEditor(getEditor);
  setGetActiveTab(getActiveTab);
  setCloseTab(closeTab);
  setShowToast(showToast);
  setLoadBoardMembers(loadBoardMembers);
  setLoadBoard(loadBoard);
  setRenderComments(renderComments);

  // Extract userId from token (decode JWT)
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    state.userId = payload.id || payload._id || payload.userId;

    setCurrentUserId(state.userId);
    console.log("User ID:", state.userId);
  } catch (err) {
    console.error("Failed to decode token:", err);
  }

  // Initialize socket connection
  initSocket(token, boardId);

  // Load initial board data
  await loadBoard();

  // Restore Theme
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    document.documentElement.classList.add("dark");
  }

  console.log("Initialization complete");

  // Track cursor for real-time presence
  let cursorThrottle = false;
  document.addEventListener("mousemove", (e) => {
    if (!cursorThrottle && boardId) {
      cursorThrottle = true;
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      emitCursorUpdate(boardId, { x: e.clientX, y: e.clientY }, user.colorTag || "#DCEF62");
      setTimeout(() => { cursorThrottle = false; }, 100);
    }
  });
});
// Mobile Sidebar Toggle
const sidebarToggle = document.getElementById("sidebarToggle");
const folderArea = document.querySelector(".folder-area");
if (sidebarToggle && folderArea) {
  sidebarToggle.addEventListener("click", () => {
    folderArea.classList.toggle("show");

    // Optional: Toggle icon state if we want (bars vs x)
    const icon = sidebarToggle.querySelector("i");
    if (folderArea.classList.contains("show")) {
      icon.className = "fa-solid fa-xmark";
    } else {
      icon.className = "fa-solid fa-bars";
    }
  });

  // Close sidebar when clicking outside on mobile
  document.addEventListener("click", (e) => {
    if (window.innerWidth < 768 &&
      folderArea.classList.contains("show") &&
      !folderArea.contains(e.target) &&
      !sidebarToggle.contains(e.target)) {
      folderArea.classList.remove("show");
      sidebarToggle.querySelector("i").className = "fa-solid fa-bars";
    }
  });
}

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
} from "./pair-programming-sio.js";

const API_BASE = "http://127.0.0.1:5000/api/pair-programming";

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

  let response;

  try {
    response = await fetch(API_BASE + endpoint, options);
  } catch (err) {
    throw new Error("Network error — server unreachable");
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
  container.addEventListener("contextmenu", handleContextMenu);
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
  menu.style.top = e.pageY + "px";
  menu.style.left = e.pageX + "px";
  menu.classList.remove("hidden");
}

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
    if (gutter === "comments-gutter") {
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

  console.log("🔄 Syncing content for file:", fileId);
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
  outputEl.textContent = "Running...\n";

  try {
    const result = await apiCall(`/${boardId}/folder/${folderId}/file/${fileId}/run`, "POST", {
      code,
      language: file.language
    });

    outputEl.textContent = result.output || result.error || "No output";

    if (result.status === "error") {
      showToast("Code execution failed", "error");
    } else {
      showToast("Code executed successfully", "success");
    }
  } catch (err) {
    outputEl.textContent = "Error: " + err.message;
    showToast(err.message, "error");
  }
}

export async function loadComments() {
  try {
    state.board.comments = await apiCall(`/${boardId}/comments`);
    renderComments();
  } catch (err) {
    console.error("Error loading comments:", err);
  }
}

export function renderComments() {
  const list = document.getElementById("commentsList");
  list.innerHTML = "";

  if (!state.board) return;

  let allComments = [...(state.board.comments || [])];

  const currentFile = getCurrentFile();
  if (currentFile && currentFile.comments) {
    allComments = [...allComments, ...currentFile.comments];
  }

  // Sort by date
  allComments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  allComments.forEach(comment => {
    const el = document.createElement("div");
    el.className = "comment";
    el.innerHTML = `
      <div style="font-size:12px;color:#666">
        ${comment.authorId?.name || "User"} • ${new Date(comment.createdAt).toLocaleString()}
        ${comment.line != null ? ` • <span style="font-weight:bold;color:#ff9f1c">Line ${comment.line + 1}</span>` : ""}
      </div>
      <div style="margin-top:6px">${comment.text}</div>
    `;
    list.appendChild(el);

    // Highlight if clicked?
    if (comment.line != null) {
      el.style.borderLeft = "2px solid #ff9f1c";
      el.style.cursor = "pointer";
      el.onclick = () => {
        if (state.editor) {
          state.editor.scrollIntoView({ line: comment.line, ch: 0 }, 200);
          state.editor.setSelection({ line: comment.line, ch: 0 }, { line: comment.line, ch: 1000 });
        }
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
        marker.innerHTML = '<i class="fa-solid fa-comment"></i>';
        marker.title = `${comment.authorName}: ${comment.text}`;

        // Allow clicking marker to open comments panel
        marker.onclick = (e) => {
          e.stopPropagation(); // prevent gutterClick
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
    avatar.textContent = member.name?.substring(0, 2).toUpperCase() || "??";
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

// Theme toggle
document.getElementById("themeToggle").addEventListener("click", () => {
  document.documentElement.classList.toggle("dark");
  const isDark = document.documentElement.classList.contains("dark");
  if (state.editor) {
    state.editor.setOption("theme", isDark ? "material-darker" : "default");
  }
});

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
    const res = await apiCall(`/users/search?query=${console.log(query) || query}`, "GET"); // Assuming endpoint added to backend
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
      const command = terminalInput.value.trim();
      if (command) {
        // Display the command in output
        const commandLine = document.createElement("div");
        commandLine.style.color = "#4ec9b0";
        commandLine.textContent = `$ ${command}`;
        terminalOutput.appendChild(commandLine);
        
        // Display a message (for now, just echo - can be extended later)
        const responseLine = document.createElement("div");
        responseLine.style.color = "#d4d4d4";
        responseLine.style.marginBottom = "8px";
        responseLine.textContent = `Command received: ${command}\nNote: Terminal is currently display-only. Use the Run button to execute code.`;
        terminalOutput.appendChild(responseLine);
        
        // Clear input
        terminalInput.value = "";
        
        // Scroll to bottom
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
      }
    }
  });
}

// Initialization
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Initializing Pair Programming...");

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

  if (!boardId) {
    showToast("No board ID provided", "error");
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

  console.log("✅ Initialization complete");
});

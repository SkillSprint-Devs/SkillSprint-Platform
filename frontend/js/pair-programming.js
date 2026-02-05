// js/pair-programming.js
import {
  initSocket,
  setLoadBoardMembers,
  setLoadBoard,
  setRenderComments,
  setOnlineUserIds,
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

const API_BASE = `${window.API_BASE_URL}/pair-programming`;

const state = {
  board: null,
  openTabs: [],
  active: null,
  editor: null,
  commentsOpen: false,
  typingTimeout: null,
  userId: null,
  onlineUserIds: new Set(),
  myRole: 'navigator', // driver or navigator
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
  if (typeof window.showToast === 'function') {
    window.showToast(message, type, duration);
  } else {
    // Fallback if toast.js isn't loaded for some reason
    console.log(`[Proxy Toast] ${type}: ${message}`);
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.style.cssText = "position:fixed; bottom:20px; right:20px; z-index:9999; background:#333; color:#fff; padding:10px;";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }
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
    state.board = await apiCall(`/${boardId}`);

    renderFileTree();
    loadBoardMembers();
    await loadComments();

    // PERSISTENCE: Check if we have a saved active tab or if it's already set
    const savedActive = localStorage.getItem(`pp_active_tab_${boardId}`);
    if (state.active) {
      // Stay on current file if already active (prevents switching on save/remote update)
      const [fId, flId] = state.active.split("/");
      const stillExists = getFile(fId, flId);
      if (stillExists) {
        setActiveTab(state.active);
      } else {
        state.active = null;
      }
    } else if (savedActive) {
      const [fId, flId] = savedActive.split("/");
      const exists = getFile(fId, flId);
      if (exists) {
        setActiveTab(savedActive);
      } else {
        localStorage.removeItem(`pp_active_tab_${boardId}`);
      }
    }

    // Default to first file only if NOTHING is active and nothing was restored
    if (!state.active && state.board.folders.length > 0 && state.board.folders[0].files.length > 0) {
      const firstFile = state.board.folders[0].files[0];
      openFile(state.board.folders[0]._id, firstFile._id);
    }

    const projectNameEl = document.getElementById("projectName");
    if (projectNameEl) {
      projectNameEl.textContent = state.board.name || "Pair Programming";

      // Add Role Badge
      const ownerId = (state.board.owner?._id || state.board.owner).toString();
      const myId = state.userId;
      const me = state.board.members.find(m => {
        const uId = m.user?._id || m.user || m;
        return (uId._id || uId).toString() === myId;
      });

      if (me) {
        state.myRole = me.role;
      } else if (myId === ownerId) {
        state.myRole = 'driver';
      } else {
        state.myRole = 'navigator';
      }

      let badge = document.getElementById("roleBadge");
      if (!badge) {
        badge = document.createElement("span");
        badge.id = "roleBadge";
        badge.style.cssText = "margin-left:12px; font-size:0.75rem; padding:2px 8px; border-radius:12px; font-weight:700; text-transform:uppercase;";
        projectNameEl.parentElement.appendChild(badge);
      }

      const existingBtn = document.getElementById("roleActionBtn");
      if (existingBtn) existingBtn.remove();

      if (state.myRole === 'driver') {
        badge.textContent = "Driver";
        badge.style.background = "#DCEF62";
        badge.style.color = "#000";
        if (state.editor) state.editor.setOption("readOnly", false);
      } else {
        badge.textContent = "Navigator";
        badge.style.background = "rgba(255,255,255,0.1)";
        badge.style.color = "rgba(255,255,255,0.6)";
        if (state.editor) state.editor.setOption("readOnly", "nocursor");

        // Action Button: Request (Collaborator) or Take (Owner)
        const actionBtn = document.createElement("button");
        actionBtn.id = "roleActionBtn";
        actionBtn.style.cssText = "margin-left:12px; border:1px solid #DCEF62; color:#DCEF62; font-size:0.75rem; padding:4px 10px; border-radius:12px; font-weight:700; cursor:pointer; background:transparent;";

        if (myId === ownerId) {
          actionBtn.innerHTML = '<i class="fa-solid fa-crown"></i> Become Driver';
          actionBtn.addEventListener("click", async () => {
            const confirmed = typeof showCustomConfirm === 'function'
              ? await showCustomConfirm("Become Driver?", "You are the owner. You can take control at any time.")
              : confirm("Become Driver?");

            if (confirmed) swapRoles(myId);
          });
          badge.parentElement.appendChild(actionBtn);
        } else {
          actionBtn.innerHTML = '<i class="fa-solid fa-hand"></i> Request to Drive';
          actionBtn.addEventListener("click", async () => {
            // Optional: You can skip confirm for simple requests or add a light one
            const confirmed = typeof showCustomConfirm === 'function'
              ? await showCustomConfirm("Request Driver Role?", "The owner will receive your request.")
              : confirm("Request Driver Role?");

            if (confirmed) requestDriverRole();
          });
          badge.parentElement.appendChild(actionBtn);
        }
      }
    }
  } catch (err) {
    console.error("Error loading board:", err);
    showToast(err.message, "error");
  }
}

export function renderFileTree() {
  const container = document.getElementById("fileTree");
  container.innerHTML = "";

  if (!state.board || !state.board.folders) return;

  // Persistence Key
  const storageKey = `folderState_${boardId}`;
  let folderState = {};
  try {
    folderState = JSON.parse(localStorage.getItem(storageKey)) || {};
  } catch (e) { console.error("Error parsing folder state", e); }

  // Check if board is empty
  const hasFiles = state.board.folders.some(folder => folder.files && folder.files.length > 0);

  if (!hasFiles && state.board.folders.length === 0) {
    // Show empty state
    container.innerHTML = `
      <div class="file-tree-empty">
        <i class="fa-solid fa-folder-open"></i>
        <h3>No Files Yet</h3>
        <p>Create your first file or folder to start collaborating</p>
        <button class="btn accent" onclick="document.getElementById('addFileBtn').click()">
          <i class="fa-solid fa-plus"></i> Create File
        </button>
      </div>
    `;
    return;
  }

  const ul = document.createElement("ul");
  ul.style.padding = "0";

  state.board.folders.forEach(folder => {
    const folderLi = document.createElement("li");
    folderLi.style.listStyle = "none";

    // Determine state (default to open if not set)
    const isOpen = folderState[folder._id] !== false; // stored as boolean
    const folderIconClass = isOpen ? "fa-folder-open" : "fa-folder";

    const folderRow = document.createElement("div");
    folderRow.className = "folder";
    if (contextTargetFolderId === folder._id) {
      folderRow.classList.add("selected");
    }
    folderRow.innerHTML = `<i class="fa-solid ${folderIconClass}"></i><span>${folder.name}</span>`;
    folderRow.setAttribute("data-folder-id", folder._id);
    folderRow.style.cursor = "pointer";

    const childContainer = document.createElement("div");
    childContainer.style.paddingLeft = "12px";
    // Toggle visibility based on state
    if (!isOpen) {
      childContainer.classList.add("hidden");
    }

    folder.files.forEach(file => {
      const fileLi = document.createElement("li");
      fileLi.style.listStyle = "none";

      const fileRow = document.createElement("div");
      fileRow.className = "file";

      // Detect file extension
      const ext = file.name.split('.').pop().toLowerCase();
      fileRow.setAttribute("data-ext", ext);

      // Get appropriate icon
      const iconMap = {
        'js': 'fa-brands fa-js',
        'jsx': 'fa-brands fa-react',
        'py': 'fa-brands fa-python',
        'html': 'fa-brands fa-html5',
        'css': 'fa-brands fa-css3-alt',
        'json': 'fa-solid fa-brackets-curly',
        'md': 'fa-solid fa-file-lines',
        'txt': 'fa-solid fa-file-lines',
        'php': 'fa-brands fa-php'
      };

      const iconClass = iconMap[ext] || 'fa-solid fa-file-code';

      fileRow.innerHTML = `<i class="${iconClass}"></i><span>${file.name}</span>`;
      fileRow.setAttribute("data-folder-id", folder._id);
      fileRow.setAttribute("data-file-id", file._id);

      fileRow.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent folder click
        openFile(folder._id, file._id);
      });

      fileLi.appendChild(fileRow);
      childContainer.appendChild(fileLi);
    });

    // Toggle & Select Logic
    folderRow.addEventListener("click", () => {
      // 1. Selection Logic: Update contextTargetFolderId & Visuals
      contextTargetFolderId = folder._id;

      const allFolders = container.querySelectorAll(".folder");
      allFolders.forEach(el => el.classList.remove("selected"));
      folderRow.classList.add("selected");

      // 2. Toggle Logic
      const isHidden = childContainer.classList.toggle("hidden");
      const icon = folderRow.querySelector("i");

      // Update icon
      if (isHidden) {
        icon.classList.remove("fa-folder-open");
        icon.classList.add("fa-folder");
      } else {
        icon.classList.remove("fa-folder");
        icon.classList.add("fa-folder-open");
      }

      // Persist State
      folderState[folder._id] = !isHidden;
      localStorage.setItem(storageKey, JSON.stringify(folderState));
    });

    folderLi.appendChild(folderRow);
    folderLi.appendChild(childContainer);
    ul.appendChild(folderLi);
  });

  container.appendChild(ul);
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
    showToast("Please select a folder first", "error");
    return;
  }

  const name = await promptModal("Enter file name:");
  if (!name) return;

  // Duplicate Check
  const targetFolder = state.board.folders.find(f => f._id === contextTargetFolderId);
  if (targetFolder) {
    const exists = targetFolder.files.some(f => f.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      showToast(`File "${name}" already exists in this folder.`, "error");
      return;
    }
  }

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
  const confirmed = typeof window.showCustomConfirm === 'function'
    ? await window.showCustomConfirm("Are you sure you want to delete this?")
    : window.confirm("Are you sure you want to delete this?");

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
  // Save to persistence
  if (boardId) {
    localStorage.setItem(`pp_active_tab_${boardId}`, tabKey);
  }

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

  // Determine initial theme based on global class
  const isDark = document.documentElement.classList.contains("dark") || localStorage.getItem("theme") === "dark";
  const initialTheme = isDark ? "material-darker" : "default";

  state.editor = CodeMirror(editorContainer, {
    value: "",
    mode: "javascript",
    lineNumbers: true,
    theme: initialTheme,
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
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      emitCursorUpdate(boardId, fileId, cursor, user?.colorTag);
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
    list.innerHTML = `
      <div class="comments-empty">
        <i class="fa-solid fa-comments"></i>
        <h3>No Comments Yet</h3>
        <p>Start a discussion by adding a comment below or clicking on a line number in the editor</p>
      </div>
    `;
    renderInlineMarkers();
    return;
  }

  allComments.forEach(comment => {
    const el = document.createElement("div");
    el.className = "comment";
    el.setAttribute("data-comment-id", comment._id);

    // Resolve file name if not already attached
    let fileName = comment._fileName;
    if (!fileName && comment.fileId) {
      fileName = fileMap[comment.fileId] || "Unknown File";
    }

    const userAvatar = comment.authorId?.profile_image || comment.authorId?.avatarUrl || 'assets/images/user-avatar.png';
    const userName = comment.authorId?.name || comment.authorName || "User";
    const dateStr = new Date(comment.createdAt).toLocaleString();
    const lineInfo = comment.line != null ? `<span class="comment-line-badge">Line ${comment.line + 1}</span>` : "";
    const fileInfo = fileName ? `<span class="comment-meta-file">${fileName}</span>` : "";

    // Check if current user is the comment author
    const isAuthor = comment.authorId?._id === state.userId || comment.authorId === state.userId;
    const actionButtons = isAuthor ? `
      <div class="comment-actions">
        <button class="comment-action-btn edit-comment" title="Edit comment">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button class="comment-action-btn delete-comment" title="Delete comment">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    ` : '';

    el.innerHTML = `
      <div class="comment-header">
        <div class="comment-author">
          <img src="${userAvatar}" alt="${userName}" style="border: 2px solid ${comment.authorId?.colorTag || '#8C52FF'};" />
          <div>
            <strong style="color: ${comment.authorId?.colorTag || '#333'};">${userName}</strong>
            <div class="comment-meta">
              ${fileInfo}
              ${lineInfo}
              <span>${dateStr}</span>
            </div>
          </div>
        </div>
        ${actionButtons}
      </div>
      <div class="comment-text" style="line-height:1.5; color:var(--text-dark); margin-top:8px; padding-left:40px;">${comment.text}</div>
    `;
    list.appendChild(el);

    // Edit functionality
    const editBtn = el.querySelector(".edit-comment");
    if (editBtn) {
      editBtn.onclick = (e) => {
        e.stopPropagation();
        const textDiv = el.querySelector(".comment-text");
        const currentText = comment.text;

        textDiv.innerHTML = `
          <textarea class="comment-edit-input" style="width: 100%; min-height: 60px; padding: 8px; border-radius: 6px; border: 2px solid var(--accent); font-family: inherit; font-size: 14px;">${currentText}</textarea>
          <div style="margin-top: 8px; display: flex; gap: 8px;">
            <button class="btn small accent save-edit">Save</button>
            <button class="btn small cancel-edit">Cancel</button>
          </div>
        `;

        const saveBtn = textDiv.querySelector(".save-edit");
        const cancelBtn = textDiv.querySelector(".cancel-edit");
        const textarea = textDiv.querySelector(".comment-edit-input");

        saveBtn.onclick = async () => {
          const newText = textarea.value.trim();
          if (!newText) {
            showToast("Comment cannot be empty", "error");
            return;
          }

          try {
            await apiCall(`/${boardId}/comments/${comment._id}`, "PUT", { text: newText });
            comment.text = newText;
            textDiv.innerHTML = newText;
            showToast("Comment updated", "success");
          } catch (err) {
            showToast(err.message, "error");
          }
        };

        cancelBtn.onclick = () => {
          textDiv.innerHTML = currentText;
        };
      };
    }

    // Delete functionality
    const deleteBtn = el.querySelector(".delete-comment");
    if (deleteBtn) {
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();

        // Safety check for showCustomConfirm (ensure it's defined in window)
        const confirmed = typeof window.showCustomConfirm === 'function'
          ? await window.showCustomConfirm("Are you sure you want to delete this comment?")
          : window.confirm("Are you sure you want to delete this comment?");

        if (!confirmed) return;

        try {
          await apiCall(`/${boardId}/comments/${comment._id}`, "DELETE");

          // Defensive removal: ensure element exists and is in the list
          try {
            if (el && el.parentNode) {
              el.parentNode.removeChild(el);
            }
          } catch (domErr) {
            console.warn('DOM cleanup skipped:', domErr);
            // Element might have been removed by a remote sync already
          }

          showToast("Comment deleted", "success");

          // Remove from state
          const index = allComments.indexOf(comment);
          if (index > -1) allComments.splice(index, 1);
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    }

    // Click to jump to line
    if (comment.line != null && comment._fileId) {
      const textDiv = el.querySelector(".comment-text");
      textDiv.style.cursor = "pointer";
      textDiv.title = "Jump to code";
      textDiv.onclick = () => {
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

  if (file.comments && file.comments.length > 0) {
    // Group comments by line
    const commentsByLine = {};
    file.comments.forEach(comment => {
      // Use loose check for line to allow 0 and handle potential string/number mismatch
      if (comment.line != null) {
        const lineVal = Number(comment.line);
        if (!isNaN(lineVal)) {
          if (!commentsByLine[lineVal]) commentsByLine[lineVal] = [];
          commentsByLine[lineVal].push(comment);
        }
      }
    });

    for (const [line, comments] of Object.entries(commentsByLine)) {
      const container = document.createElement("div");
      container.className = "comment-marker-container";
      container.style.display = "flex";
      container.style.gap = "4px";
      container.style.alignItems = "center";
      container.style.justifyContent = "center";
      container.style.height = "100%";
      container.style.cursor = "pointer";

      // Group by user to show unique markers per user on that line
      const usersOnLine = {};
      comments.forEach(c => {
        const uId = c.authorId?._id || c.authorId || "unknown";
        if (!usersOnLine[uId]) usersOnLine[uId] = {
          name: c.authorId?.name || c.authorName || "User",
          color: c.authorId?.colorTag || "#8C52FF",
          count: 0,
          text: ""
        };
        usersOnLine[uId].count++;
        usersOnLine[uId].text += `- ${c.text}\n`;
      });

      Object.values(usersOnLine).forEach(uData => {
        const marker = document.createElement("div");
        marker.className = "comment-marker-bubble";
        marker.style.width = "12px";
        marker.style.height = "12px";
        marker.style.borderRadius = "50%";
        marker.style.backgroundColor = uData.color;
        marker.style.border = "2px solid rgba(0,0,0,0.1)";
        marker.style.boxShadow = "0 1px 3px rgba(0,0,0,0.2)";
        marker.title = `${uData.name} (${uData.count} comment${uData.count > 1 ? 's' : ''}):\n${uData.text}`;

        marker.onclick = (e) => {
          e.stopPropagation();
          toggleComments(true);
          // Highlight the comments in the sidebar if possible
          const sidebarScroll = document.getElementById("commentsList");
          if (sidebarScroll) {
            // Find first comment by this user on this line
            const match = comments.find(c => (c.authorId?._id || c.authorId) === Object.keys(usersOnLine).find(id => usersOnLine[id] === uData));
            if (match) {
              const el = document.querySelector(`.comment[data-comment-id="${match._id}"]`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        };

        container.appendChild(marker);
      });

      state.editor.setGutterMarker(Number(line), "comments-gutter", container);
    }
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

export async function swapRoles(targetUserId) {
  try {
    const res = await apiCall(`/${boardId}/swap-roles`, "POST", { targetUserId });
    if (res.success) {
      showToast("Roles reassigned!", "success");
      await loadBoard();
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

export async function requestDriverRole() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const res = await apiCall(`/${boardId}/request-driver`, "POST", {
      userId: state.userId,
      userName: user.name || "A collaborator"
    });
    if (res.success) {
      showToast("Request sent to owner", "success");
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

export async function loadBoardMembers() {
  const container = document.getElementById("collabPresence");
  if (!container) return;

  container.innerHTML = "";
  if (!state.board) return;

  // Combine owner and members for presence check
  const allPossibleMembers = [];
  if (state.board.owner) {
    // If owner is populated object, use ._id, otherwise use owner directly
    const ownerObj = typeof state.board.owner === 'object' ? state.board.owner : { _id: state.board.owner, name: "Owner" };
    allPossibleMembers.push(ownerObj);
  }
  if (state.board.members) {
    state.board.members.forEach(m => {
      // m is now { user: { _id, name... }, role: 'driver'/'navigator' }
      const user = m.user?._id ? m.user : m;
      if (!user._id) return;

      const userIdStr = user._id.toString();
      const existing = allPossibleMembers.find(pm => pm._id.toString() === userIdStr);

      if (existing) {
        // If already there (owner), update role if needed
        existing.ppRole = m.role || existing.ppRole;
      } else {
        user.ppRole = m.role || 'navigator';
        allPossibleMembers.push(user);
      }
    });
  }

  allPossibleMembers.forEach(member => {
    // Only show online users
    if (!state.onlineUserIds.has(member._id.toString())) return;

    const wrapper = document.createElement("div");
    wrapper.className = "avatar-wrapper";
    wrapper.style.cssText = "position:relative; display:inline-block; margin-left: -12px;";

    const avatar = document.createElement("img");
    avatar.className = "collab-avatar active";
    avatar.src = member.profile_image || member.avatarUrl || "assets/images/user-avatar.png";
    avatar.alt = member.name;
    avatar.setAttribute("data-user-id", member._id);

    // Set role
    const ownerId = (state.board.owner._id || state.board.owner).toString();
    const isOwnerOfProject = state.userId === ownerId;
    const isThisMemberOwner = member._id.toString() === ownerId;

    const roleSlug = member.ppRole || (isThisMemberOwner ? "driver" : "navigator");
    const roleTitle = roleSlug.charAt(0).toUpperCase() + roleSlug.slice(1);

    avatar.setAttribute("data-role", roleSlug);
    avatar.title = `${member.name} (${roleTitle})`;

    // If I am the owner and this member is a navigator, allow me to make them driver
    // If I am the owner and this member is a navigator, allow me to make them driver
    if (isOwnerOfProject && roleSlug === 'navigator') {
      avatar.style.cursor = "pointer";
      const actionText = member._id.toString() === state.userId ? "become Driver" : `make ${member.name} Driver`;
      avatar.title += ` - Click to ${actionText}`;
      avatar.addEventListener("click", async () => {
        const confirmed = typeof showCustomConfirm === 'function'
          ? await showCustomConfirm(`Do you want to ${actionText}?`, "This will promote them to Driver.")
          : confirm(`Do you want to ${actionText}?`);

        if (confirmed) {
          swapRoles(member._id.toString());
        }
      });
    } else if (isOwnerOfProject && roleSlug === 'driver' && member._id.toString() !== state.userId) {
      // Owner can take over from another driver
      avatar.style.cursor = "pointer";
      avatar.title += " - Click to take over as Driver";
      avatar.addEventListener("click", async () => {
        const confirmed = typeof showCustomConfirm === 'function'
          ? await showCustomConfirm(`Take over as Driver?`, "You will revoke their driver access.")
          : confirm(`Take over as Driver?`);

        if (confirmed) {
          swapRoles(state.userId);
        }
      });
    }

    // Apply colored border
    if (member.colorTag) {
      avatar.style.borderColor = member.colorTag;
    }

    wrapper.appendChild(avatar);
    container.appendChild(wrapper);
  });

  // Update project name in navbar
  const projectNameEl = document.getElementById("projectName");
  if (projectNameEl && state.board) {
    projectNameEl.textContent = state.board.name || "Pair Programming";
  }
}

// Listen for typing events from socket
window.addEventListener("user-typing", (e) => {
  const { userId, isTyping } = e.detail;
  const avatar = document.querySelector(`.collab-avatar[data-user-id="${userId}"]`);
  if (avatar) {
    avatar.classList.toggle("typing", isTyping);
  }
});


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
  const sendBtn = document.getElementById("sendInviteBtn");

  // Reset selection
  selectedUserId = null;
  sendBtn.disabled = true;

  if (query.length < 2) {
    list.innerHTML = `
      <div style="padding: 40px 20px; text-align: center; color: #999;">
        <i class="fa-solid fa-magnifying-glass" style="font-size: 32px; margin-bottom: 12px; opacity: 0.3;"></i>
        <p style="margin: 0; font-size: 13px;">Start typing to search users</p>
      </div>
    `;
    return;
  }

  // Show loading state
  list.innerHTML = `
    <div style="padding: 40px 20px; text-align: center; color: #999;">
      <i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; margin-bottom: 12px; color: var(--accent);"></i>
      <p style="margin: 0; font-size: 13px;">Searching...</p>
    </div>
  `;

  try {
    const res = await apiCall(`/users/search?query=${query}`, "GET");
    const users = Array.isArray(res) ? res : (res.users || []);

    if (users.length === 0) {
      list.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; color: #999;">
          <i class="fa-solid fa-user-slash" style="font-size: 32px; margin-bottom: 12px; opacity: 0.3;"></i>
          <p style="margin: 0; font-size: 13px;">No users found matching "${query}"</p>
        </div>
      `;
      return;
    }

    list.innerHTML = "";
    users.forEach(u => {
      const item = document.createElement("div");
      item.className = "user-list-item";
      item.innerHTML = `
        <img src="${u.profile_image || 'assets/images/user-avatar.png'}" alt="${u.name}">
        <div class="user-info">
          <div class="user-name">${u.name}</div>
          <div class="user-email">${u.email}</div>
        </div>
        <i class="fa-solid fa-circle-check" style="color: var(--accent); font-size: 20px; opacity: 0;"></i>
      `;
      item.onclick = () => {
        // Deselect others
        document.querySelectorAll(".user-list-item").forEach(el => {
          el.classList.remove("selected");
          el.querySelector("i").style.opacity = "0";
        });
        item.classList.add("selected");
        item.querySelector("i").style.opacity = "1";
        selectedUserId = u._id;
        sendBtn.disabled = false;
      };
      list.appendChild(item);
    });
  } catch (err) {
    console.warn("Search error", err);
    list.innerHTML = `
      <div style="padding: 40px 20px; text-align: center; color: #ef4444;">
        <i class="fa-solid fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 12px;"></i>
        <p style="margin: 0; font-size: 13px;">Error searching users. Please try again.</p>
      </div>
    `;
  }
});

document.getElementById("sendInviteBtn").onclick = async () => {
  if (!selectedUserId) {
    showToast("Please select a user", "error");
    return;
  }

  const sendBtn = document.getElementById("sendInviteBtn");
  const originalText = sendBtn.innerHTML;
  sendBtn.disabled = true;
  sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

  const perm = document.getElementById("invitePermission").value;
  try {
    await apiCall(`/${boardId}/invite`, "POST", {
      userIds: [selectedUserId],
      permission: perm
    });
    showToast("Invite sent successfully!", "success");

    // Reset modal
    document.getElementById("inviteSearch").value = "";
    document.getElementById("inviteUserList").innerHTML = `
      <div style="padding: 40px 20px; text-align: center; color: #999;">
        <i class="fa-solid fa-magnifying-glass" style="font-size: 32px; margin-bottom: 12px; opacity: 0.3;"></i>
        <p style="margin: 0; font-size: 13px;">Start typing to search users</p>
      </div>
    `;
    selectedUserId = null;

    closeInvite();
  } catch (err) {
    showToast(err.message, "error");
    sendBtn.disabled = false;
    sendBtn.innerHTML = originalText;
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
  setOnlineUserIds(state.onlineUserIds);

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

  // Add self to online users immediately
  if (state.userId) {
    state.onlineUserIds.add(state.userId.toString());
    loadBoardMembers();
  }

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
      emitCursorUpdate(boardId, null, { x: e.clientX, y: e.clientY }, user.colorTag);
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

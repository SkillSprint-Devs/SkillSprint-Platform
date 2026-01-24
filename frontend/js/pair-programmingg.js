const files = {
  "src": {
    "index.js": "import express from 'express';\nconsole.log('hello world');\n",
    "app.js": "const app = require('express')();\napp.listen(3000);\n",
    "components": {
      "Header.jsx": "export default function Header(){ return <h1>Header</h1> }\n"
    }
  },
  "README.md": "# Project README\nThis is a sample project.\n"
};

const state = {
  openTabs: ["src/index.js"],
  active: "src/index.js",
  editor: null,
  commentsOpen: false,
  comments: [
    { id: 1, author: "AB", text: "Check the import here", line: 1 },
    { id: 2, author: "CD", text: "Use const instead of var", line: 4 }
  ]
};

document.getElementById("themeToggle").addEventListener("click", () => {
  document.documentElement.classList.toggle("dark");
  const isDark = document.documentElement.classList.contains("dark");
  if (state.editor) {
    state.editor.setOption("theme", isDark ? "material-darker" : "default");
  }
});

function showLineBubble(line) {
  const widget = document.createElement("div");
  widget.className = "line-bubble";
  widget.textContent = "Chat";
  state.editor.addLineWidget(line - 1, widget, { above: false });
}

function pathJoin(parts) {
  return parts.filter(Boolean).join("/");
}

function getNodeAtPath(path) {
  const parts = path.split("/");
  let cur = files;
  for (let p of parts) {
    if (!cur[p]) return null;
    cur = cur[p];
  }
  return cur;
}

function setNodeAtPath(path, content) {
  const parts = path.split("/");
  let cur = files;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (i === parts.length - 1) {
      cur[p] = content;
      return;
    }
    if (!cur[p]) cur[p] = {};
    cur = cur[p];
  }
}

function renderFileTree(container, node = files, base = "") {
  container.innerHTML = "";
  const ul = document.createElement("ul");
  buildNodeList(node, base, ul);
  container.appendChild(ul);
}

function buildNodeList(node, base, parentEl) {
  Object.keys(node).forEach((key) => {
    const val = node[key];
    const li = document.createElement("li");
    li.style.listStyle = "none";

    const fullPath = pathJoin([base, key]);

    if (typeof val === "object") {
      const folderRow = document.createElement("div");
      folderRow.className = "folder";
      folderRow.textContent = key;
      folderRow.setAttribute("data-path", fullPath);

      folderRow.addEventListener("click", (e) => {
        if (e.target.closest(".context-menu")) return;
        childContainer.classList.toggle("hidden");
      });

      li.appendChild(folderRow);

      const childContainer = document.createElement("div");
      childContainer.style.paddingLeft = "12px";
      buildNodeList(val, fullPath, childContainer);
      li.appendChild(childContainer);
    } else {
      const fileRow = document.createElement("div");
      fileRow.className = "file";
      fileRow.textContent = key;
      fileRow.setAttribute("data-path", fullPath);

      fileRow.addEventListener("click", () => openFile(fullPath));

      li.appendChild(fileRow);
    }

    parentEl.appendChild(li);
  });
}

function renderTabs() {
  const tabsEl = document.getElementById("tabs");
  tabsEl.innerHTML = "";
  state.openTabs.forEach((tab) => {
    const t = document.createElement("div");
    t.className = "tab" + (tab === state.active ? " active" : "");
    t.textContent = tab;

    const close = document.createElement("span");
    close.textContent = "x";
    close.className = "close";

    close.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(tab);
    });

    t.appendChild(close);
    t.addEventListener("click", () => setActiveTab(tab));

    tabsEl.appendChild(t);
  });
}

function initEditor() {
  const editorContainer = document.getElementById("editorContainer");
  state.editor = CodeMirror(editorContainer, {
    value: getNodeAtPath(state.active) || "",
    mode: detectMode(state.active),
    lineNumbers: true,
    gutters: ["CodeMirror-linenumbers"],
    theme: "default",
    viewportMargin: Infinity
  });

  state.editor.on("change", () => {
    const header = document.getElementById("activeFilename");
    if (!header.textContent.endsWith("*")) {
      header.textContent = state.active + " *";
    }
  });

  state.editor.getWrapperElement().addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveActive();
    }
  });

  state.editor.on("gutterClick", (_, line) => {
    const lineNum = line + 1;
    const comment = promptCustom(`Add comment for line ${lineNum}:`);
    if (!comment) return;

    state.comments.unshift({
      id: Date.now(),
      author: "You",
      text: comment,
      line: lineNum
    });

    renderComments();
    showLineBubble(lineNum);
  });
}

function detectMode(path) {
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".html")) return "xml";
  return "javascript";
}

function openFile(path) {
  if (!state.openTabs.includes(path)) state.openTabs.push(path);
  setActiveTab(path);
  renderTabs();
}

function setActiveTab(path) {
  state.active = path;
  document.getElementById("activeFilename").textContent = path;
  const content = getNodeAtPath(path) || "";

  if (!state.editor) initEditor();
  state.editor.setValue(content);
  state.editor.setOption("mode", detectMode(path));

  renderTabs();
}

function closeTab(path) {
  const idx = state.openTabs.indexOf(path);
  if (idx === -1) return;

  state.openTabs.splice(idx, 1);

  if (state.active === path) {
    const next = state.openTabs[idx - 1] || state.openTabs[0] || null;
    if (next) setActiveTab(next);
    else {
      state.active = null;
      state.editor.setValue("");
      document.getElementById("activeFilename").textContent = "";
      renderTabs();
    }
  } else {
    renderTabs();
  }
}

function saveActive() {
  if (!state.active) return;
  setNodeAtPath(state.active, state.editor.getValue());

  const header = document.getElementById("activeFilename");
  header.textContent = state.active + " (saved)";
  showToast(`Saved ${state.active}`, "success");
  setTimeout(() => (header.textContent = state.active), 900);
}

function renderComments() {
  const list = document.getElementById("commentsList");
  list.innerHTML = "";

  state.comments.forEach((c) => {
    const el = document.createElement("div");
    el.className = "comment";
    el.innerHTML = `
      <div style="font-size:12px;color:#666">${c.author} • line ${c.line ?? "—"}</div>
      <div style="margin-top:6px">${c.text}</div>
    `;
    list.appendChild(el);
  });
}

function toggleComments(force) {
  const panel = document.getElementById("commentsPanel");
  if (typeof force === "boolean") {
    state.commentsOpen = force;
  } else {
    state.commentsOpen = !state.commentsOpen;
  }
  panel.classList.toggle("open", state.commentsOpen);
}

let contextTargetPath = null;

document.addEventListener("contextmenu", (e) => {
  const row = e.target.closest(".file, .folder");
  if (!row) return;

  e.preventDefault();

  contextTargetPath = row.getAttribute("data-path");

  const menu = document.getElementById("contextMenu");
  menu.style.top = e.pageY + "px";
  menu.style.left = e.pageX + "px";
  menu.classList.remove("hidden");
});

document.addEventListener("click", () => {
  document.getElementById("contextMenu").classList.add("hidden");
});

document.getElementById("contextMenu").addEventListener("click", (e) => {
  const action = e.target.dataset.action;
  if (!contextTargetPath) return;

  const parentPath = contextTargetPath.split("/").slice(0, -1).join("/");

  switch (action) {
    case "rename": {
      promptConfirm("Enter new name:", (renameTo) => {
        if (!renameTo) {
          showToast("Rename cancelled", "info");
          return;
        }
        renameFile(contextTargetPath, renameTo);
        showToast("Renamed successfully", "success");
        renderFileTree(document.getElementById("fileTree"));
      });
      break;
    }
    case "delete": {
      confirm("Are you sure to delete?", () => {
        deleteFileOrFolder(contextTargetPath);
        showToast("Deleted successfully", "success");
        renderFileTree(document.getElementById("fileTree"));
      }, () => {
        showToast("Delete cancelled", "info");
      });
      break;
    }
    case "new-file": {
      promptConfirm("New file name:", (name) => {
        if (!name) {
          showToast("Creation cancelled", "info");
          return;
        }
        setNodeAtPath(`${parentPath}/${name}`, "// new file");
        showToast("File created", "success");
        renderFileTree(document.getElementById("fileTree"));
      });
      break;
    }
    case "new-folder": {
      promptConfirm("New folder name:", (name) => {
        if (!name) {
          showToast("Creation cancelled", "info");
          return;
        }
        setNodeAtPath(`${parentPath}/${name}`, {});
        showToast("Folder created", "success");
        renderFileTree(document.getElementById("fileTree"));
      });
      break;
    }
  }
});

function renameFile(path, newName) {
  const parts = path.split("/");
  const parent = parts.slice(0, -1).join("/");
  const oldContent = getNodeAtPath(path);

  deleteFileOrFolder(path);
  setNodeAtPath(`${parent}/${newName}`, oldContent);
}

function deleteFileOrFolder(path) {
  const parts = path.split("/");
  const target = parts.pop();

  let cur = files;
  parts.forEach((p) => (cur = cur[p]));

  delete cur[target];
}

function promptConfirm(message, callback) {
  // Remove any existing modal
  document.querySelector(".input-modal")?.remove();

  const modal = document.createElement("div");
  modal.className = "input-modal";
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

  function closeModal() {
    modal.classList.remove("show");
    setTimeout(() => modal.remove(), 300);
  }

  modal.querySelector(".btn-ok").onclick = () => {
    const val = input.value.trim();
    closeModal();
    callback(val);
  };

  modal.querySelector(".btn-cancel").onclick = () => {
    closeModal();
    callback(null);
  };

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeModal();
      callback(null);
    }
  });

  // Show modal (add class after append for CSS transition)
  requestAnimationFrame(() => modal.classList.add("show"));
}


function promptCustom(message) {
  // fallback or use your own modal if needed
  return prompt(message);
}

function showToast(message, type = "info", duration = 2500) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function initUI() {
  renderFileTree(document.getElementById("fileTree"));
  renderTabs();

  const members = ["AB", "CD", "EF"];
  const mCont = document.getElementById("membersContainer");
  members.forEach((m) => {
    const a = document.createElement("div");
    a.className = "avatar";
    a.textContent = m;
    mCont.appendChild(a);
  });

  initEditor();
  setActiveTab(state.active);

  document.getElementById("saveBtn").onclick = saveActive;
  document.getElementById("newFileBtn").onclick = () => {
    promptConfirm("New file path:", (name) => {
      if (!name) return;
      setNodeAtPath(name, "// new file");
      renderFileTree(document.getElementById("fileTree"));
      openFile(name);
    });
  };

  document.getElementById("toggleComments").onclick = () => toggleComments(true);
  document.getElementById("closeComments").onclick = () => toggleComments(false);
  document.getElementById("openCommentsFab").onclick = () => toggleComments(true);

  document.getElementById("sendComment").onclick = () => {
    const txt = document.getElementById("commentText").value.trim();
    if (!txt) return;
    state.comments.unshift({
      id: Date.now(),
      author: "You",
      text: txt,
      line: null
    });
    document.getElementById("commentText").value = "";
    renderComments();
  };

  renderComments();

  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveActive();
    }
  });
}

document.addEventListener("DOMContentLoaded", initUI);

// Function to run user code safely in iframe and capture console.log
function runCode() {
  const code = state.editor.getValue();
  const outputEl = document.getElementById("codeOutput");
  outputEl.textContent = ""; // Clear previous output

  // Create iframe sandbox
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.sandbox = "allow-scripts";

  document.body.appendChild(iframe);

  const iframeWindow = iframe.contentWindow;

  // Override console.log inside iframe to capture logs
  iframeWindow.console.log = function (...args) {
    outputEl.textContent += args.map(String).join(" ") + "\n";
  };

  // Override console.error to capture errors
  iframeWindow.console.error = function (...args) {
    outputEl.textContent += "Error: " + args.map(String).join(" ") + "\n";
  };

  // Run the code inside iframe context
  try {
    iframeWindow.eval(code);
  } catch (err) {
    outputEl.textContent += "Exception: " + err.message + "\n";
  }

  // Cleanup iframe after running to prevent memory leaks
  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 1000);
}

// Bind Run button
document.getElementById("runCodeBtn").addEventListener("click", runCode);



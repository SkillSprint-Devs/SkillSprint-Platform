

(function () {
  if (typeof io === "undefined") {
    console.error("Socket.IO client library missing. Include it before this file.");
    return;
  }




  // Determine Socket URL dynamically
  const SOCKET_IO_BACKEND_URL = window.API_SOCKET_URL;
  const token = localStorage.getItem('token');

  const socket = io(SOCKET_IO_BACKEND_URL, {
    transports: ["websocket"],
    reconnection: true,
    auth: { token }
  });


  const boardId = window.BOARD_ID || null;
  const currentUser = window.CURRENT_USER || null;

  if (!boardId) {
    console.warn("No boardId found! Make sure window.BOARD_ID is set in HTML or board.js");
  }
  if (!currentUser) {
    console.warn(" No currentUser found! Make sure window.CURRENT_USER is set before initializing socket.");
  }

  // Connect event
  socket.on("connect", () => {
    console.log("Connected to Socket.IO server at", SOCKET_IO_BACKEND_URL);
    if (boardId && currentUser) {
      // Join the board room with user info
      socket.emit("joinBoard", { boardId, userId: currentUser._id, name: currentUser.name });
      console.log(`Joined board room ${boardId} as user ${currentUser.name || currentUser._id}`);
    } else {
      console.warn("Skipped joinBoard emit due to missing boardId or currentUser");
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(" Disconnected from server. Reason:", reason);
  });

  // Receive active users list for presence
  socket.on("board:presence:update", (data) => {
    console.log("Board presence update:", data);
    if (data && Array.isArray(data.activeUsers) && typeof window.updateActiveUsersUI === 'function') {
      window.updateActiveUsersUI(data.activeUsers);
    }
  });

  // Cursor handling
  const remoteCursors = {};

  socket.on("board:cursor", (data) => {
    const { userId, name, x, y, color } = data;
    if (currentUser && userId === currentUser._id) return;

    let cursorEl = remoteCursors[userId];
    if (!cursorEl) {
      cursorEl = document.createElement("div");
      cursorEl.className = "remote-cursor";
      const userColor = color || '#8C52FF';
      cursorEl.innerHTML = `
        <div class="cursor-pointer" style="background: ${userColor}"></div>
        <div class="cursor-label" style="background: ${userColor}">${name || 'User'}</div>
      `;
      document.getElementById("canvasWrapper").appendChild(cursorEl);
      remoteCursors[userId] = cursorEl;
    }

    cursorEl.style.transform = `translate(${x}px, ${y}px)`;

    // Auto-remove after inactivity
    clearTimeout(cursorEl.timeout);
    cursorEl.timeout = setTimeout(() => {
      cursorEl.remove();
      delete remoteCursors[userId];
    }, 5000);
  });


  // Receive live drawing events
  socket.on("board:draw", (data) => {
    if (window.replicateDraw) window.replicateDraw(data);
  });

  socket.on("board:comment:created", () => {
    window.dispatchEvent(new CustomEvent('board:notification:refresh'));
  });

  socket.on("board:notification:added", () => {
    window.dispatchEvent(new CustomEvent('board:notification:refresh'));
  });

  socket.on("board:undo", () => {
    if (window.undoFromRemote) window.undoFromRemote();
  });

  socket.on("board:redo", () => {
    if (window.redoFromRemote) window.redoFromRemote();
  });

  // Sticky notes sync
  socket.on("board:sticky", (sticky) => {
    if (window.renderStickyFromRemote) window.renderStickyFromRemote(sticky);
  });

  // Remote save triggered
  socket.on("board:autosave", (data) => {
    console.log("Autosave triggered remotely");
    if (window.saveBoardState) window.saveBoardState(data);
  });

  // Handle board deletion
  socket.on("board:deleted", (data) => {
    // Only alert if we are currently on the deleted board
    if (data.boardId === window.BOARD_ID) {
      alert("This board has been deleted by the owner.");
      window.location.href = "dashboard.html";
    }
  });

  // Expose emit functions for your board.js usage
  window.BoardSocket = {
    emitDraw: (drawData) => {
      if (!boardId || !currentUser) {
        console.warn("Cannot emit draw event: boardId or currentUser missing");
        return;
      }
      socket.emit("board:draw", { boardId, userId: currentUser._id, ...drawData });
    },
    emitUndo: () => {
      if (!boardId) {
        console.warn("Cannot emit undo event: boardId missing");
        return;
      }
      socket.emit("board:undo", { boardId });
    },
    emitRedo: () => {
      if (!boardId) {
        console.warn("Cannot emit redo event: boardId missing");
        return;
      }
      socket.emit("board:redo", { boardId });
    },
    emitSticky: (stickyData) => {
      if (!boardId) {
        console.warn("Cannot emit sticky event: boardId missing");
        return;
      }
      socket.emit("board:sticky", { boardId, ...stickyData });
    },
    emitSave: (data) => {
      if (!boardId) {
        console.warn("Cannot emit save event: boardId missing");
        return;
      }
      socket.emit("board:autosave", { boardId, ...data });
    },
    emitCursor: (() => {
      let lastEmit = 0;
      const THROTTLE_MS = 50; // Throttle cursor to 20fps for performance

      return (x, y) => {
        if (!boardId || !currentUser) return;
        const now = Date.now();
        if (now - lastEmit < THROTTLE_MS) return;
        lastEmit = now;

        socket.emit("board:cursor", {
          boardId,
          userId: currentUser._id,
          name: currentUser.name,
          x, y,
          color: currentUser.colorTag || '#8C52FF'
        });
      };
    })()
  };
})();


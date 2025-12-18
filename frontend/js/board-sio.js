

(function () {
  if (typeof io === "undefined") {
    console.error("⚠️ Socket.IO client library missing. Include it before this file.");
    return;
  }




  // Determine Socket URL dynamically
  const isDev = window.location.port === '5500';
  const SOCKET_IO_BACKEND_URL = isDev ? 'http://localhost:5000' : '';


  const socket = io(SOCKET_IO_BACKEND_URL, { transports: ["websocket"], reconnection: true });


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
    console.log("👥 Board presence update:", data);

    const container = document.getElementById("activeUsers");
    if (!container) return;

    container.innerHTML = ""; // clear old avatars

    if (!data || !Array.isArray(data.activeUsers)) return;

    data.activeUsers.forEach((user) => {
      const img = document.createElement("img");
      img.src = user.profile_image || user.avatarUrl || "assets/images/user-avatar.png";
      img.className = "user-avatar-stack";
      img.title = user.name || "User";
      container.appendChild(img);
    });


    const me = window.CURRENT_USER;
    if (me && !data.activeUsers.some(u => u._id === me._id)) {
      const myImg = document.createElement("img");
      myImg.src = me.profile_image || me.avatarUrl || "assets/images/user-avatar.png";
      myImg.className = "user-avatar-stack";
      myImg.title = `${me.name || "You"} (You)`;
      container.appendChild(myImg);
    }
  });


  // Receive live drawing events
  socket.on("board:draw", (data) => {
    if (window.replicateDraw) window.replicateDraw(data);
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
    console.log("💾 Autosave triggered remotely");
    if (window.saveBoardState) window.saveBoardState(data);
  });

  // Expose emit functions for your board.js usage
  window.BoardSocket = {
    emitDraw: (drawData) => {
      if (!boardId || !currentUser) {
        console.warn("⚠️ Cannot emit draw event: boardId or currentUser missing");
        return;
      }
      socket.emit("board:draw", { boardId, userId: currentUser._id, ...drawData });
    },
    emitUndo: () => {
      if (!boardId) {
        console.warn("⚠️ Cannot emit undo event: boardId missing");
        return;
      }
      socket.emit("board:undo", { boardId });
    },
    emitRedo: () => {
      if (!boardId) {
        console.warn("⚠️ Cannot emit redo event: boardId missing");
        return;
      }
      socket.emit("board:redo", { boardId });
    },
    emitSticky: (stickyData) => {
      if (!boardId) {
        console.warn("⚠️ Cannot emit sticky event: boardId missing");
        return;
      }
      socket.emit("board:sticky", { boardId, ...stickyData });
    },
    emitSave: (data) => {
      if (!boardId) {
        console.warn("⚠️ Cannot emit save event: boardId missing");
        return;
      }
      socket.emit("board:autosave", { boardId, ...data });
    },
  };
})();


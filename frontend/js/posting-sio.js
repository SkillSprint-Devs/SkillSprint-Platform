// === posting-sio.js (Socket integration for posting.js) ===
// Make sure posting.js is loaded first
// <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>

const token = localStorage.getItem('token');
const currentUser = JSON.parse(localStorage.getItem('user'));

if (!token || !currentUser?._id) {
  console.error("Socket connection skipped: missing token or user");
} else {
  const SOCKET_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
    ? 'http://localhost:5000'
    : '';

  const socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });

  // --- CONNECTION HANDLING ---
  socket.on("connect", () => {
    console.log("✅ Connected to Socket.io:", socket.id);
    socket.emit("joinUserRoom", currentUser._id);
  });

  socket.io.on("reconnect", () => {
    console.log("♻️ Reconnected to server, rejoining room...");
    socket.emit("joinUserRoom", currentUser._id);
  });

  socket.on("disconnect", () => console.warn("⚠️ Socket disconnected"));

  // ----------------- POSTS -----------------
  socket.on("postCreated", ({ post }) => {
    if (!post?._id) return;
    const exists = document.querySelector(`.feed-post[data-id="${post._id}"]`);
    if (exists) return;
    console.log("🆕 New post received:", post);
    window.renderPost(post, { prepend: true });
  });

  socket.on("postUpdated", ({ post }) => {
    console.log("✏️ Post updated:", post._id);
    window.updatePostInDOM(post);
  });

  socket.on("postDeleted", ({ postId }) => {
    console.log("🗑️ Post deleted:", postId);
    const el = document.querySelector(`.feed-post[data-id="${postId}"]`);
    if (el) el.remove();
  });

  // ----------------- LIKES -----------------
  socket.on("postLiked", ({ postId, likesCount }) => {
    const el = document.querySelector(`.feed-post[data-id="${postId}"]`);
    if (!el) return;
    const btn = el.querySelector(".like-count");
    if (!btn) return;

    btn.classList.add("liked");
    const icon = btn.querySelector("i");
    if (icon) icon.className = "fa-solid fa-heart";
    const span = btn.querySelector("span");
    if (span) span.textContent = likesCount?.toString() || String(parseInt(span.textContent || 0) + 1);
  });

  socket.on("postUnliked", ({ postId, likesCount }) => {
    const el = document.querySelector(`.feed-post[data-id="${postId}"]`);
    if (!el) return;
    const btn = el.querySelector(".like-count");
    if (!btn) return;

    btn.classList.remove("liked");
    const icon = btn.querySelector("i");
    if (icon) icon.className = "fa-regular fa-heart";
    const span = btn.querySelector("span");
    if (span) span.textContent = likesCount?.toString() || String(Math.max(0, parseInt(span.textContent || 1) - 1));
  });

  // ----------------- COMMENTS -----------------
  socket.on("commentCreated", ({ postId, comment }) => {
    console.log("New comment received:", comment);
    const postNode = document.querySelector(`.feed-post[data-id="${postId}"]`);
    if (!postNode) return;

    // 1. Update count
    const countSpan = postNode.querySelector(".comment-count span");
    if (countSpan) {
      // If I am the author, my local code already updated it. Avoid double count?
      // Actually, the socket event comes back to everyone including sender usually.
      // But wait, the previous code for sender didn't check for socket echo. 
      // Ideally we should rely EITHER on optimistic UI OR socket, getting both is tricky.
      // However, `commentCreatedByYou` is sent to sender separately, `commentCreated` to others.
      // Let's check the backend logic...
      // Backend sends `commentCreated` to author as well? No, `io.to(userId).emit("commentCreatedByYou")`.
      // `commentCreated` is sent to followers. 
      // Wait, `io.emit("commentCreatedGlobal")` sends to everyone?
      // The backend has `io.emit("commentCreatedGlobal", ...)` which goes to everyone including sender.
      // This effectively means sender gets it twice if we act on global.

      // Simple fix: Check if we already inserted this comment ID? 
      // Comments don't have IDs in the DOM list usually? They are just divs.
      // Let's just blindly update for now, user asked for "comments must appear then and there".
      // To avoid double count for sender, we can check `comment.userId` vs `currentUser._id`.
      // If it is ME, I already updated UI optimistically in posting.js.

      if (comment.userId === currentUser._id || comment.userId?._id === currentUser._id) {
        return; // Ignore my own socket echo to prevent double insertion/count
      }

      const current = parseInt(countSpan.textContent || "0");
      countSpan.textContent = String(current + 1);
    }

    // 2. Update Panel if open
    const panel = postNode.querySelector(".comments-panel");
    if (panel && panel.classList.contains("open")) {
      const item = document.createElement("div");
      item.className = "comment-item";
      // Create elements manually or use a helper if available, but `el` is not in scope here? 
      // posting-sio.js relies on global scope? No, it's separate file. 
      // It seems `el` is defined in `posting.js` which is loaded before. So `window.el`? 
      // No, `el` is not attached to window in posting.js. 
      // We have to write raw DOM code here.

      const img = document.createElement("img");
      img.src = comment.userId?.profile_image || "./assets/images/user-avatar.png";
      img.className = "comment-avatar";

      const body = document.createElement("div");
      body.className = "comment-body";

      const author = document.createElement("div");
      author.className = "comment-author";
      author.textContent = comment.userId?.name || "User";

      const text = document.createElement("div");
      text.className = "comment-text";
      text.textContent = comment.text || "";

      body.appendChild(author);
      body.appendChild(text);
      item.appendChild(img);
      item.appendChild(body);

      const placeholder = panel.querySelector(".placeholder");
      if (placeholder) placeholder.remove();

      panel.insertBefore(item, panel.firstChild); // Newest on top
    }
  });

  socket.on("commentUpdated", ({ comment }) => {
    // console.log("📝 Comment updated:", comment);
    // Find comment in DOM
    // We didn't set IDs on comment-items before, but we just added logic to do so in posting.js.
    // However, that only applies to newly fetched lists. What about existing ones?
    // We should rely on data-comment-id attribute.
    const item = document.querySelector(`.comment-item[data-comment-id="${comment._id}"]`);
    if (item) {
      const textNode = item.querySelector(".comment-text");
      if (textNode) textNode.textContent = comment.text || "";
    }
  });

  socket.on("commentDeleted", ({ postId, commentId }) => {
    // console.log("❌ Comment deleted:", commentId);
    const item = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
    if (item) {
      const postNode = item.closest(".feed-post");
      if (postNode) {
        const countSpan = postNode.querySelector(".comment-count span");
        if (countSpan) countSpan.textContent = String(Math.max(0, parseInt(countSpan.textContent || "0") - 1));
      }
      item.remove();
    }
  });

  // Chat Message
  socket.on("receiveMessage", (msg) => {
    if (typeof window.handleIncomingMessage === 'function') {
      window.handleIncomingMessage(msg);
    }
  });

  // ----------------- FOLLOW EVENTS -----------------

  // when you follow someone (instantly accepted)
  socket.on("followAccepted", ({ followerId, followingId }) => {
    console.log("Followed user:", { followerId, followingId });

    if (typeof window.loadSuggestions === "function") window.loadSuggestions();
    if (typeof window.loadCurrentUser === "function") window.loadCurrentUser();
  });

  // when you unfollow someone
  socket.on("unfollowed", ({ followerId, followingId }) => {
    console.log("Unfollowed user:", { followerId, followingId });

    if (typeof window.loadSuggestions === "function") window.loadSuggestions();
    if (typeof window.loadCurrentUser === "function") window.loadCurrentUser();
  });

  // triggered for both follow/unfollow (to refresh counts)
  socket.on("followingUpdated", ({ followerId, followingId }) => {
    console.log("Following updated:", { followerId, followingId });

    if (typeof window.loadCurrentUser === "function") window.loadCurrentUser();
    if (typeof window.loadConnections === "function") window.loadConnections();
  });

  // ----------------- ERROR HANDLING -----------------
  socket.on("connect_error", (err) => {
    console.error("❌ Socket.io connection error:", err.message);
    if (err.message === "xhr poll error") {
      console.warn("Possible CORS or network issue. Check server status.");
    }
  });
}


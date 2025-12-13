// === posting-sio.js (Socket integration for posting.js) ===
// Make sure posting.js is loaded first
// <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>

const token = localStorage.getItem('token');
const currentUser = JSON.parse(localStorage.getItem('user'));

if (!token || !currentUser?._id) {
  console.error("Socket connection skipped: missing token or user");
} else {
  const socket = io("http://localhost:5000", {
    auth: { token },
    transports: ['websocket', 'polling']
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
    console.log("New comment:", comment);
    const postNode = document.querySelector(`.feed-post[data-id="${postId}"]`);
    const panel = postNode?.querySelector(".comments-panel");
    if (panel && typeof window.toggleComments === "function") {
      window.toggleComments(postNode, postId); // reload comments panel
    } else if (typeof window.loadPosts === "function") {
      window.loadPosts();
    }
  });

  socket.on("commentUpdated", ({ comment }) => console.log("📝 Comment updated:", comment));
  socket.on("commentDeleted", ({ commentId }) => console.log("❌ Comment deleted:", commentId));

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
    console.error("Socket.io connection error:", err.message);
  });
}


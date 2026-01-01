// frontend/js/posting.js

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
  ? 'http://localhost:5000/api'
  : '/api';
const POSTING_BASE = `${API_BASE}/posting`;
const AUTH_ME = `${API_BASE}/auth/me`;
const POSTS_API = `${POSTING_BASE}/posts`;
const FOLLOW_API_BASE = `${POSTING_BASE}`;



const token = localStorage.getItem("token");
if (!token) {
  showToast("Session expired. Please sign in.", "error");
  setTimeout(() => (window.location.href = "login.html"), 800);
}
const authHeader = { Authorization: `Bearer ${token}` };

document.getElementById("btnBack")?.addEventListener("click", () => {
  window.history.back();
});


const dom = {
  postInput: document.getElementById("postText"),
  postBtn: document.getElementById("postSubmitBtn"),
  attachBtn: document.getElementById("attachBtn"),
  mediaInput: document.getElementById("mediaInput"),
  postsContainer: document.getElementById("postsContainer"),
  mediaPreviewWrap: document.getElementById("mediaPreview"),
  creatorAvatar: document.getElementById("creatorAvatar"),
  creatorAvatarSmall: document.getElementById("creatorAvatarSmall"),
  usernameTop: document.getElementById("usernameTop"),
  profileAvatar: document.getElementById("profileAvatar"),
  profileName: document.getElementById("profileName"),
  profilePosition: document.getElementById("profilePosition"),
  connectionsCount: document.getElementById("connectionsCount"),
  followingCount: document.getElementById("followingCount"),
  suggestionsList: document.getElementById("suggestionsList"),
  chatList: document.getElementById("chatList"),
  chatPanel: document.getElementById("chatPanel"),
  chatPanelTitle: document.getElementById("chatPanelTitle"),
  chatPanelBody: document.getElementById("chatPanelBody"),
  closeChatPanelBtn: document.getElementById("closeChatPanel"),
};

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === "class") e.className = attrs[k];
    else if (k === "html") e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  children.forEach((c) =>
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c)
  );
  return e;
}
const q = (s, c = document) => c.querySelector(s);
const qa = (s, c = document) => Array.from(c.querySelectorAll(s));
const safeText = (s) => (s ?? "").toString();
const formatTime = (iso) => (iso ? new Date(iso).toLocaleString() : new Date().toLocaleString());

let currentUser = null;
let selectedFiles = [];
const MAX_MEDIA = 3;

async function loadCurrentUser() {
  try {
    const res = await fetch(AUTH_ME, { headers: authHeader });

    if (res.status === 401 || res.status === 403) {
      showToast("Session expired. Please sign in.", "error");
      localStorage.removeItem("token");
      setTimeout(() => (window.location.href = "login.html"), 1500);
      return;
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    currentUser = await res.json();
    localStorage.setItem("user", JSON.stringify(currentUser));

    // Use your snippet to update avatars and user info from localStorage
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const profileImgUrl = user.profile_image || "assets/images/user-avatar.png";

    ["creatorAvatar", "creatorAvatarSmall", "profileAvatar"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.src = profileImgUrl;
    });

    if (dom.usernameTop) dom.usernameTop.textContent = user.name || "You";
    if (dom.profileName) dom.profileName.textContent = user.name || "";
    if (dom.profilePosition) dom.profilePosition.textContent = user.role || "";
    if (dom.connectionsCount) dom.connectionsCount.textContent = user.followers_count || 0;
    if (dom.followingCount) dom.followingCount.textContent = user.following_count || 0;

  } catch (err) {
    console.error("Failed to load current user:", err);
    // Do NOT redirect here for general errors (like 404 or network error)
    if (err.message.includes("401") || err.message.includes("403")) {
      // Already handled above, but just in case
    } else {
      showToast("Could not load user profile. Check connection.", "warning");
    }
  }
}

function buildMediaNode(media = []) {
  if (!media.length) return null;

  // Sanitize URLs for legacy data 
  const cleanMedia = media.map(m => {
    let url = m.url;
    if (!url) return m;

    // Fix 1: Remove localhost prefix
    if (url.includes("localhost:5000/uploads/")) {
      url = url.replace(/https?:\/\/localhost:5000/, "");
    }

    // Fix 2: If it looks like a Cloudinary path but has /uploads/ prefix, strip it
    if (url.includes("res.cloudinary.com") && url.includes("/uploads/")) {
      url = url.replace("/uploads/", "/");
    } else if (url.startsWith("/uploads/skillsprint/")) {
      // If it's a relative path starting with /uploads/skillsprint/, 
      // it might be stored locally OR be a mis-formatted Cloudinary path.
      // Since the backend now uses Cloudinary, we should try to resolve it correctly.
      // If the file actually exists locally, the current /uploads/ static middleware will serve it.
      // If it's meant to be Cloudinary, we'd need the cloud name, but for now we'll just log and try relative.
      console.log("Normalizing relative path:", url);
    }

    return { ...m, url };
  });

  const wrap = el("div", { class: "post-media" });
  if (cleanMedia.length === 1) {
    const m = cleanMedia[0];
    wrap.appendChild(
      m.type?.startsWith("video")
        ? el("video", { src: m.url, class: "post-img", controls: true })
        : el("img", { src: m.url, class: "post-img", alt: "post media" })
    );
  } else if (cleanMedia.length === 2) {
    wrap.classList.add("two-images");
    cleanMedia.forEach((m) =>
      wrap.appendChild(
        m.type?.startsWith("video")
          ? el("video", { src: m.url, class: "post-img", controls: true })
          : el("img", { src: m.url, class: "post-img" })
      )
    );
  } else {
    wrap.classList.add("carousel");
    cleanMedia.slice(0, 3).forEach((m) => {
      const item = el("div", { class: "carousel-item" });
      item.appendChild(
        m.type?.startsWith("video")
          ? el("video", { src: m.url, class: "post-img", controls: true })
          : el("img", { src: m.url, class: "post-img" })
      );
      wrap.appendChild(item);
    });
  }
  return wrap;
}

function buildPostNode(post) {

  const postIdStr = String(post._id);

  const postWrap = el("div", { class: "feed-post", "data-id": postIdStr });

  const header = el("div", { class: "post-header" });
  header.appendChild(el("img", { src: post.authorId?.profile_image || "./assets/images/user-avatar.png", alt: "author" }));
  const meta = el("div", {}, [
    el("h4", {}, [safeText(post.authorId?.name || "Unknown")]),
    el("span", { class: "time" }, [formatTime(post.createdAt)]),
  ]);
  header.appendChild(meta);

  postWrap.appendChild(header);
  postWrap.appendChild(el("p", {}, [safeText(post.content)]));

  if (Array.isArray(post.media) && post.media.length) postWrap.appendChild(buildMediaNode(post.media));

  const actions = el("div", { class: "post-actions-bar" });

  const likeBtn = el(
    "button",
    {
      class: `action-btn like-count ${post.isLiked ? "liked" : ""}`,
      "data-post-id": postIdStr,
      title: "Like",
    },
    [
      el("i", { class: post.isLiked ? "fa-solid fa-heart" : "fa-regular fa-heart" }),
      el("span", {}, [String(post.likesCount || 0)]),
    ]
  );

  const commentBtn = el(
    "button",
    {
      class: "action-btn comment-count",
      "data-post-id": postIdStr,
      title: "Comments",
    },
    [el("i", { class: "fa-regular fa-comment" }), el("span", {}, [String(post.commentsCount || 0)])]
  );

  actions.appendChild(likeBtn);
  actions.appendChild(commentBtn);

  if (currentUser && post.authorId && String(currentUser._id) === String(post.authorId._id || post.authorId)) {
    const menu = el("div", { class: "post-menu" });
    const btn = el("button", { class: "menu-btn" }, ["⋮"]);
    const list = el("div", { class: "menu-list" });
    const eBtn = el("button", { class: "menu-item edit-btn" });
    eBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
    const dBtn = el("button", { class: "menu-item delete-btn" });
    dBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    list.appendChild(eBtn);
    list.appendChild(dBtn);
    menu.appendChild(btn);
    menu.appendChild(list);
    postWrap.appendChild(menu);

    btn.onclick = (e) => {
      e.stopPropagation();
      list.classList.toggle("open");
    };

    // prevent global click closing on inside click
    document.addEventListener("click", (e) => {
      const openMenus = document.querySelectorAll(".menu-list.open");
      openMenus.forEach((menu) => {
        if (!menu.contains(e.target) && !e.target.classList.contains("menu-btn")) {
          menu.classList.remove("open");
        }
      });
    });

    eBtn.onclick = (e) => {
      e.stopPropagation();
      list.classList.remove("open");
      openEditModal(post);
    };

    dBtn.onclick = (e) => {
      e.stopPropagation();
      list.classList.remove("open");
      deletePost(postIdStr); // use string ID here
    };
  }

  const cDiv = el("div", { class: "post-comment-input" }, [
    el("input", { type: "text", placeholder: "Write a comment…", "data-post-id": String(post._id) }),
  ]);
  postWrap.appendChild(actions);
  postWrap.appendChild(cDiv);
  return postWrap;
}

// Edit modal 
let modal, saveBtn, cancelBtn, editText;

function createEditModal() {
  modal = el("div", { id: "editModal", class: "edit-modal" });
  modal.innerHTML = `
    <div class="modal-content">
      <textarea id="editText"></textarea>
      <div class="modal-actions">
        <button id="saveEdit">Save</button>
        <button id="cancelEdit">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  editText = modal.querySelector("#editText");
  saveBtn = modal.querySelector("#saveEdit");
  cancelBtn = modal.querySelector("#cancelEdit");

  cancelBtn.onclick = () => modal.classList.remove("open");
}

function openEditModal(post) {
  if (!modal) createEditModal();

  editText.value = post.content || "";
  modal.classList.add("open");

  saveBtn.onclick = null;

  saveBtn.onclick = async () => {
    const newText = editText.value.trim();
    if (!newText) return;

    try {
      const res = await fetch(`${POSTS_API}/${String(post._id)}`, {
        method: "PUT",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ content: newText }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const payload = await res.json();
      const updatedPost = payload.post || payload;
      window.updatePostInDOM(updatedPost);
      showToast("Post updated", "success");
      modal.classList.remove("open");
    } catch (err) {
      console.error("Edit failed:", err);
      showToast("Failed to update post", "error");
    }
  };
}

async function deletePost(id) {
  console.log("deletePost called with id:", id);

  const confirmed = await customConfirm("Are you sure you want to delete this post?");
  if (!confirmed) {
    console.log("User cancelled delete");
    return;
  }

  try {
    const res = await fetch(`${POSTS_API}/${String(id)}`, {
      method: "DELETE",
      headers: authHeader,
    });

    if (!res.ok) {
      console.error(`Delete API failed with status ${res.status}`);
      throw new Error(`HTTP ${res.status}`);
    }

    const postEl = q(`.feed-post[data-id="${String(id)}"]`);
    if (postEl) postEl.remove();
    showToast("Post deleted", "success");
  } catch (err) {
    console.error("Delete failed:", err);
    showToast("Delete failed", "error");
  }
}


let confirmModal, confirmText, confirmYesBtn, confirmNoBtn;
let confirmResolve;

function createConfirmModal() {
  confirmModal = el("div", { id: "confirmModal", class: "confirm-modal" });
  confirmModal.innerHTML = `
    <div class="modal-content">
      <p id="confirmText">Are you sure?</p>
      <div class="modal-actions">
        <button id="confirmYes">Yes</button>
        <button id="confirmNo">No</button>
      </div>
    </div>`;
  document.body.appendChild(confirmModal);

  confirmText = confirmModal.querySelector("#confirmText");
  confirmYesBtn = confirmModal.querySelector("#confirmYes");
  confirmNoBtn = confirmModal.querySelector("#confirmNo");

  confirmYesBtn.onclick = () => {
    confirmModal.classList.remove("open");
    if (confirmResolve) confirmResolve(true);
  };

  confirmNoBtn.onclick = () => {
    confirmModal.classList.remove("open");
    if (confirmResolve) confirmResolve(false);
  };
}

async function customConfirm(message) {
  if (!confirmModal) createConfirmModal();
  confirmText.textContent = message;
  confirmModal.classList.add("open");

  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}


// Likes & comments
async function toggleLike(postId, likeBtn) {
  const icon = likeBtn.querySelector("i");
  const countSpan = likeBtn.querySelector("span");
  const prevCount = parseInt(countSpan.textContent || "0", 10);
  const currentlyLiked = likeBtn.classList.contains("liked");


  likeBtn.classList.toggle("liked", !currentlyLiked);
  icon.className = !currentlyLiked ? "fa-solid fa-heart" : "fa-regular fa-heart";
  countSpan.textContent = !currentlyLiked ? String(prevCount + 1) : String(Math.max(0, prevCount - 1));


  try {
    const res = await fetch(`${POSTING_BASE}/${postId}/like`, { method: "POST", headers: authHeader });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const liked = !!data.liked;
    likeBtn.classList.toggle("liked", liked);
    icon.className = liked ? "fa-solid fa-heart" : "fa-regular fa-heart";
    countSpan.textContent = String(data.likesCount || 0);

    if (liked) showToast("Liked post", "success");
    else showToast("Unliked post", "info");

    await window.refreshPostLikes(postId);

  } catch (err) {
    console.error("Like failed:", err);

    likeBtn.classList.toggle("liked", currentlyLiked);
    icon.className = currentlyLiked ? "fa-solid fa-heart" : "fa-regular fa-heart";
    countSpan.textContent = String(prevCount);
    showToast("Like failed", "error");
  }
}

async function toggleComments(node, postId) {
  let panel = q(".comments-panel", node);

  if (panel) {
    panel.classList.remove("open");
    setTimeout(() => panel.remove(), 300);
    return;
  }

  panel = el("div", { class: "comments-panel" }, [el("div", { class: "loading" }, ["Loading comments…"])]);
  node.appendChild(panel);
  setTimeout(() => panel.classList.add("open"), 10);

  try {
    const res = await fetch(`${POSTS_API}/${postId}/comments`, { headers: authHeader });
    const data = await res.json();
    panel.innerHTML = "";

    if (!data.comments?.length) {
      panel.innerHTML = `<div class="placeholder">No comments yet.</div>`;
      return;
    }

    data.comments.forEach((c) => {
      const item = el("div", { class: "comment-item", "data-comment-id": c._id });
      item.appendChild(el("img", { src: c.userId?.profile_image || "./assets/images/user-avatar.png", class: "comment-avatar" }));

      const body = el("div", { class: "comment-body" }, [
        el("div", { class: "comment-author" }, [safeText(c.userId?.name)]),
        el("div", { class: "comment-text" }, [safeText(c.text)]),
      ]);
      item.appendChild(body);

      // Add Actions if owner
      // Use string comparison for IDs to be safe
      const currentUserId = currentUser?._id || currentUser?.id;
      const commentUserId = c.userId?._id || c.userId;

      if (currentUserId && String(currentUserId) === String(commentUserId)) {
        const actions = el("div", { class: "comment-actions" });

        const editBtn = el("button", { class: "comment-action-btn edit", title: "Edit (5m limit)" }, [el("i", { class: "fa-solid fa-pen" })]);
        editBtn.onclick = () => enableCommentEdit(c, item);

        const delBtn = el("button", { class: "comment-action-btn delete", title: "Delete" }, [el("i", { class: "fa-solid fa-trash" })]);
        delBtn.onclick = () => deleteComment(c._id);

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        item.appendChild(actions);
      }

      panel.appendChild(item);
    });
  } catch (err) {
    console.error("Comments load error:", err);
    panel.innerHTML = `<div class="error">Unable to load comments</div>`;
  }
}

window.refreshPostLikes = async function (postId) {
  try {
    const res = await fetch(`${POSTS_API}/${postId}`, { headers: authHeader });
    if (!res.ok) return;
    const post = await res.json();
    window.updatePostInDOM(post);
  } catch (err) {
    console.error("Failed to refresh like count:", err);
  }
};

function renderPostsToDOM(posts = []) {
  dom.postsContainer.innerHTML = "";
  posts.reverse().forEach((p) => dom.postsContainer.appendChild(buildPostNode(p)));
  bindPostEvents();
}

window.renderPost = (post, { prepend = false } = {}) => {
  if (document.querySelector(`.feed-post[data-id="${post._id}"]`)) return; // Prevent duplicates
  const node = buildPostNode(post);
  if (prepend && dom.postsContainer.firstChild) dom.postsContainer.insertBefore(node, dom.postsContainer.firstChild);
  else dom.postsContainer.appendChild(node);
  bindPostEventsFor(node);
};

window.updatePostInDOM = (post) => {
  const ex = q(`.feed-post[data-id="${post._id}"]`, dom.postsContainer);
  const newNode = buildPostNode(post);
  if (ex) ex.replaceWith(newNode);
  else dom.postsContainer.prepend(newNode);
  bindPostEventsFor(newNode);
};

// Events binding 
function bindPostEvents() {
  qa(".feed-post").forEach((n) => bindPostEventsFor(n));
}
function bindPostEventsFor(node) {
  const id = node.dataset.id;


  const likeBtnOld = q(".like-count", node);
  if (likeBtnOld) {
    likeBtnOld.replaceWith(likeBtnOld.cloneNode(true));
  }
  const commentBtnOld = q(".comment-count", node);
  if (commentBtnOld) {
    commentBtnOld.replaceWith(commentBtnOld.cloneNode(true));
  }


  const likeBtn = q(".like-count", node);
  const commentBtn = q(".comment-count", node);

  if (likeBtn) {
    likeBtn.addEventListener("click", (e) => toggleLike(id, e.currentTarget));
  }
  if (commentBtn) {
    commentBtn.addEventListener("click", () => toggleComments(node, id));
  }

  const inp = q(".post-comment-input input", node);
  if (inp)
    inp.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && inp.value.trim()) {
        try {
          const res = await fetch(`${POSTS_API}/${id}/comments`, {
            method: "POST",
            headers: { ...authHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ text: inp.value.trim() }),
          });
          if (res.ok) {
            inp.value = "";
            showToast("Comment added", "success");

            // Manually add comment to DOM if panel is open
            const panel = q(".comments-panel", node);
            if (panel && panel.classList.contains("open")) {
              const item = el("div", { class: "comment-item" });
              item.appendChild(el("img", { src: currentUser.profile_image || "./assets/images/user-avatar.png", class: "comment-avatar" }));
              const body = el("div", { class: "comment-body" }, [
                el("div", { class: "comment-author" }, [safeText(currentUser.name)]),
                el("div", { class: "comment-text" }, [safeText(inp.value.trim())]),
              ]);
              item.appendChild(body);

              // Remove "No comments" placeholder if exists
              const placeholder = q(".placeholder", panel);
              if (placeholder) placeholder.remove();

              panel.insertBefore(item, panel.firstChild); // Newest first or append? usually append for comments, but let's match existing flow. Actually API sorts desc, so usually prepend. Let's just prepend to match natural flow
            }

            // Update count
            const countSpan = q(".comment-count span", node);
            if (countSpan) {
              const current = parseInt(countSpan.textContent || "0");
              countSpan.textContent = String(current + 1);
            }

            // if (typeof window.loadPosts === 'function') window.loadPosts(); // REMOVED FULL RELOAD
          } else {
            throw new Error('Comment failed');
          }
        } catch {
          showToast("Comment failed", "error");
        }
      }
    });
}

// Create post UI handlers
if (dom.attachBtn && dom.mediaPreviewWrap) {
  dom.attachBtn.onclick = () => dom.mediaPreviewWrap.querySelector('input')?.click() || dom.mediaInput?.click();
}

const mediaInput = document.getElementById("mediaInput");
if (mediaInput) {
  mediaInput.addEventListener("change", (e) => {
    selectedFiles = Array.from(e.target.files).slice(0, MAX_MEDIA);
    dom.mediaPreviewWrap.innerHTML = "";
    selectedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = el("img", { src: ev.target.result, class: "preview-thumb" });
        dom.mediaPreviewWrap.appendChild(img);
      };
      reader.readAsDataURL(file);
    });
  });
}

if (dom.postBtn) {
  dom.postBtn.onclick = async () => {
    const text = dom.postInput.value.trim();
    if (!text && selectedFiles.length === 0) return showToast("Write something first", "warning");

    const formData = new FormData();
    formData.append("content", text);
    selectedFiles.forEach((f) => formData.append("media", f));

    try {
      const res = await fetch(POSTS_API, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
      if (!res.ok) throw new Error();
      const newPost = await res.json();
      const postObj = newPost.post || newPost;
      dom.postInput.value = "";
      selectedFiles = [];
      dom.mediaPreviewWrap.innerHTML = "";
      window.renderPost(postObj, { prepend: true });
      showToast("Post created", "success");
    } catch {
      showToast("Failed to post", "error");
    }
  };
}

let currentSort = "all";

async function loadPosts() {
  const res = await fetch(POSTS_API, { headers: authHeader });
  const posts = await res.json();

  const me = JSON.parse(localStorage.getItem("user"));
  const myId = me?._id;
  const myFollowing = me?.following || [];


  let visiblePosts = posts;


  if (currentSort === "following") {
    visiblePosts = posts.filter(
      p =>
        myFollowing.includes(p.authorId?._id || p.authorId) &&
        (p.authorId?._id || p.authorId) !== myId
    );
  }

  renderPostsToDOM(visiblePosts);
}


const sortBtn = document.getElementById("sortPostsBtn");
if (sortBtn) {
  sortBtn.addEventListener("click", () => {
    currentSort = currentSort === "all" ? "following" : "all";
    sortBtn.textContent = currentSort === "all" ? "All Users" : "Following";
    loadPosts();
  });
}

// FOLLOW & SUGGESTIONS UI

// LOAD SUGGESTIONS 
async function loadSuggestions() {
  try {
    const res = await fetch(`${FOLLOW_API_BASE}/suggestions`, { headers: authHeader });
    if (!res.ok) throw new Error("Failed to fetch suggestions");

    const users = await res.json();
    const currentUser = JSON.parse(localStorage.getItem("user"));
    dom.suggestionsList.innerHTML = "";

    users.forEach((u) => {
      if (!u._id || currentUser._id === u._id) return;


      if (u.isFollowing) return;

      const card = el("div", { class: "suggestion-card", "data-id": u._id });

      const avatar = el("img", {
        src: u.profile_image || "./assets/images/user-avatar.png",
        class: "suggestion-avatar",
      });

      const info = el("div", { class: "suggestion-info" }, [
        el("h4", {}, [safeText(u.name)]),
        el("p", { class: "suggestion-role" }, [safeText(u.role || "Member")]),
      ]);


      const btn = el(
        "button",
        { class: "follow-btn", "data-id": u._id },
        [u.isFollowing ? "Following" : "Follow"]
      );
      btn.dataset.state = u.isFollowing ? "following" : "";
      if (u.isFollowing) btn.classList.add("following");

      btn.onclick = () => handleFollow(u._id, btn, card);

      card.appendChild(avatar);
      card.appendChild(info);
      card.appendChild(btn);
      dom.suggestionsList.appendChild(card);
    });
  } catch (err) {
    console.error("Suggestion load failed:", err);
    dom.suggestionsList.innerHTML = `<div class="error">Failed to load users</div>`;
  }
}


// --- HANDLE FOLLOW/UNFOLLOW ---
async function handleFollow(targetId, btn, card) {
  const currentState = btn.dataset.state || "";
  const isFollowing = currentState === "following";

  try {
    if (isFollowing) {

      const res = await fetch(`${FOLLOW_API_BASE}/unfollow/${targetId}`, {
        method: "DELETE",
        headers: authHeader,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Unfollow failed");


      btn.textContent = "Follow";
      btn.dataset.state = "";
      btn.classList.remove("following");
      showToast("Unfollowed successfully", "info");


      if (card && card.remove) card.remove();


      if (data.followingCount !== undefined && dom.followingCount) {
        dom.followingCount.textContent = data.followingCount;
        currentUser.following_count = data.followingCount;
      }
      if (data.followersCount !== undefined && dom.connectionsCount) {
        dom.connectionsCount.textContent = data.followersCount;
        currentUser.followers_count = data.followersCount;
      }


      localStorage.setItem("user", JSON.stringify(currentUser));


      if (typeof window.loadSuggestions === "function") window.loadSuggestions();
      if (typeof window.loadCurrentUser === "function") window.loadCurrentUser();

    } else {

      btn.textContent = "Following";
      btn.dataset.state = "following";
      btn.classList.add("following");

      const res = await fetch(`${FOLLOW_API_BASE}/follow/${targetId}`, {
        method: "POST",
        headers: authHeader,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Follow failed");

      showToast("Following this user!", "success");


      if (card && card.remove) card.remove();


      if (data.followingCount !== undefined && dom.followingCount) {
        dom.followingCount.textContent = data.followingCount;
        currentUser.following_count = data.followingCount;
      }
      if (data.followersCount !== undefined && dom.connectionsCount) {
        dom.connectionsCount.textContent = data.followersCount;
        currentUser.followers_count = data.followersCount;
      }


      localStorage.setItem("user", JSON.stringify(currentUser));


      if (typeof window.loadSuggestions === "function") window.loadSuggestions();
      if (typeof window.loadCurrentUser === "function") window.loadCurrentUser();
    }
  } catch (err) {
    console.error("Follow error:", err);

    if (!isFollowing) {
      btn.textContent = "Follow";
      btn.dataset.state = "";
      btn.classList.remove("following");
    }
    showToast(err.message || "Unable to follow/unfollow user", "error");
  }
}

// --- CONNECTIONS/FOLLOWINGS PANEL HANDLING ---
const connectionsPanel = document.getElementById("connectionsPanel");
const connectionsPanelTitle = document.getElementById("connectionsPanelTitle");
const connectionsPanelBody = document.getElementById("connectionsPanelBody");
const closeConnectionsPanel = document.getElementById("closeConnectionsPanel");
const connectionsPanelText = document.getElementById("connectionsPanelText");

if (closeConnectionsPanel) {
  closeConnectionsPanel.onclick = () => connectionsPanel.classList.remove("open");
}

async function openConnectionsPanel(type = "followers", userId = null) {
  try {
    if (!userId) userId = currentUser?._id;
    if (!userId) return;

    connectionsPanelText.textContent = type === "followers" ? "Followers" : "Following";
    connectionsPanelBody.innerHTML = "<div class='loading'>Loading…</div>";
    connectionsPanel.classList.add("open");

    const res = await fetch(`${FOLLOW_API_BASE}/${type}/${userId}`, { headers: authHeader });
    if (!res.ok) throw new Error("Failed to load list");
    const list = await res.json();

    if (!Array.isArray(list) || list.length === 0) {
      connectionsPanelBody.innerHTML = "<div class='placeholder'>No users found.</div>";
      return;
    }

    connectionsPanelBody.innerHTML = "";

    list.forEach((u) => {
      const item = el("div", { class: "conn-item" });
      const img = el("img", {
        src: u.profile_image || "./assets/images/user-avatar.png",
        alt: u.name,
      });

      const info = el("div", { class: "conn-info" }, [
        el("div", { class: "conn-name" }, [safeText(u.name)]),
        el("div", { class: "conn-role" }, [safeText(u.role || "")]),
      ]);


      const isFollowing =
        currentUser?.following?.some(fid => fid === u._id) ||
        currentUser?.following?.some(fid => fid?._id === u._id);

      const btnText = isFollowing ? "Unfollow" : "Follow";
      const btn = el(
        "button",
        {
          class: `follow-btn tiny ${isFollowing ? "following" : ""}`,
          "data-id": u._id,
          "data-state": isFollowing ? "following" : "",
        },
        [btnText]
      );


      btn.onclick = () => handleFollow(u._id, btn, item);

      item.append(img, info, btn);
      connectionsPanelBody.appendChild(item);
    });
  } catch (err) {
    console.error("Open connections panel error:", err);
    connectionsPanelBody.innerHTML = `<div class="error">Unable to load list</div>`;
  }
}

//Attach listeners
document.addEventListener("DOMContentLoaded", () => {
  if (dom.connectionsCount) {
    dom.connectionsCount.style.cursor = "pointer";
    dom.connectionsCount.addEventListener("click", () =>
      openConnectionsPanel("followers", currentUser?._id)
    );
  }

  if (dom.followingCount) {
    dom.followingCount.style.cursor = "pointer";
    dom.followingCount.addEventListener("click", () =>
      openConnectionsPanel("following", currentUser?._id)
    );
  }
});



// --- CHAT SECTION HANDLING ---
const chatList = document.getElementById("chatList");
const chatPanel = document.getElementById("chatPanel");
const chatUserImg = document.getElementById("chatUserImg");
const chatUserName = document.getElementById("chatUserName");
const chatPanelBody = document.getElementById("chatPanelBody");
const closeChatPanel = document.getElementById("closeChatPanel");

if (closeChatPanel) closeChatPanel.onclick = () => chatPanel.classList.remove("open");

async function loadChatList() {
  try {
    chatList.innerHTML = "<div class='loading'>Loading…</div>";
    // FETCH from correct CHAT API (sync with chat.js)
    const res = await fetch(`${API_BASE}/chat/conversations/recent`, { headers: authHeader });

    if (!res.ok) throw new Error("Failed to fetch connections");
    const conversations = await res.json();
    console.log("DEBUG: Conversations:", conversations);

    if (!Array.isArray(conversations) || conversations.length === 0) {
      chatList.innerHTML = "<div class='placeholder'>No connections to chat with yet.</div>";
      return;
    }

    chatList.innerHTML = "";
    conversations.forEach((c) => {
      // Chat API returns { _id, lastMessage, userDetails: {...} }
      const u = c.userDetails;
      if (!u) return;

      const card = el("div", { class: "chat-card" });
      const img = el("img", {
        src: u.profile_image || "./assets/images/user-avatar.png",
        alt: u.name,
      });

      const lastMsgText = c.lastMessage?.content || "Message…";
      const truncatedMsg = lastMsgText.length > 20 ? lastMsgText.substring(0, 20) + "..." : lastMsgText;

      const info = el("div", { class: "chat-info" }, [
        el("div", { class: "chat-name" }, [safeText(u.name)]),
        el("div", { class: "chat-subtext" }, [truncatedMsg]),
      ]);
      const btn = el("button", { class: "chat-btn" }, ["Chat"]);

      // Pass the user object to openChatPanel (needs name, profile_image, _id)
      btn.onclick = () => openChatPanel(u);

      card.dataset.userId = u._id;
      const count = c.unreadCount || 0;
      if (count > 0) {
        const badge = el("span", { class: "chat-badge" }, [String(count)]);
        card.appendChild(badge);
      }

      card.append(img, info, btn);
      chatList.appendChild(card);
    });
  } catch (err) {
    console.error("Chat list error:", err);
    chatList.innerHTML = "<div class='error'>Unable to load chats.</div>";
  }
}

let currentChatUserId = null;

function openChatPanel(user) {
  currentChatUserId = user._id;
  chatUserImg.src = user.profile_image || "./assets/images/user-avatar.png";
  chatUserName.textContent = user.name || "User";
  chatPanel.classList.add("open");

  // Clear badge
  const card = document.querySelector(`.chat-card[data-user-id="${user._id}"]`);
  if (card) {
    const badge = card.querySelector(".chat-badge");
    if (badge) badge.remove();
  }

  // Reset Body
  chatPanelBody.innerHTML = "<div class='loading'>Loading history...</div>";

  // Create Footer if not exists
  let footer = chatPanel.querySelector(".chat-panel-footer");
  if (!footer) {
    footer = el("div", { class: "chat-panel-footer" });
    footer.innerHTML = `
      <input type="text" class="chat-input" placeholder="Type a message..." />
      <button class="chat-send-btn"><i class="fa-solid fa-paper-plane"></i></button>
    `;
    chatPanel.appendChild(footer);

    // Bind events
    const input = footer.querySelector("input");
    const sendBtn = footer.querySelector("button");

    const send = () => {
      const val = input.value.trim();
      if (val && currentChatUserId) {
        sendChatMessage(currentChatUserId, val);
        input.value = "";
      }
    };

    sendBtn.onclick = send;
    input.onkeydown = (e) => {
      if (e.key === "Enter") send();
    };
  } else {
    // If footer exists, just clear input
    const input = footer.querySelector("input");
    if (input) input.value = "";
  }

  fetchChatHistory(user._id);
}

async function fetchChatHistory(userId) {
  try {
    const res = await fetch(`${API_BASE}/chat/${userId}`, { headers: authHeader });
    if (!res.ok) throw new Error("Failed to load history");
    const messages = await res.json();

    chatPanelBody.innerHTML = "";
    if (messages.length === 0) {
      chatPanelBody.innerHTML = "<p class='placeholder'>No messages yet. Say hi!</p>";
      return;
    }

    const myId = JSON.parse(localStorage.getItem("user"))?._id;
    messages.forEach(msg => renderMessage(msg, myId));

    // Scroll to bottom
    chatPanelBody.scrollTop = chatPanelBody.scrollHeight;
  } catch (err) {
    console.error(err);
    chatPanelBody.innerHTML = "<p class='error'>Error loading messages.</p>";
  }
}

function renderMessage(msg, myId) {
  const isMe = (msg.sender === myId || msg.sender?._id === myId);
  const bubble = el("div", { class: `message-bubble ${isMe ? "message-sent" : "message-received"}` });

  bubble.textContent = msg.content;

  const time = el("span", { class: "message-time" });
  time.textContent = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  bubble.appendChild(time);
  chatPanelBody.appendChild(bubble);
}

async function sendChatMessage(recipientId, content) {
  try {
    // Optimistic Render
    const myId = JSON.parse(localStorage.getItem("user"))?._id;
    const tempMsg = { content, sender: myId, createdAt: new Date() };

    // Remove placeholder if exists
    const placeholder = chatPanelBody.querySelector(".placeholder");
    if (placeholder) placeholder.remove();

    renderMessage(tempMsg, myId);
    chatPanelBody.scrollTop = chatPanelBody.scrollHeight;

    const res = await fetch(`${API_BASE}/chat/send`, {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ recipientId, content })
    });

    if (!res.ok) throw new Error("Failed to send");

    // In a real app we might replace the optimistic message with the real one, 
    // but for now this is fine. Triggering a reload is also an option but jarring.

  } catch (err) {
    console.error(err);
    showToast("Failed to send message", "error");
  }
}

window.handleIncomingMessage = (msg) => {
  // 1. If chat open with this user
  if (document.getElementById("chatPanel").classList.contains("open") && currentChatUserId === msg.sender) {
    const myId = JSON.parse(localStorage.getItem("user"))?._id;
    // msg.sender is ID string, renderMessage handles it
    renderMessage(msg, myId);
    const body = document.getElementById("chatPanelBody");
    body.scrollTop = body.scrollHeight;
  } else {
    // 2. Else update badge
    const card = document.querySelector(`.chat-card[data-user-id="${msg.sender}"]`);
    if (card) {
      let badge = card.querySelector(".chat-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "chat-badge";
        badge.textContent = "0";
        card.appendChild(badge);
      }
      badge.textContent = String(parseInt(badge.textContent || "0") + 1);

      // Update preview text
      const subtext = card.querySelector(".chat-subtext");
      if (subtext) subtext.textContent = msg.content.length > 20 ? msg.content.substring(0, 20) + "..." : msg.content;

    } else {
      // New conversation? Reload list
      if (typeof loadChatList === 'function') loadChatList();
    }
    if (typeof showToast === 'function') showToast("New message received", "info");
  }
};


// Init
(async function init() {
  await loadCurrentUser();
  await loadPosts();
  await loadSuggestions();
  await loadChatList();
  showToast("Feed loaded", "info", 900);
})();



// ==========================================
// COMMENT EDIT/DELETE FUNCTIONS (Appended)
// ==========================================

async function enableCommentEdit(comment, itemNode) {
  const body = itemNode.querySelector(".comment-body");
  const originalText = comment.text;

  // Check time limit client-side as well
  const diff = Date.now() - new Date(comment.createdAt).getTime();
  if (diff > 5 * 60 * 1000) return showToast("Time limit exceeded", "error");

  body.innerHTML = "";
  const input = el("input", { type: "text", class: "comment-edit-input", value: originalText });
  const saveBtn = el("button", { class: "btn-primary btn-sm" }, ["Save"]);
  const cancelBtn = el("button", { class: "btn-secondary btn-sm" }, ["Cancel"]);

  const wrapper = el("div", { class: "edit-wrapper" }, [input, saveBtn, cancelBtn]);
  body.appendChild(wrapper);

  cancelBtn.onclick = () => {
    body.innerHTML = "";
    body.appendChild(el("div", { class: "comment-author" }, [safeText(comment.userId?.name)]));
    body.appendChild(el("div", { class: "comment-text" }, [safeText(originalText)]));
  };

  saveBtn.onclick = async () => {
    const newText = input.value.trim();
    if (!newText || newText === originalText) return cancelBtn.click();

    try {
      const res = await fetch(`${POSTING_BASE}/comments/${comment._id}`, {
        method: "PUT",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ text: newText }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Edit failed");

      comment.text = newText; // update local object
      body.innerHTML = "";
      body.appendChild(el("div", { class: "comment-author" }, [safeText(comment.userId?.name)]));
      body.appendChild(el("div", { class: "comment-text" }, [safeText(newText)]));
      showToast("Comment updated", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  };
}

async function deleteComment(commentId) {
  if (!await customConfirm("Delete this comment?")) return;

  try {
    const res = await fetch(`${POSTING_BASE}/comments/${commentId}`, {
      method: "DELETE",
      headers: authHeader,
    });
    if (!res.ok) throw new Error("Delete failed");

    // Remove from DOM locally
    const item = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
    if (item) {
      // decrement count
      const postNode = item.closest(".feed-post");
      if (postNode) {
        const countSpan = postNode.querySelector(".comment-count span");
        if (countSpan) countSpan.textContent = String(Math.max(0, parseInt(countSpan.textContent || 0) - 1));
      }
      item.remove();
    }

    showToast("Comment deleted", "success");
  } catch (err) {
    showToast("Failed to delete comment", "error");
  }
}

// INJECT STYLES FOR BUTTONS
const style = document.createElement("style");
style.innerHTML = `
.comment-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
  align-items: center;
}
.comment-action-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  color: #666;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}
.comment-action-btn:hover {
  background: #f0f0f0;
  color: #333;
}
.comment-action-btn.delete:hover {
  color: #e74c3c;
  background: #ffe6e6;
}
.comment-edit-input {
  width: 100%;
  padding: 6px;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 6px;
}
.edit-wrapper {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.btn-sm {
  padding: 4px 10px;
  font-size: 0.8rem;
}
.chat-card {
  position: relative;
}
.chat-badge {
    background: #FF5252;
    color: white;
    border-radius: 50%;
    padding: 2px 6px;
    font-size: 0.75rem;
    position: absolute;
    top: 5px;
    top: 5px;
    right: 5px;
    font-weight: bold;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    z-index: 100;
}
`;
document.head.appendChild(style);
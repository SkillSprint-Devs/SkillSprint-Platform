// board.js
(function () {
  'use strict';

  // --- Scoped Variables ---
  let canvas, ctx;
  let scale = 1;
  let translate = { x: 0, y: 0 };
  let virtualSize = { w: 2000, h: 1500 };
  let tool = 'pen';
  let drawing = false;
  let last = null;
  let panning = false;
  let panStart = null;

  const undoStack = [];
  const redoStack = [];
  const MAX_STACK = 40;

  const API_BASE = `${window.API_BASE_URL}/board`;

  // --- Auth & Initial Data ---
  const urlParams = new URLSearchParams(window.location.search);
  window.currentBoardId = urlParams.get('id');
  const boardToken = urlParams.get('token') || urlParams.get('join');

  if (boardToken && !window.currentBoardId) {
    (async () => {
      try {
        const t = localStorage.getItem('token');
        if (!t) return window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.href);
        const res = await fetch(`${API_BASE}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
          body: JSON.stringify({ token: boardToken })
        });
        const data = await res.json();
        if (data.success) window.location.href = `board.html?id=${data.data.boardId}`;
        else { alert('Invalid invite link.'); window.location.href = 'dashboard.html'; }
      } catch (e) { console.error(e); }
    })();
  }

  const userStr = localStorage.getItem('user');
  window.CURRENT_USER = userStr ? JSON.parse(userStr) : null;

  function notify(msg, type = 'info') {
    if (typeof showToast === 'function') showToast(msg, type);
    else alert(msg);
  }

  function safeLog(...args) {
    if (window.console && console.log) console.log('[smartboard]', ...args);
  }

  // --- Snapshots (Undo/Redo) ---
  function pushSnapshot() {
    if (!canvas) return;
    try {
      const data = canvas.toDataURL();
      if (undoStack.length >= MAX_STACK) undoStack.shift();
      undoStack.push(data);
      redoStack.length = 0;
      updateUndoRedoUI();
    } catch (e) { console.error('Push Snapshot Error:', e); }
  }

  function updateUndoRedoUI() {
    const uBtn = document.getElementById('undoBtn');
    const rBtn = document.getElementById('redoBtn');
    if (uBtn) uBtn.style.opacity = undoStack.length > 0 ? '1' : '0.4';
    if (rBtn) rBtn.style.opacity = redoStack.length > 0 ? '1' : '0.4';
  }

  function undo() {
    if (!undoStack.length || !canvas) return;
    try {
      redoStack.push(canvas.toDataURL());
      const data = undoStack.pop();
      if (data) loadSnapshot(data);
      updateUndoRedoUI();
      if (window.BoardSocket) window.BoardSocket.emitUndo();
    } catch (e) { console.error('Undo Error:', e); }
  }

  function redo() {
    if (!redoStack.length || !canvas) return;
    try {
      undoStack.push(canvas.toDataURL());
      const data = redoStack.pop();
      if (data) loadSnapshot(data);
      updateUndoRedoUI();
      if (window.BoardSocket) window.BoardSocket.emitRedo();
    } catch (e) { console.error('Redo Error:', e); }
  }

  function loadSnapshot(dataUrl) {
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = dataUrl;
  }

  // --- Core Board Logic ---
  async function loadBoardInfo() {
    const t = localStorage.getItem('token');
    if (!t || !window.currentBoardId) return;
    try {
      const res = await fetch(`${API_BASE}/${window.currentBoardId}`, { headers: { Authorization: `Bearer ${t}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      const nameEl = document.getElementById('boardName');
      if (nameEl) nameEl.textContent = data.data.name || 'untitled';

      window.currentBoardData = data.data;
      window.currentStrokes = [...(data.data.strokes || [])];
      window.currentShapes = [...(data.data.shapes || [])];

      updateActiveUsersUI(data.data.activeUsers);
      setupRealtimeListeners();
      renderBoardState(data.data);
      pushSnapshot(); // Initial state
    } catch (e) { console.error('Load Error:', e); }
  }

  function renderBoardState(board) {
    if (!board || !ctx) return;
    if (board.strokes) {
      board.strokes.forEach(s => {
        if (!s.points || s.points.length < 2) return;
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = s.color || '#000';
        ctx.lineWidth = s.width || 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (s.tool === 'highlighter') ctx.globalAlpha = 0.3;
        if (s.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
        ctx.stroke();
        ctx.restore();
      });
    }
    if (board.shapes) {
      board.shapes.forEach(s => drawShapeFromTo(s.start, s.end, s.type, s.color, s.width));
    }
    if (board.stickies) board.stickies.forEach(s => createStickyElement(s.x, s.y, s.text, s._id));
    if (board.textBoxes) board.textBoxes.forEach(t => createTextBoxElement(t.x, t.y, t.text, t._id));
  }

  async function saveBoard() {
    if (!window.currentBoardId || !canvas) return;
    notify('Saving...', 'info');
    try {
      const payload = {
        stickies: Array.from(document.querySelectorAll('.sticky')).map(el => ({
          text: el.querySelector('textarea').value,
          x: parseFloat(el.style.left),
          y: parseFloat(el.style.top)
        })),
        textBoxes: Array.from(document.querySelectorAll('.text-box')).map(el => ({
          text: el.querySelector('textarea').value,
          x: parseFloat(el.style.left),
          y: parseFloat(el.style.top)
        })),
        strokes: window.currentStrokes || [],
        shapes: window.currentShapes || [],
        lastSavedImage: canvas.toDataURL('image/png')
      };
      const res = await fetch(`${API_BASE}/${window.currentBoardId}/save-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        notify('Board saved!', 'success');
      } else {
        if (res.status === 403) notify('Permission denied: Only the owner can save.', 'error');
        else notify('Save failed', 'error');
      }
    } catch (e) { console.error('Save Error:', e); }
  }

  // --- Event Handling & Initialization ---
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Navbar
    window.initNavbar({
      activePage: 'Smartboard',
      contextIcon: 'fa-puzzle-piece',
      backUrl: 'collaborations.html',
      showSearch: false,      // Hide search bar in whiteboard
      showSettingsBtn: false, // Hide settings button in whiteboard
      primaryAction: {
        show: true,
        label: 'Save Board',
        icon: 'fa-floppy-disk',
        onClick: saveBoard
      }
    });

    // Disable global notification fetch if on this page to prevent overwrite
    if (window.fetchUnreadCount) {
      const originalFetch = window.fetchUnreadCount;
      window.fetchUnreadCount = () => { console.log('[Board] Global notif fetch suppressed'); };
    }

    // Initial board notification count
    updateBoardNotificationBadge();

    // Inject Board actions (Invite, Share, Help) into standardized navbar
    const navRight = document.querySelector('.nav-right');
    if (navRight) {
      const btnGroup = document.createElement('div');
      btnGroup.style.display = 'flex';
      btnGroup.style.gap = '12px';
      btnGroup.style.alignItems = 'center';
      btnGroup.style.marginRight = '12px';
      btnGroup.innerHTML = `
          <button class="icon-btn" title="Invite Collaborators"><i class="fa-solid fa-user-plus"></i></button>
          <button class="icon-btn" title="Share Link"><i class="fa-solid fa-share-nodes"></i></button>
          <button class="icon-btn" title="Board Help" onclick="alert('Smartboard Guide coming soon!')"><i class="fa-solid fa-circle-question"></i></button>
        `;
      const profileBadge = navRight.querySelector('.current-user-badge') || navRight.querySelector('.mobile-menu-btn');
      if (profileBadge) navRight.insertBefore(btnGroup, profileBadge);
      else navRight.appendChild(btnGroup);
    }

    // 2. Setup Canvas
    canvas = document.getElementById('boardCanvas');
    if (!canvas) return safeLog('Canvas not found');
    ctx = canvas.getContext('2d');

    setCanvasSize();

    // 3. Setup Listeners
    loadBoardInfo();
    setupToolbox();
    setupCommentPanel();
    setupModals();

    // Listen for board-specific notification updates via sio events
    window.addEventListener('board:notification:refresh', () => {
      updateBoardNotificationBadge();
    });

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveBoard(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    });

    canvas.addEventListener('pointerdown', pointerDownHandler);
    window.addEventListener('pointermove', pointerMoveHandler);
    window.addEventListener('pointerup', pointerUpHandler);
  });

  // --- Helpers ---
  function setCanvasSize() {
    if (!canvas) return;
    canvas.width = virtualSize.w;
    canvas.height = virtualSize.h;
    canvas.style.width = virtualSize.w + 'px';
    canvas.style.height = virtualSize.h + 'px';
  }

  function setupToolbox() {
    // 1. Tool Buttons (Pen, Eraser, etc.)
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const t = btn.dataset.tool;

        // Momentary actions (Undo/Redo)
        if (t === 'undo') { undo(); return; }
        if (t === 'redo') { redo(); return; }

        // Persistent tools
        document.querySelectorAll('.tool-btn[data-tool]').forEach(b => {
          if (!['undo', 'redo'].includes(b.dataset.tool)) b.classList.remove('active');
        });
        btn.classList.add('active');
        tool = t;
      };
    });

    // 2. Premium Color Picker Toggle
    const pColorBtn = document.getElementById('premiumColorBtn');
    const realPicker = document.getElementById('colorPicker');
    if (pColorBtn && realPicker) {
      pColorBtn.onclick = () => realPicker.click();
      realPicker.oninput = (e) => {
        const val = e.target.value;
        const grad = pColorBtn.querySelector('.color-gradient');
        if (grad) {
          grad.style.background = val;
          grad.style.border = '2px solid white';
        }
      };
    }

    // 3. Premium Slider Logic
    const slider = document.getElementById('strokeSlider');
    const sliderFill = document.getElementById('sliderFill');
    const realRange = document.getElementById('strokeRange');

    if (slider && sliderFill && realRange) {
      let isDragging = false;

      const updateSlider = (e) => {
        const rect = slider.getBoundingClientRect();
        let percent = ((e.clientX - rect.left) / rect.width) * 100;
        percent = Math.max(0, Math.min(100, percent));
        sliderFill.style.width = percent + '%';

        // Map 0-100% to 1-60 range
        const val = Math.round((percent / 100) * 59) + 1;
        realRange.value = val;
      };

      slider.addEventListener('mousedown', (e) => {
        isDragging = true;
        updateSlider(e);
      });

      window.addEventListener('mousemove', (e) => {
        if (isDragging) updateSlider(e);
      });

      window.addEventListener('mouseup', () => {
        isDragging = false;
      });

      // Initialize slider fill based on default range value (4/60)
      const initialPercent = ((realRange.value - 1) / 59) * 100;
      sliderFill.style.width = initialPercent + '%';
    }
  }

  async function updateBoardNotificationBadge() {
    if (!window.currentBoardId) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${window.API_BASE_URL}/board/${window.currentBoardId}/notifications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        const userId = window.CURRENT_USER?._id || window.CURRENT_USER?.id;
        const unreadCount = data.data.filter(n => !n.readBy.includes(userId)).length;

        const badge = document.getElementById('navbarNotifBadge');
        if (badge) {
          if (unreadCount > 0) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.style.display = 'flex';
          } else {
            badge.style.display = 'none';
          }
        }
      }
    } catch (e) {
      console.warn('[Board] Failed to update notif badge', e);
    }
  }

  function setupCommentPanel() {
    const triggers = ['toggleComments', 'commentToggle'];

    triggers.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', (e) => {
        if (e) e.preventDefault();
        toggleComments();
      });
    });

    const closeBtn = document.getElementById('closeComments');
    if (closeBtn) closeBtn.addEventListener('click', () => toggleComments(false));

    const send = document.getElementById('sendComment');
    const input = document.getElementById('commentText');

    if (send) send.onclick = async () => {
      const text = input.value.trim();
      if (!text) return;
      try {
        const res = await fetch(`${API_BASE}/${window.currentBoardId}/comment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify({ text })
        });
        if (res.ok) {
          input.value = '';
          await loadComments();
          notify('Comment added', 'success');
        }
      } catch (e) {
        console.error(e);
        notify('Failed to add comment', 'error');
      }
    };
  }

  function toggleComments(force) {
    const panel = document.getElementById('commentsPanel');
    const fabButton = document.getElementById('toggleComments');
    if (!panel) return;

    const currentlyOpen = panel.classList.contains('open');
    const shouldOpen = typeof force === 'boolean' ? force : !currentlyOpen;

    if (shouldOpen) {
      panel.classList.add('open');
      if (fabButton) fabButton.classList.add('hidden');
      loadComments();
      markBoardNotificationsAsRead();
    } else {
      panel.classList.remove('open');
      if (fabButton) fabButton.classList.remove('hidden');
    }
  }

  async function markBoardNotificationsAsRead() {
    if (!window.currentBoardId) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${window.API_BASE_URL}/board/${window.currentBoardId}/notifications/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        updateBoardNotificationBadge();
      }
    } catch (e) {
      console.warn('[Board] Failed to mark notifs as read', e);
    }
  }

  async function loadComments() {
    try {
      const res = await fetch(`${API_BASE}/${window.currentBoardId}/comments`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (data.success) {
        window.currentBoardComments = data.data || [];
        renderComments();
      }
    } catch (e) { console.error('Load Comments Error:', e); }
  }

  function renderComments() {
    const list = document.getElementById('commentsList');
    if (!list) return;

    const comments = window.currentBoardComments || [];

    if (comments.length === 0) {
      list.innerHTML = `
        <div class="comments-empty" style="padding: 40px 20px; text-align: center; color: #cbe050;">
          <i class="fa-solid fa-comments" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
          <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #777;">No Comments Yet</h3>
          <p style="margin: 0; font-size: 13px;">Start a discussion by adding a comment below</p>
        </div>
      `;
      return;
    }

    // Get current user ID for edit/delete buttons
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const currentUserId = currentUser._id || currentUser.id;

    list.innerHTML = '';
    // Use document fragment for bulk DOM updates
    const fragment = document.createDocumentFragment();

    comments.forEach(c => {
      const el = document.createElement('div');
      el.className = 'comment';
      el.setAttribute('data-comment-id', c._id);

      const userAvatar = c.authorId?.profile_image || c.authorId?.avatarUrl || 'assets/images/user-avatar.png';
      const userName = c.authorId?.name || 'User';
      const dateStr = c.createdAt ? new Date(c.createdAt).toLocaleString() : '';

      // Check if current user is the comment author
      const isAuthor = (c.authorId?._id || c.authorId) === currentUserId;
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
            <img src="${userAvatar}" alt="${userName}" />
            <div>
              <strong style="color: ${c.authorId?.colorTag || 'inherit'}">${userName}</strong>
              <div class="comment-meta">
                <span>${dateStr}</span>
              </div>
            </div>
          </div>
          ${actionButtons}
        </div>
        <div class="comment-text" style="line-height:1.5; color:var(--text-dark); margin-top:8px; padding-left:40px;">${c.text}</div>
      `;
      fragment.appendChild(el);

      // Attach events to elements in fragment
      const deleteBtn = el.querySelector('.delete-comment');
      if (deleteBtn) {
        deleteBtn.onclick = async (e) => {
          e.stopPropagation();
          if (!await showCustomConfirm('Are you sure you want to delete this comment?')) return;
          try {
            const delRes = await fetch(`${API_BASE}/${window.currentBoardId}/comment/${c._id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            if (delRes.ok) {
              el.remove();
              if (window.currentBoardComments) {
                window.currentBoardComments = window.currentBoardComments.filter(com => com._id !== c._id);
              }
              notify('Comment deleted', 'success');
            }
          } catch (err) { console.error('Delete error', err); }
        };
      }

      const editBtn = el.querySelector('.edit-comment');
      if (editBtn) {
        editBtn.onclick = (e) => {
          e.stopPropagation();
          const textDiv = el.querySelector('.comment-text');
          const currentText = c.text;
          textDiv.innerHTML = `
            <textarea class="comment-edit-input" style="width: 100%; min-height: 60px; padding: 8px; border-radius: 6px; border: 2px solid var(--accent); font-family: inherit; font-size: 14px;">${currentText}</textarea>
            <div style="margin-top: 8px; display: flex; gap: 8px;">
              <button class="btn small accent save-edit">Save</button>
              <button class="btn small cancel-edit">Cancel</button>
            </div>
          `;
          const saveBtn = textDiv.querySelector('.save-edit');
          const cancelBtn = textDiv.querySelector('.cancel-edit');
          const textarea = textDiv.querySelector('.comment-edit-input');
          saveBtn.onclick = async () => {
            const newText = textarea.value.trim();
            if (!newText) return notify('Comment cannot be empty', 'error');
            try {
              const res = await fetch(`${API_BASE}/${window.currentBoardId}/comment/${c._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ text: newText })
              });
              if (res.ok) {
                c.text = newText;
                textDiv.innerHTML = newText;
                notify('Comment updated', 'success');
              }
            } catch (err) { console.error('Update error', err); }
          };
          cancelBtn.onclick = () => { textDiv.innerHTML = currentText; };
        };
      }
    });

    list.appendChild(fragment);
  }


  function setupModals() {
    const inviteModal = document.getElementById('inviteModal');
    const shareModal = document.getElementById('shareModal');

    // INVITE MODAL
    document.addEventListener('click', (e) => {
      if (e.target.closest('[title="Invite Collaborators"]')) {
        inviteModal.classList.add('show');
        const searchInput = document.getElementById('inviteSearch');
        if (searchInput) searchInput.focus();
      }
      if (e.target.closest('[title="Share Link"]')) {
        shareModal.classList.add('show');
        generateShareLink('viewer');
      }
    });

    // Close buttons
    const closeInvite = () => inviteModal.classList.remove('show');
    const closeShare = () => shareModal.classList.remove('show');

    document.querySelector('.btn-close-invite')?.addEventListener('click', closeInvite);
    document.querySelector('.btn-close-share')?.addEventListener('click', closeShare);

    // Close on backdrop click
    [inviteModal, shareModal].forEach(modal => {
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) modal.classList.remove('show');
        });
      }
    });

    // INVITE SEARCH LOGIC
    let selectedUserId = null;
    const inviteSearch = document.getElementById('inviteSearch');
    if (inviteSearch) {
      inviteSearch.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        const list = document.getElementById('inviteUserList');
        const sendBtn = document.getElementById('sendInviteBtn');

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

        list.innerHTML = `
          <div style="padding: 40px 20px; text-align: center; color: #999;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; margin-bottom: 12px; color: var(--accent);"></i>
            <p style="margin: 0; font-size: 13px;">Searching...</p>
          </div>
        `;

        try {
          const res = await fetch(`${API_BASE.replace('/board', '')}/users/search?query=${query}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
          const data = await res.json();
          const users = Array.isArray(data) ? data : (data.users || []);

          if (users.length === 0) {
            list.innerHTML = `
              <div style="padding: 40px 20px; text-align: center; color: #999;">
                <i class="fa-solid fa-user-slash" style="font-size: 32px; margin-bottom: 12px; opacity: 0.3;"></i>
                <p style="margin: 0; font-size: 13px;">No users found matching "${query}"</p>
              </div>
            `;
            return;
          }

          list.innerHTML = '';
          users.forEach(u => {
            const item = document.createElement('div');
            item.className = 'user-list-item';
            item.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 12px; cursor: pointer; border-bottom: 1px solid #eee; transition: background 0.2s;';
            item.innerHTML = `
              <img src="${u.profile_image || 'assets/images/user-avatar.png'}" alt="${u.name}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
              <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 14px;">${u.name}</div>
                <div style="font-size: 12px; color: #666;">${u.email}</div>
              </div>
              <i class="fa-solid fa-circle-check" style="color: var(--accent); font-size: 20px; opacity: 0;"></i>
            `;
            item.onmouseenter = () => item.style.background = '#f0f0f0';
            item.onmouseleave = () => { if (!item.classList.contains('selected')) item.style.background = ''; };
            item.onclick = () => {
              document.querySelectorAll('.user-list-item').forEach(el => {
                el.classList.remove('selected');
                el.style.background = '';
                el.querySelector('i').style.opacity = '0';
              });
              item.classList.add('selected');
              item.style.background = 'rgba(220, 239, 98, 0.2)';
              item.querySelector('i').style.opacity = '1';
              selectedUserId = u._id;
              sendBtn.disabled = false;
            };
            list.appendChild(item);
          });
        } catch (err) {
          console.warn('Search error', err);
          list.innerHTML = `
            <div style="padding: 40px 20px; text-align: center; color: #ef4444;">
              <i class="fa-solid fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 12px;"></i>
              <p style="margin: 0; font-size: 13px;">Error searching users. Please try again.</p>
            </div>
          `;
        }
      });
    }

    // SEND INVITE
    document.getElementById('sendInviteBtn')?.addEventListener('click', async () => {
      if (!selectedUserId) {
        notify('Please select a user', 'error');
        return;
      }

      const sendBtn = document.getElementById('sendInviteBtn');
      const originalText = sendBtn.innerHTML;
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

      const perm = document.getElementById('invitePermission').value;
      try {
        const res = await fetch(`${API_BASE}/${window.currentBoardId}/invite`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ userIds: [selectedUserId], permission: perm })
        });

        if (res.ok) {
          notify('Invite sent successfully!', 'success');
          document.getElementById('inviteSearch').value = '';
          document.getElementById('inviteUserList').innerHTML = `
            <div style="padding: 40px 20px; text-align: center; color: #999;">
              <i class="fa-solid fa-magnifying-glass" style="font-size: 32px; margin-bottom: 12px; opacity: 0.3;"></i>
              <p style="margin: 0; font-size: 13px;">Start typing to search users</p>
            </div>
          `;
          selectedUserId = null;
          closeInvite();
        } else {
          const data = await res.json();
          notify(data.message || 'Failed to send invite', 'error');
          sendBtn.disabled = false;
          sendBtn.innerHTML = originalText;
        }
      } catch (err) {
        notify('Error sending invite', 'error');
        sendBtn.disabled = false;
        sendBtn.innerHTML = originalText;
      }
    });

    // SHARE LINK GENERATION
    async function generateShareLink(perm) {
      const input = document.getElementById('shareLinkInput');
      input.value = 'Generating...';
      try {
        const res = await fetch(`${API_BASE}/${window.currentBoardId}/share`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ permission: perm })
        });
        const data = await res.json();
        if (res.ok && data.shareUrl) {
          input.value = data.shareUrl;
        } else {
          input.value = `${window.location.origin}/board.html?token=${data.token || 'error'}`;
        }
      } catch (err) {
        input.value = 'Error generating link';
      }
    }

    document.getElementById('sharePermission')?.addEventListener('change', (e) => {
      generateShareLink(e.target.value);
    });

    document.getElementById('copyShareLinkBtn')?.addEventListener('click', () => {
      const input = document.getElementById('shareLinkInput');
      input.select();
      navigator.clipboard.writeText(input.value);
      notify('Link copied to clipboard', 'success');
    });
  }

  // --- Canvas Interaction Logic ---
  let shapeStart = null;

  function pointerDownHandler(e) {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    const p = getCoords(e);
    if (tool === 'sticky') { createStickyElement(p.x, p.y); return; }
    if (tool === 'text') { createTextBoxElement(p.x, p.y); return; }

    if (['pen', 'highlighter', 'eraser'].includes(tool)) {
      drawing = true;
      last = p;
      pushSnapshot();
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.strokeStyle = document.getElementById('colorPicker')?.value || '#000';
      ctx.lineWidth = document.getElementById('strokeRange')?.value || 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (tool === 'highlighter') ctx.globalAlpha = 0.3;
      if (tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
    } else if (['rectangle', 'circle'].includes(tool)) {
      drawing = true;
      shapeStart = p;
      // Cache current state for fast preview restoration
      window.previewSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
  }

  function pointerMoveHandler(e) {
    if (!drawing) return;
    const p = getCoords(e);

    if (['pen', 'highlighter', 'eraser'].includes(tool)) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      if (window.BoardSocket) {
        window.BoardSocket.emitDraw({
          type: 'path',
          x0: last.x, y0: last.y,
          x1: p.x, y1: p.y,
          color: ctx.strokeStyle,
          width: ctx.lineWidth,
          tool
        });
      }

      if (!window.currentPath) window.currentPath = [];
      window.currentPath.push({ ...p });
      last = p;
    } else if (['rectangle', 'circle'].includes(tool) && window.previewSnapshot) {
      // Fast restore from cached pixel data
      ctx.putImageData(window.previewSnapshot, 0, 0);
      // Draw preview
      drawShapeFromTo(shapeStart, p, tool, document.getElementById('colorPicker')?.value, document.getElementById('strokeRange')?.value);
    }
  }

  function pointerUpHandler(e) {
    if (!drawing) return;
    const p = getCoords(e);
    drawing = false;

    if (['pen', 'highlighter', 'eraser'].includes(tool)) {
      ctx.restore();
      if (window.currentPath && window.currentPath.length > 1) {
        if (!window.currentStrokes) window.currentStrokes = [];
        window.currentStrokes.push({
          tool,
          color: ctx.strokeStyle,
          width: ctx.lineWidth,
          points: [...window.currentPath]
        });
      }
      window.currentPath = [];
    } else if (['rectangle', 'circle'].includes(tool)) {
      const color = document.getElementById('colorPicker')?.value || '#000';
      const width = parseInt(document.getElementById('strokeRange')?.value) || 4;

      // Final draw
      drawShapeFromTo(shapeStart, p, tool, color, width);

      if (window.BoardSocket) {
        window.BoardSocket.emitDraw({
          type: 'shape',
          start: shapeStart,
          end: p,
          shapeType: tool,
          color,
          width
        });
      }

      if (!window.currentShapes) window.currentShapes = [];
      window.currentShapes.push({ type: tool, start: shapeStart, end: p, color, width });
      shapeStart = null;
    }
  }

  function getCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale
    };
  }

  function drawShapeFromTo(a, b, shape, color, width) {
    if (!ctx) return;
    ctx.save();
    ctx.strokeStyle = color || '#000';
    ctx.lineWidth = width || 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (shape === 'rectangle') {
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    } else if (shape === 'circle') {
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function createStickyElement(x, y, text = '', id = null) {
    const div = document.createElement('div');
    div.className = 'sticky';
    div.style.left = x + 'px';
    div.style.top = y + 'px';
    div.innerHTML = `
      <div class="sticky-header">
        <button class="close-sticky" title="Delete"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <textarea placeholder="Write something...">${text}</textarea>
    `;

    const closeBtn = div.querySelector('.close-sticky');
    if (closeBtn) closeBtn.onclick = () => div.remove();
    makeDraggable(div);
    document.getElementById('canvasWrapper')?.appendChild(div);
    if (window.BoardSocket && !id) window.BoardSocket.emitSticky({ x, y, text });
  }

  function createTextBoxElement(x, y, text = '', id = null) {
    const div = document.createElement('div');
    div.className = 'text-box';
    div.style.left = x + 'px';
    div.style.top = y + 'px';
    div.innerHTML = `
      <div class="text-box-header">
        <button class="close-text" title="Delete"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <textarea placeholder="Type something...">${text}</textarea>
    `;
    const closeBtn = div.querySelector('.close-text');
    if (closeBtn) closeBtn.onclick = () => div.remove();
    makeDraggable(div);
    document.getElementById('canvasWrapper')?.appendChild(div);
  }

  function makeDraggable(el) {
    const header = el.querySelector('.sticky-header') || el.querySelector('.text-box-header') || el;

    header.onmousedown = (e) => {
      if (e.target.closest('button')) return;

      e.preventDefault();
      el.style.zIndex = 1000; // Bring to front while dragging

      const startX = e.clientX - el.offsetLeft;
      const startY = e.clientY - el.offsetTop;

      const onMouseMove = (ev) => {
        el.style.left = (ev.clientX - startX) + 'px';
        el.style.top = (ev.clientY - startY) + 'px';
      };

      const onMouseUp = () => {
        el.style.zIndex = 100;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
  }

  function updateActiveUsersUI(activeUsers = []) {
    const container = document.getElementById('nav-participants');
    if (!container) return;

    const board = window.currentBoardData;
    if (!board) return;

    // Filter and map online users to include their color tags
    const onlineUsers = activeUsers.filter(u => u);

    container.innerHTML = `
      <div class="active-users">
        ${onlineUsers.map((u, index) => {
      const uId = (u._id || u).toString();
      const boardOwnerId = (board.owner?._id || board.owner)?.toString();
      const isOwner = uId === boardOwnerId;
      const userColor = u.colorTag || '#8C52FF';
      const borderStyle = `border-color: ${userColor};`;
      const zIndex = onlineUsers.length - index;

      return `
            <img src="${u.profile_image || 'assets/images/user-avatar.png'}" 
                 class="user-avatar-stack ${isOwner ? 'owner' : ''}" 
                 title="${u.name || 'User'} ${isOwner ? '(Owner)' : ''}"
                 style="${borderStyle} z-index: ${zIndex};">
          `;
    }).join('')}
      </div>
    `;
  }

  function setupRealtimeListeners() {
    window.replicateDraw = (data) => window.dispatchEvent(new CustomEvent('remote-draw', { detail: data }));
    window.undoFromRemote = () => window.dispatchEvent(new CustomEvent('remote-undo'));
    window.redoFromRemote = () => window.dispatchEvent(new CustomEvent('remote-redo'));
    window.renderStickyFromRemote = (sticky) => window.dispatchEvent(new CustomEvent('remote-sticky', { detail: sticky }));

    window.addEventListener('remote-draw', (e) => {
      const d = e.detail;
      if (!d || !ctx) return;
      ctx.save();
      if (d.type === 'path') {
        ctx.beginPath();
        ctx.moveTo(d.x0, d.y0);
        ctx.lineTo(d.x1, d.y1);
        ctx.lineWidth = d.width || 4;
        ctx.strokeStyle = d.color || '#000';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (d.tool === 'highlighter') ctx.globalAlpha = 0.3;
        if (d.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
        ctx.stroke();
      } else if (d.type === 'shape') {
        drawShapeFromTo(d.start, d.end, d.shapeType, d.color, d.width);
      }
      ctx.restore();
    });

    window.addEventListener('remote-undo', () => undo());
    window.addEventListener('remote-redo', () => redo());
    window.addEventListener('remote-sticky', (e) => createStickyElement(e.detail.x, e.detail.y, e.detail.text, e.detail._id));
  }

  // Expose
  window.saveBoard = saveBoard;
  window.updateActiveUsersUI = updateActiveUsersUI;
  window.smartboard = { createStickyElement, createTextBoxElement };
})();

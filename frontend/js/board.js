// board.js
(() => {
  // Parse board ID from URL query string
  // Join via Token Logic
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token') || urlParams.get('join');
  const boardId = urlParams.get('id');

  // If token is present and no boardId, try to join
  if (token && !boardId) {
    (async () => {
      try {
        const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000' ? 'http://localhost:5000/api/board' : '/api/board';
        const t = localStorage.getItem('token');
        if (!t) {
          // If no user token, redirect to login? Or assume public access might allow simplified view? 
          // For now, assume auth required.
          window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.href);
          return;
        }

        const res = await fetch(`${API}/join`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + t
          },
          body: JSON.stringify({ token })
        });
        const data = await res.json();
        if (data.success) {
          // Redirect to board with ID
          window.location.href = `board.html?id=${data.data.boardId}`;
        } else {
          alert('Invalid or expired invite link.');
          window.location.href = 'dashboard.html';
        }
      } catch (e) {
        console.error(e);
        alert('Error joining board.');
      }
    })();
  }

  if (!boardId && !token) {
    console.error('No board ID in URL! Add ?id=BOARD_ID');
  } else if (boardId) {
    window.BOARD_ID = boardId;
    window.currentBoardId = boardId;
  }

  // Load current user from localStorage
  const userStr = localStorage.getItem('user');
  if (!userStr) {
    console.warn('No user info found in localStorage');
    window.CURRENT_USER = null;
  } else {
    try {
      window.CURRENT_USER = JSON.parse(userStr);
    } catch {
      window.CURRENT_USER = null;
      console.warn('Failed to parse user info from localStorage');
    }
  }
})();


(function () {
  'use strict';

  // Determine API_BASE dynamically
  const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000' ? 'http://localhost:5000/api/board' : '/api/board';

  // Fetch and display board info
  async function loadBoardInfo() {
    const boardId = window.currentBoardId;
    const token = localStorage.getItem('token');

    if (!token || token === "null" || token === "undefined") {
      console.error("NO VALID TOKEN — cannot load board");
      return;
    }

    if (!boardId) return;

    try {
      // Fix: Removed double nesting of /api/board
      const res = await fetch(`${API_BASE}/${boardId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Failed to load board');

      const boardNameEl = document.getElementById('boardName');
      if (boardNameEl) boardNameEl.textContent = data.data.name || 'untitled';

      // Save global data for share/invite usage
      window.currentBoardData = data.data;
      window.currentStrokes = [...(data.data.strokes || [])];
      window.currentShapes = [...(data.data.shapes || [])];

      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      const ownerId = data.data.owner?._id || data.data.owner;

      if (currentUser._id === ownerId) {
        console.log('You are the board owner');
        const titleEl = document.getElementById('boardTitle');
        if (titleEl) titleEl.style.color = 'var(--accent)';
      }

      // Display active users
      updateActiveUsersUI(data.data.activeUsers);

      // Initialize real-time listeners after board loads
      setupRealtimeListeners();

      // RENDER SAVED STATE
      renderBoardState(data.data);

    } catch (err) {
      console.error('Error fetching board info:', err);
    }
  }

  // --- Rendering Logic ---
  function renderBoardState(board) {
    if (!board) return;

    // 1. Render Strokes (on canvas)
    if (board.strokes && board.strokes.length) {
      board.strokes.forEach(s => {
        if (!s.points || s.points.length < 2) return;
        const ctx = document.getElementById('boardCanvas').getContext('2d');
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = s.color || '#000';
        ctx.lineWidth = s.width || 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (s.tool === 'highlighter') ctx.globalAlpha = 0.5;
        if (s.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';

        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) {
          ctx.lineTo(s.points[i].x, s.points[i].y);
        }
        ctx.stroke();
        ctx.restore();
      });
    }

    // 2. Render Shapes (on canvas)
    if (board.shapes && board.shapes.length) {
      board.shapes.forEach(s => {
        // We'll reuse the drawShapeFromTo logic if possible, or just re-implement
        const canvas = document.getElementById('boardCanvas');
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.strokeStyle = s.color || '#000';
        ctx.lineWidth = s.width || 4;
        if (s.type === 'rectangle') {
          ctx.strokeRect(s.start.x, s.start.y, s.end.x - s.start.x, s.end.y - s.start.y);
        } else {
          const cx = (s.start.x + s.end.x) / 2;
          const cy = (s.start.y + s.end.y) / 2;
          const r = Math.max(Math.abs(s.end.x - s.start.x), Math.abs(s.end.y - s.start.y)) / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      });
    }

    // 3. Render Stickies (DOM)
    if (board.stickies && board.stickies.length) {
      board.stickies.forEach(s => {
        window.smartboard.createStickyElement(s.x, s.y, s.text, s._id);
      });
    }

    // 4. Render Text Boxes (DOM)
    if (board.textBoxes && board.textBoxes.length) {
      board.textBoxes.forEach(t => {
        window.smartboard.createTextBoxElement(t.x, t.y, t.text, t._id);
      });
    }
  }

  function updateActiveUsersUI(users) {
    const container = document.getElementById('activeUsers');
    if (!container) return;
    container.innerHTML = '';

    // De-duplicate and filter nulls
    const uniqueUsers = Array.from(new Map(users.filter(u => u).map(u => [u._id, u])).values());

    uniqueUsers.forEach(u => {
      const img = document.createElement('img');
      img.src = u.profile_image || u.avatarUrl || 'assets/images/user-avatar.png';
      img.className = 'user-avatar-stack';
      img.title = u.name || 'User';
      container.appendChild(img);
    });
  }

  // --- Real-time Handlers ---
  function setupRealtimeListeners() {
    // Drawing from remote
    window.replicateDraw = (data) => {
      // Basic implementation: if we receive a stroke, draw it
      // Note: This needs access to 'ctx', 'canvas', etc. which are inside DOMContentLoaded scope.
      // Ideally, we move this logic inside the main closure or expose a drawing API.
      // For now, we will dispatch an event that the main closure listens to.
      const event = new CustomEvent('remote-draw', { detail: data });
      window.dispatchEvent(event);
    };

    window.undoFromRemote = () => {
      const event = new CustomEvent('remote-undo');
      window.dispatchEvent(event);
    };

    window.redoFromRemote = () => {
      const event = new CustomEvent('remote-redo');
      window.dispatchEvent(event);
    };

    window.renderStickyFromRemote = (sticky) => {
      const event = new CustomEvent('remote-sticky', { detail: sticky });
      window.dispatchEvent(event);
    }
  }

  function safeLog(...args) {
    if (window.console && console.log) console.log('[smartboard]', ...args);
  }

  // Replace alert with showToast for better UX
  function notify(msg, type = 'info') {
    if (typeof showToast === 'function') {
      showToast(msg, type);
    } else {
      alert(msg);
    }
  }

  document.getElementById('btnBack').addEventListener('click', () => {
    // Go back to the previous page in history
    window.history.back();
  });

  // Run after DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    // Set currentBoardId from URL param 'id' BEFORE loading board info
    const urlParams = new URLSearchParams(window.location.search);
    window.currentBoardId = urlParams.get('id');

    // Define canvas and ctx in the outer scope of the listener to ensure availability to all closures (including saveBoard)
    let canvas, ctx;

    // Now load board info after currentBoardId is set
    loadBoardInfo();

    // Show current user info in top nav
    const currentUser = window.CURRENT_USER || JSON.parse(localStorage.getItem('user') || 'null');

    if (currentUser) {
      const badgeContainer = document.getElementById('currentUserBadge');
      if (badgeContainer) {
        const avatarUrl = currentUser.profile_image || currentUser.avatarUrl || './assets/images/user-avatar.png';
        badgeContainer.className = 'current-user-badge';
        badgeContainer.innerHTML = `
          <img src="${avatarUrl}" alt="Me">
          <span>${currentUser.name || 'You'}</span>
        `;
      }
    }

    try {
      // --- Elements (guarded) ---
      const get = (id) => {
        const el = document.getElementById(id);
        if (!el) safeLog(`warning: #${id} not found in DOM`);
        return el;
      };

      canvas = get('boardCanvas');
      const wrapper = get('canvasWrapper');
      const container = get('boardContainer');

      // required controls
      const colorPicker = get('colorPicker');
      const strokeRange = get('strokeRange');
      const undoBtn = get('undoBtn');
      const redoBtn = get('redoBtn');
      const commentsPanel = get('commentsPanel');
      const commentToggle = get('commentToggle');
      const closeComments = get('closeComments');
      const sendComment = get('sendComment');
      const commentsList = get('commentsList');
      const commentInput = get('commentInput');
      const stickyBtn = get('stickyBtn');

      if (!canvas || !wrapper || !container) {
        safeLog('fatal: Required core elements missing (canvas/wrapper/container). Aborting script.');
        notify('Fatal error: Required elements missing. See console.', 'error');
        return;
      }

      if (colorPicker) {
        const initialColor = colorPicker.value || '#000000';
        const display = document.querySelector('.color-display');
        if (display) display.style.backgroundColor = initialColor;
      }

      // --- Remote Listeners ---
      window.addEventListener('remote-draw', (e) => {
        const d = e.detail;
        if (!d) return;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (d.type === 'path') {
          ctx.beginPath();
          ctx.moveTo(d.x0, d.y0);
          ctx.lineTo(d.x1, d.y1);
          ctx.lineWidth = d.width || 4;
          ctx.strokeStyle = d.color || '#000';
          if (d.tool === 'highlighter') ctx.globalAlpha = 0.32;
          if (d.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';

          ctx.stroke();
          // Important: update context for next draws? No, we reset with save/restore for each remote event typically, 
          // BUT high frequency path updates might be better served without full save/restore overhead. 
          // For now, safety over speed.
        } else if (d.type === 'shape') {
          drawShapeFromTo(d.start, d.end, d.shapeType, d.color, d.width);
        }

        ctx.restore();
      });

      window.addEventListener('remote-undo', () => {
        // simplified remote undo: just pop stack if possible. 
        // Warn: local undo stack might not match remote if we push snapshots for every local move but not remote?
        // This is Complex. Real-time strict undo/redo sync usually requires a command pattern, not bitmap snapshots.
        // We will attempt best-effort via existing bitmap snapshot logic.
        // Actually, 'undo()' just swaps bitmap buffers. If remote undoes, we should probably just trigger undo() locallly.
        if (undoStack.length > 0) undo();
      });

      window.addEventListener('remote-redo', () => {
        if (redoStack.length > 0) redo();
      });

      window.addEventListener('remote-sticky', (e) => {
        const s = e.detail;
        // create sticky programmatically
        createStickyElement(s.x, s.y, s.text, s._id);
      });

      ctx = canvas.getContext('2d', { willReadFrequently: false });
      const devicePixelRatio = Math.max(1, (window.devicePixelRatio || 1));

      // --- State ---
      let scale = 1;
      let translate = { x: 0, y: 0 };
      let virtualSize = { w: Math.max(1600, window.innerWidth * 2), h: Math.max(1200, (window.innerHeight - 56) * 2) };

      let tool = 'pen';
      let drawing = false;
      let last = null;
      let panning = false;
      let panStart = null;

      const undoStack = [];
      const redoStack = [];
      const MAX_STACK = 40;

      // --- Utilities ---
      function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
      function debounce(fn, t) { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), t); }; }
      function nowStr() { return (new Date()).toLocaleTimeString(); }

      // --- Canvas sizing & redraw ---
      function setCanvasSize() {
        try {
          const w = Math.max(800, virtualSize.w);
          const h = Math.max(600, virtualSize.h);

          canvas.style.width = w + 'px';
          canvas.style.height = h + 'px';
          canvas.width = Math.round(w * devicePixelRatio);
          canvas.height = Math.round(h * devicePixelRatio);

          canvas.style.backgroundSize = `${Math.round(28 * scale)}px ${Math.round(28 * scale)}px`;

          ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
          safeLog('canvas resized to', w, 'x', h, ' DPR=', devicePixelRatio);
        } catch (err) {
          console.error('setCanvasSize error', err);
          notify('Error resizing canvas. See console.', 'error');
        }
      }

      // redraw stub (we keep raster snapshots; no vector model here)
      function redrawAll() {
        // Placeholder for vector model later
      }

      setCanvasSize();
      window.addEventListener('resize', debounce(() => {
        virtualSize.w = Math.max(virtualSize.w, Math.round(window.innerWidth * 2));
        virtualSize.h = Math.max(virtualSize.h, Math.round((window.innerHeight - 56) * 2));
        setCanvasSize();
      }, 200));

      // --- Snapshots (undo/redo) ---
      function pushSnapshot() {
        try {
          const data = canvas.toDataURL();
          if (undoStack.length >= MAX_STACK) undoStack.shift();
          undoStack.push(data);
          redoStack.length = 0;
          updateUndoRedoUI();
        } catch (err) {
          console.error('pushSnapshot error', err);
          notify('Failed to save undo snapshot.', 'error');
        }
      }
      function updateUndoRedoUI() {
        if (undoBtn) undoBtn.disabled = undoStack.length === 0;
        if (redoBtn) redoBtn.disabled = redoStack.length === 0;
      }
      function loadSnapshot(dataUrl) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width / devicePixelRatio, canvas.height / devicePixelRatio);
          ctx.drawImage(img, 0, 0, canvas.width / devicePixelRatio, canvas.height / devicePixelRatio);
        };
        img.onerror = (e) => safeLog('snapshot image load error', e);
        img.src = dataUrl;
      }
      function undo() {
        if (!undoStack.length) return;
        try {
          redoStack.push(canvas.toDataURL());
          const data = undoStack.pop();
          if (data) loadSnapshot(data);
          updateUndoRedoUI();
          if (window.BoardSocket) window.BoardSocket.emitUndo();
        } catch (err) {
          console.error('undo error', err);
          notify('Undo failed. See console.', 'error');
        }
      }
      function redo() {
        if (!redoStack.length) return;
        try {
          undoStack.push(canvas.toDataURL());
          const data = redoStack.pop();
          if (data) loadSnapshot(data);
          updateUndoRedoUI();
          if (window.BoardSocket) window.BoardSocket.emitRedo();
        } catch (err) {
          console.error('redo error', err);
          notify('Redo failed. See console.', 'error');
        }
      }
      const bindUndoRedo = () => {
        const u = document.querySelectorAll('#undoBtn');
        const r = document.querySelectorAll('#redoBtn');
        u.forEach(btn => btn.onclick = undo);
        r.forEach(btn => btn.onclick = redo);
      };
      bindUndoRedo();

      try { pushSnapshot(); } catch (e) { safeLog('initial snapshot push failed', e); }

      // --- Transform helpers ---
      function applyTransform() {
        wrapper.style.transform = `translate(${translate.x}px, ${translate.y}px) scale(${scale})`;
      }

      function toCanvasCoords(clientX, clientY) {
        const rect = wrapper.getBoundingClientRect();
        const xInWrapper = (clientX - rect.left);
        const yInWrapper = (clientY - rect.top);
        const x = (xInWrapper - translate.x) / scale;
        const y = (yInWrapper - translate.y) / scale;
        return { x, y };
      }

      function expandCanvasIfNeeded(cx, cy) {
        const margin = 300;
        const canvasPixelW = canvas.width / devicePixelRatio;
        const canvasPixelH = canvas.height / devicePixelRatio;
        let grew = false;
        if (cx > canvasPixelW - margin) { virtualSize.w = Math.round(virtualSize.w * 1.5); grew = true; }
        if (cy > canvasPixelH - margin) { virtualSize.h = Math.round(virtualSize.h * 1.5); grew = true; }
        if (cx < margin) { /* optional negative space */ }
        if (cy < margin) { /* optional negative space */ }
        if (grew) {
          safeLog('expanding virtual canvas to', virtualSize);
          const snapshot = canvas.toDataURL();
          setCanvasSize();
          loadSnapshot(snapshot);
        }
      }

      // --- Pointer & drawing logic ---
      canvas.style.touchAction = 'none';
      canvas.addEventListener('pointerdown', pointerDownHandler);
      window.addEventListener('pointermove', pointerMoveHandler);
      window.addEventListener('pointerup', pointerUpHandler);

      function pointerDownHandler(e) {
        try {
          if (e.button === 2) {
            e.preventDefault();
            return;
          }
          if (e.button === 1) {
            startPan(e);
            return;
          }
          const p = toCanvasCoords(e.clientX, e.clientY);

          if (e.isPrimary && (e.button === 0 || e.pointerType === 'touch')) {
            if (tool === 'sticky') { createStickyAt(e.clientX, e.clientY); return; }
            if (tool === 'text') { createTextBoxAt(e.clientX, e.clientY); return; }

            drawing = true;
            last = p;
            pushSnapshot();

            // Emit start (optional, or just emit constant stream)
            // For simple strokes, we can optimize by only emitting the whole stroke at the end
            // OR emit chunks. Let's emit chunks for live-view.

            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            const stroke = parseInt((strokeRange && strokeRange.value) || 4, 10);
            ctx.lineWidth = stroke;
            ctx.strokeStyle = (colorPicker && colorPicker.value) || '#000';
            ctx.globalAlpha = (tool === 'highlighter') ? 0.5 : 1;
            ctx.globalCompositeOperation = (tool === 'eraser') ? 'destination-out' : 'source-over';
          }
        } catch (err) {
          console.error('pointerDownHandler error', err);
          notify('Drawing error occurred. See console.', 'error');
        }
      }

      function pointerMoveHandler(e) {
        try {
          if (panning) return continuePan(e);
          if (!drawing) return;
          const p = toCanvasCoords(e.clientX, e.clientY);
          expandCanvasIfNeeded(p.x, p.y);

          if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
            ctx.lineTo(p.x, p.y);
            ctx.stroke();

            // Emit live draw data
            if (window.BoardSocket) {
              window.BoardSocket.emitDraw({
                type: 'path',
                x0: last.x, y0: last.y,
                x1: p.x, y1: p.y,
                color: (tool === 'eraser') ? '#ffffff' : (colorPicker ? colorPicker.value : '#000'),
                width: parseInt((strokeRange && strokeRange.value) || 4, 10),
                tool: tool
              });
            }

            // Emit cursor for real-time presence
            if (window.BoardSocket && !window.cursorThrottle) {
              window.cursorThrottle = true;
              window.BoardSocket.emitCursor(e.clientX, e.clientY);
              setTimeout(() => { window.cursorThrottle = false; }, 50); // 20fps emission
            }

            // Track points for saving
            if (!window.currentPath) window.currentPath = [];
            window.currentPath.push(p);

            last = p;
            // Actually, the original code had `last = p` implicitly effectively handled via ctx state? 
            // No, standard canvas drawing requires updating `last` point. 
            // Wait, `last` is global. Let's look at pointerMove again.
            // Original: `last` was only set in pointerDown. 
            // Canvas `lineTo` uses current path cursor. 
            // BUT for emitting isolated line segments (x0,y0 -> x1,y1), we need to update `last` after every stroke segment.
          } else if (tool === 'rectangle' || tool === 'circle') {
            const lastSnap = undoStack.length ? undoStack[undoStack.length - 1] : null;
            if (!lastSnap) return;
            const img = new Image();
            img.onload = () => {
              ctx.clearRect(0, 0, canvas.width / devicePixelRatio, canvas.height / devicePixelRatio);
              ctx.drawImage(img, 0, 0, canvas.width / devicePixelRatio, canvas.height / devicePixelRatio);
              drawShapeFromTo(last, p, tool);
            };
            img.src = lastSnap;
          }
        } catch (err) {
          console.error('pointerMoveHandler error', err);
          notify('Drawing move error. See console.', 'error');
        }
      }

      function pointerUpHandler(e) {
        try {
          if (panning) { endPan(); return; }
          if (!drawing) return;
          drawing = false;
          ctx.restore();
          const p = toCanvasCoords(e.clientX, e.clientY);
          if (tool === 'rectangle' || tool === 'circle') {
            drawShapeFromTo(last, p, tool);

            // Record shape in local strokes list for serialization (simplification)
            // Ideally shapes and strokes are separate, but for the 'Save' button, 
            // we'll collect them from the canvas or maintain local arrays.
            if (!window.currentShapes) window.currentShapes = [];
            window.currentShapes.push({
              type: tool,
              start: last,
              end: p,
              color: colorPicker ? colorPicker.value : '#000',
              width: parseInt((strokeRange && strokeRange.value) || 4, 10)
            });

            // Emit shape
            if (window.BoardSocket) {
              window.BoardSocket.emitDraw({
                type: 'shape',
                shapeType: tool,
                start: last,
                end: p,
                color: colorPicker ? colorPicker.value : '#000',
                width: parseInt((strokeRange && strokeRange.value) || 4, 10)
              });
            }
            // PERSIST SHAPE
            if (!window.currentShapes) window.currentShapes = [];
            window.currentShapes.push({
              type: tool,
              start: last,
              end: p,
              color: colorPicker ? colorPicker.value : '#000',
              width: parseInt((strokeRange && strokeRange.value) || 4, 10)
            });
          } else if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
            // Record current stroke
            if (window.currentPath && window.currentPath.length > 1) {
              if (!window.currentStrokes) window.currentStrokes = [];
              window.currentStrokes.push({
                tool,
                color: (tool === 'eraser') ? '#ffffff' : (colorPicker ? colorPicker.value : '#000'),
                width: parseInt((strokeRange && strokeRange.value) || 4, 10),
                points: window.currentPath
              });
            }
          }
          last = null;
          window.currentPath = [];
        } catch (err) {
          console.error('pointerUpHandler error', err);
          notify('Drawing end error. See console.', 'error');
        }
      }



      // Overload drawShape for remote usage
      function drawShapeFromTo(a, b, shape, colorOverride, widthOverride) {
        try {
          ctx.save();
          ctx.strokeStyle = colorOverride || (colorPicker && colorPicker.value) || '#000';
          ctx.lineWidth = widthOverride || parseInt((strokeRange && strokeRange.value) || 4, 10);
          if (shape === 'rectangle') {
            ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
          } else {
            const cx = (a.x + b.x) / 2;
            const cy = (a.y + b.y) / 2;
            const r = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        } catch (err) {
          console.error('drawShapeFromTo error', err);
          notify('Error drawing shape. See console.', 'error');
        }
      }

      // --- Pan ---
      function startPan(e) {
        panning = true;
        panStart = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y };
        document.body.style.cursor = 'grabbing';
      }
      function continuePan(e) {
        if (!panStart) return;
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        translate.x = panStart.tx + dx;
        translate.y = panStart.ty + dy;
        applyTransform();
      }
      function endPan() {
        panning = false;
        panStart = null;
        document.body.style.cursor = '';
      }

      // wheel zoom
      container.addEventListener('wheel', (e) => {
        try {
          if (e.ctrlKey || e.metaKey) return;
          e.preventDefault();
          const delta = -e.deltaY;
          const zoomFactor = delta > 0 ? 1.08 : 0.92;
          const rect = wrapper.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const worldX = (mx - translate.x) / scale;
          const worldY = (my - translate.y) / scale;
          scale = clamp(scale * zoomFactor, 0.2, 4);
          translate.x = mx - worldX * scale;
          translate.y = my - worldY * scale;
          canvas.style.backgroundSize = `${Math.max(10, Math.round(28 * scale))}px ${Math.max(10, Math.round(28 * scale))}px`;
          applyTransform();
        } catch (err) {
          console.error('wheel handler error', err);
          notify('Zoom error. See console.', 'error');
        }
      }, { passive: false });

      // Keyboard shortcuts for stroke size
      window.addEventListener('keydown', (e) => {
        try {
          if (e.key === '[') {
            if (strokeRange) strokeRange.value = Math.max(1, strokeRange.value - 1);
          } else if (e.key === ']') {
            if (strokeRange) strokeRange.value = Math.min(60, parseInt(strokeRange.value, 10) + 1);
          } else if (e.key === ' ' && !drawing) {
            document.body.style.cursor = 'grab';
          }
        } catch (err) {
          console.error('keydown handler error', err);
        }
      });
      window.addEventListener('keyup', (e) => { if (e.key === ' ') document.body.style.cursor = ''; });

      // --- Tools UI safe hookup ---
      const toolButtons = document.querySelectorAll('.toolbox .tool');
      if (toolButtons && toolButtons.length) {
        toolButtons.forEach(btn => {
          btn.addEventListener('click', () => {
            toolButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tool = btn.dataset.tool || btn.id || 'pen';

            // Set canvas state based on tool
            if (tool === 'eraser') {
              ctx.globalCompositeOperation = 'destination-out';
            } else {
              ctx.globalCompositeOperation = 'source-over';
              // Ensure color is reapplied when switching away from eraser
              if (colorPicker) ctx.strokeStyle = colorPicker.value;
            }

            if (tool === 'highlighter') canvas.classList.add('highlighter');
            else canvas.classList.remove('highlighter');

            safeLog('tool set to', tool);
          });
        });
      } else {
        safeLog('no .tool buttons found; tools UI inactive');
      }

      // --- Sticky notes & Text tool (safe) ---

      // Split creation from DOM logic for remote reuse
      function createStickyElement(x, y, textContent = '', id = null) {
        const sticky = document.createElement('div');
        sticky.className = 'sticky';
        sticky.style.left = x + 'px';
        sticky.style.top = y + 'px';
        if (id) sticky.dataset.id = id;

        sticky.innerHTML = `<div class="sticky-header"><strong>Note</strong>
              <button class="close-sticky" title="Delete" style="background:none;border:none;cursor:pointer">✕</button>
            </div><textarea placeholder="Write...">${textContent}</textarea>`;
        wrapper.appendChild(sticky);

        const close = sticky.querySelector('.close-sticky');
        const area = sticky.querySelector('textarea');

        close && close.addEventListener('click', () => {
          sticky.remove();
          // TODO: emit delete
        });

        // If created locally (no ID yet), add emit logic
        if (!id) {
          area.addEventListener('change', () => {
            if (window.BoardSocket) {
              window.BoardSocket.emitSticky({
                x, y, text: area.value, color: '#fff59d'
              });
            }
          });
        }

        let dragging = false, start = null;
        sticky.addEventListener('pointerdown', (ev) => {
          if (ev.target.tagName === 'TEXTAREA' || ev.target === close) return;
          dragging = true;
          start = { x: ev.clientX, y: ev.clientY, sx: parseFloat(sticky.style.left) || 0, sy: parseFloat(sticky.style.top) || 0 };
          sticky.setPointerCapture(ev.pointerId);
        });
        sticky.addEventListener('pointermove', (ev) => {
          if (!dragging) return;
          sticky.style.left = (start.sx + (ev.clientX - start.x) / scale) + 'px';
          sticky.style.top = (start.sy + (ev.clientY - start.y) / scale) + 'px';
        });
        sticky.addEventListener('pointerup', (ev) => { dragging = false; try { sticky.releasePointerCapture(ev.pointerId); } catch (e) { } });
      }

      function createStickyAt(clientX, clientY) {
        try {
          const rect = wrapper.getBoundingClientRect();
          const x = (clientX - rect.left - translate.x) / scale;
          const y = (clientY - rect.top - translate.y) / scale;
          createStickyElement(x, y);
        } catch (err) {
          console.error('createStickyAt error', err);
          notify('Error creating sticky note. See console.', 'error');
        }
      }

      function createTextBoxElement(x, y, textContent = '', id = null) {
        const box = document.createElement('div');
        box.className = 'text-box';
        // Constraints: Ensure it's inside canvas
        const canvasW = canvas.width / devicePixelRatio;
        const canvasH = canvas.height / devicePixelRatio;
        x = Math.max(0, Math.min(x, canvasW - 150));
        y = Math.max(0, Math.min(y, canvasH - 50));

        box.style.left = x + 'px';
        box.style.top = y + 'px';
        if (id) box.dataset.id = id;

        box.innerHTML = `
          <div class="text-box-header">
            <button class="close-text" title="Remove" style="z-index:10; pointer-events:auto;">✕</button>
          </div>
          <textarea placeholder="Type...">${textContent}</textarea>
        `;
        wrapper.appendChild(box);

        const closeBtn = box.querySelector('.close-text');
        const area = box.querySelector('textarea');

        if (textContent === '') area.focus();

        closeBtn.onpointerdown = (ev) => {
          ev.stopPropagation();
          box.remove();
        };

        // Draggable
        let dragging = false, start = null;
        const header = box.querySelector('.text-box-header');
        header.addEventListener('pointerdown', (ev) => {
          dragging = true;
          start = {
            x: ev.clientX,
            y: ev.clientY,
            sx: parseFloat(box.style.left) || 0,
            sy: parseFloat(box.style.top) || 0
          };
          header.setPointerCapture(ev.pointerId);
          ev.stopPropagation();
        });

        header.addEventListener('pointermove', (ev) => {
          if (!dragging) return;
          let nx = start.sx + (ev.clientX - start.x) / scale;
          let ny = start.sy + (ev.clientY - start.y) / scale;

          // Boundaries
          nx = Math.max(0, Math.min(nx, canvasW - box.offsetWidth));
          ny = Math.max(0, Math.min(ny, canvasH - box.offsetHeight));

          box.style.left = nx + 'px';
          box.style.top = ny + 'px';
        });

        header.addEventListener('pointerup', (ev) => {
          dragging = false;
          try { header.releasePointerCapture(ev.pointerId); } catch (e) { }
        });
      }

      function createTextBoxAt(clientX, clientY) {
        try {
          const rect = wrapper.getBoundingClientRect();
          const x = (clientX - rect.left - translate.x) / scale;
          const y = (clientY - rect.top - translate.y) / scale;
          createTextBoxElement(x, y);
        } catch (err) {
          console.error('createTextBoxAt error', err);
          notify('Error creating text box. See console.', 'error');
        }
      }

      // Color Picker Logic
      if (colorPicker) {
        colorPicker.addEventListener('input', (e) => {
          const color = e.target.value;
          ctx.strokeStyle = color;
          const display = document.querySelector('.color-display');
          if (display) display.style.backgroundColor = color;
          safeLog('color set to', color);
        });
      }

      // expose safe API
      window.smartboard = {
        pushSnapshot,
        undo,
        redo,
        createStickyAt,
        createStickyElement,
        createTextBoxAt,
        createTextBoxElement,
        setTool: (t) => {
          tool = t;
          document.querySelectorAll('.toolbox .tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
          if (t === 'eraser') ctx.globalCompositeOperation = 'destination-out';
          else ctx.globalCompositeOperation = 'source-over';
        }
      };

      // --- Comments UI (guarded) ---
      if (commentToggle && commentsPanel) {
        commentToggle.addEventListener('click', () => commentsPanel.classList.toggle('hidden'));
      } else safeLog('comment controls not found');

      if (closeComments) closeComments.addEventListener('click', () => commentsPanel && commentsPanel.classList.add('hidden'));
      if (sendComment && commentsList && commentInput) {
        sendComment.addEventListener('click', () => {
          const t = commentInput.value && commentInput.value.trim();
          if (!t) return;
          const comment = document.createElement('div');
          comment.className = 'comment';
          const userName = (window.CURRENT_USER && window.CURRENT_USER.name) || 'You';
          comment.innerHTML = `<div class="meta"><span class="author">${userName}</span><span>${nowStr()}</span></div><div>${escapeHtml(t)}</div>`;
          commentsList.prepend(comment);
          commentInput.value = '';
        });
      }

      function escapeHtml(s) {
        return s.replace(/[&<>"'`]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' })[m]);
      }

      canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      safeLog('board.js initialized successfully');
      applyTransform();

      // --- Save Feature ---
      async function saveBoard() {
        try {
          if (!window.currentBoardId) {
            notify('No board ID found. Cannot save.', 'error');
            return;
          }

          notify('Saving...', 'info');
          const dataURL = canvas.toDataURL('image/png');
          const boardId = window.currentBoardId;
          const token = localStorage.getItem('token');

          // Collect State
          const stickies = Array.from(document.querySelectorAll('.sticky')).map(el => ({
            text: el.querySelector('textarea').value,
            x: parseFloat(el.style.left),
            y: parseFloat(el.style.top),
            color: '#fff59d' // default for now
          }));

          const textBoxes = Array.from(document.querySelectorAll('.text-box')).map(el => ({
            text: el.querySelector('textarea').value,
            x: parseFloat(el.style.left),
            y: parseFloat(el.style.top),
            width: el.offsetWidth,
            height: el.offsetHeight
          }));

          // Shapes and Strokes were collected during drawing actions
          const payload = {
            stickies,
            textBoxes,
            strokes: window.currentStrokes || window.currentBoardData.strokes || [],
            shapes: window.currentShapes || window.currentBoardData.shapes || [],
            lastSavedImage: dataURL
          };

          const res = await fetch(`${API_BASE}/${boardId}/save-state`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + token,
            },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            const errorText = await res.text();
            console.error('Save failed:', errorText);
            notify('Failed to save (Server Error). Check console.', 'error');
            return;
          }

          const result = await res.json();
          if (result.success) {
            notify('Board saved successfully!', 'success');
          } else {
            notify('Failed to save: ' + (result.message || 'Unknown error'), 'error');
          }
        } catch (err) {
          console.error('Error saving board:', err);
          notify('Error saving board.', 'error');
        }
      }

      // Bind Listeners
      const btnSave = document.getElementById('saveBtn');
      if (btnSave) btnSave.addEventListener('click', saveBoard);

      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          saveBoard();
        }
      });


      // Share button handler
      const shareBtn = document.getElementById('shareBtn');
      if (shareBtn) {
        shareBtn.addEventListener('click', () => {
          const modal = document.getElementById('shareModal');
          if (modal) {
            modal.classList.add('open');
            // Pre-fill if exists
            if (window.currentBoardData?.shareLink?.isActive) {
              const link = `${window.location.origin}${window.location.pathname}?token=${window.currentBoardData.shareLink.token}`;
              document.getElementById('shareLinkInput').value = link;
              // set radio
              const role = window.currentBoardData.shareLink.role;
              const radio = document.querySelector(`input[name="shareRole"][value="${role}"]`);
              if (radio) radio.checked = true;
            }
          }
        });
      }


      // --- Invite & Share Modal Logic ---
      const inviteModal = document.getElementById('inviteModal');
      const shareModal = document.getElementById('shareModal');
      const inviteBtn = document.getElementById('inviteBtn');

      if (inviteBtn && inviteModal) {
        inviteBtn.addEventListener('click', () => {
          inviteModal.classList.add('open');
          document.getElementById('userSearchInput').focus();
        });
      }

      // Close buttons
      ['closeInviteBtn', 'closeShareBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
          btn.addEventListener('click', () => {
            if (inviteModal) inviteModal.classList.remove('open');
            if (shareModal) shareModal.classList.remove('open');
          });
        }
      });

      // Invite Search
      const searchInput = document.getElementById('userSearchInput');
      const userList = document.getElementById('userList');
      let selectedUser = null;

      if (searchInput && userList) {
        searchInput.addEventListener('input', debounce(async (e) => {
          const q = e.target.value.trim();
          if (!q) { userList.innerHTML = ''; return; }

          try {
            const isDev = window.location.port === '5500';
            const API_CHAT = isDev ? 'http://localhost:5000/api/chat' : '/api/chat';
            const token = localStorage.getItem('token');

            const res = await fetch(`${API_CHAT}/users/search?query=${encodeURIComponent(q)}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const users = await res.json();

            userList.innerHTML = '';
            users.forEach(u => {
              const div = document.createElement('div');
              div.className = 'user-item';
              div.innerHTML = `<img src="${u.profile_image || 'assets/images/user-avatar.png'}">
                           <div>
                             <div style="font-weight:600">${u.name}</div>
                             <div style="font-size:12px;color:#666">${u.email}</div>
                           </div>`;
              div.addEventListener('click', () => {
                document.querySelectorAll('.user-item').forEach(x => x.classList.remove('selected'));
                div.classList.add('selected');
                selectedUser = u;
                document.getElementById('sendInviteBtn').disabled = false;
              });
              userList.appendChild(div);
            });
          } catch (err) { console.error('Search error', err); }
        }, 500));
      }

      // Send Invite
      const sendInviteBtn = document.getElementById('sendInviteBtn');
      if (sendInviteBtn) {
        sendInviteBtn.addEventListener('click', async () => {
          if (!selectedUser) return;
          const role = document.getElementById('inviteRole').value; // viewer/editor

          try {
            notify('Sending invite...', 'info');
            sendInviteBtn.disabled = true;

            const res = await fetch(`${API_BASE}/${window.currentBoardId}/invite`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + localStorage.getItem('token')
              },
              body: JSON.stringify({ userIds: [selectedUser._id], role })
            });

            const data = await res.json();

            if (data.success) {
              notify('Invite sent successfully via Email & Notification!', 'success');
              // Optional: Force reload active users?
              // window.location.reload(); 
              document.getElementById('inviteModal').classList.remove('open'); // or .remove('visible') depending on CSS

              // Existing code used .classList.remove('open') but my previous search suggested .visible logic. 
              // Let's stick to what was likely there or standard. 
              // The grep showed inviteModal.classList.remove('visible') in one place, 
              // but the code block I am replacing had inviteModal.classList.remove('open'). 
              // I'll try both or check CSS class usage if needed.
              // Assuming 'open' based on the block I am replacing.
              document.getElementById('inviteModal').classList.remove('visible');
            } else {
              notify(data.message || 'Failed to send invite', 'error');
            }
          } catch (e) {
            console.error(e);
            notify('Error sending invite.', 'error');
          } finally {
            sendInviteBtn.disabled = false;
          }
        });
      }

      // Generate / Copy Share Link
      const checkLinkBtn = document.getElementById('generateLinkBtn');
      if (checkLinkBtn) {
        checkLinkBtn.addEventListener('click', async () => {
          try {
            const role = document.querySelector('input[name="shareRole"]:checked').value;
            const res = await fetch(`${API_BASE}/${window.currentBoardId}/share`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + localStorage.getItem('token')
              },
              body: JSON.stringify({ role, isActive: true })
            });
            const data = await res.json();
            if (data.success) {
              const link = `${window.location.origin}${window.location.pathname}?token=${data.data.token}`;
              document.getElementById('shareLinkInput').value = link;
              notify('Link generated!', 'success');

              // Update local cache
              if (!window.currentBoardData.shareLink) window.currentBoardData.shareLink = {};
              window.currentBoardData.shareLink = data.data;
            }
          } catch (e) {
            notify('Error generating link', 'error');
          }
        });
      }

      // Text Box Close logic already exists in createTextBoxElement, 
      // but let's ensure it's robust by also handling pointerdown to avoid propagation issues
      const robustClose = (box) => {
        const btn = box.querySelector('.close-text');
        if (btn) {
          btn.onpointerdown = (e) => {
            e.stopPropagation();
            box.remove();
          };
        }
      };
      document.querySelectorAll('.text-box').forEach(robustClose);

      // --- Recording Logic (moved inside scope) ---
      let mediaRecorder = null;
      let recordedChunks = [];
      let currentRecordingId = null;
      const recordBtn = document.getElementById('recordBtn');
      let timeLeft = 10 * 60 * 1000;

      if (recordBtn) {
        recordBtn.addEventListener('click', async () => {
          try {
            if (!mediaRecorder || mediaRecorder.state === 'inactive') {
              const stream = canvas.captureStream(30);
              try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioStream.getAudioTracks().forEach(track => stream.addTrack(track));
              } catch (e) {
                console.warn('Microphone access denied or not available');
              }
              mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
              recordedChunks = [];
              mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
              mediaRecorder.onstop = async () => {
                clearInterval(timerInv);
                recordBtn.innerHTML = '<span class="material-icons-outlined">fiber_manual_record</span>';
                recordBtn.style.color = '';
                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                const formData = new FormData();
                formData.append('file', blob, 'recording.webm');
                formData.append('recordingId', currentRecordingId);
                formData.append('duration', Math.round((10 * 60 * 1000 - timeLeft) / 1000));
                const bId = window.currentBoardId || '';
                const t = localStorage.getItem('token');
                await fetch(`${API_BASE}/${bId}/recording/stop`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${t}` },
                  body: formData,
                });
                notify('Recording saved!', 'success');
                stream.getTracks().forEach(track => track.stop());
              };
              const bId = window.currentBoardId || '';
              const t = localStorage.getItem('token');
              const startRes = await fetch(`${API_BASE}/${bId}/recording/start`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${t}` },
              });
              const startResult = await startRes.json();
              if (!startResult.success) return notify('Failed to start recording', 'error');
              currentRecordingId = startResult.data._id;
              mediaRecorder.start();
              timeLeft = 10 * 60 * 1000;
              recordBtn.style.color = '#ff4d4d';
              const timerInv = setInterval(() => {
                timeLeft -= 1000;
                const mins = Math.floor(timeLeft / 60000);
                const secs = Math.floor((timeLeft % 60000) / 1000);
                recordBtn.innerHTML = `<span class="material-icons-outlined">stop</span> ${mins}:${secs.toString().padStart(2, '0')}`;
                if (timeLeft <= 0) mediaRecorder.stop();
              }, 1000);
            } else {
              mediaRecorder.stop();
            }
          } catch (err) {
            console.error('Recording error:', err);
            notify('Recording failed.', 'error');
          }
        });
      }

      const copyBtn = document.getElementById('copyShareLinkBtn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          const input = document.getElementById('shareLinkInput');
          if (input && input.value) {
            navigator.clipboard.writeText(input.value);
            notify('Link copied!', 'success');
          }
        });
      }
    } catch (e) {
      console.error('Board logic error:', e);
    }
  });
})();
/**
 * SkillSprint AI Mentor — Floating Orb & Compact Panel
 * ai-orb.js
 *
 * Responsibilities:
 *   - Inject the glowing floating orb on all logged-in pages
 *   - Detect current page context and set contextual greeting
 *   - Open a compact assistant panel (not a popup)
 *   - Wire into quiz blocking: lock orb/panel when ss_active_quiz = 'true'
 *   - Provide basic stub responses via shared intent classifier
 *
 * Excluded pages: login, signup, onboarding, chat-bot (full workspace)
 * Not draggable (by design for this phase)
 */

(function () {
  'use strict';

  /* ── Guard: don't run on excluded pages ── */
  const PATH = window.location.pathname;
  const EXCLUDED = [
    'login.html', 'signup.html', 'onboarding.html',
    'chat-bot.html', 'admin-login.html', 'verify-otp.html',
    'forget-password.html', 'getstarted.html', 'index.html',
    'admin-dashboard.html'
  ];
  const isExcluded = EXCLUDED.some(p => PATH.includes(p));

  // Also exclude the /ai workspace route (chat-bot serves at /ai)
  if (isExcluded || PATH === '/ai' || PATH.endsWith('/ai')) return;

  // Prevent double injection
  if (document.getElementById('ssAiOrb')) return;

  /* ── Constants ── */
  const AI_URL = '/ai';
  const QUIZ_FLAG = 'ss_active_quiz';

  /* ── Page Context Detection ── */
  const PAGE_CONTEXTS = [
    {
      match: ['pair-programming'],
      icon: 'fa-solid fa-code-branch',
      greeting: "Need help debugging your collaborative code?",
      hint: "I can explain algorithms, logic errors, or JS syntax."
    },
    {
      match: ['board.html'],
      icon: 'fa-solid fa-chalkboard-user',
      greeting: "Designing system architecture or diagrams?",
      hint: "Ask me to model components, explain design patterns, or brainstorm ideas."
    },
    {
      match: ['library'],
      icon: 'fa-solid fa-book-open',
      greeting: "Looking for a quick JavaScript concept summary?",
      hint: "I can break down any JS topic or platform resource for you."
    },
    {
      match: ['task'],
      icon: 'fa-solid fa-list-check',
      greeting: "Planning your tasks or schedule?",
      hint: "I can help structure priorities or explain project management patterns."
    },
    {
      match: ['posting', 'feed'],
      icon: 'fa-solid fa-rss',
      greeting: "Sharing something with the community?",
      hint: "I can help refine your post or answer any JS question."
    },
    {
      match: ['live-session', 'livevideo'],
      icon: 'fa-solid fa-headset',
      greeting: "In a live session? Need a quick answer?",
      hint: "Ask me anything — I'll get you the answer fast."
    },
    {
      match: ['collaborations'],
      icon: 'fa-solid fa-users',
      greeting: "Finding your ideal collaborator?",
      hint: "I can explain matchmaking logic or answer any platform question."
    },
    {
      match: ['quiz'],
      icon: 'fa-solid fa-graduation-cap',
      greeting: "Quiz time! AI Mentor is restricted during assessments.",
      hint: "Complete your quiz to unlock full AI assistance."
    },
    {
      match: ['dashboard'],
      icon: 'fa-solid fa-house',
      greeting: "What would you like to master today?",
      hint: "Ask me about JavaScript or anything on the SkillSprint platform."
    }
  ];

  function getPageContext() {
    for (const ctx of PAGE_CONTEXTS) {
      if (ctx.match.some(m => PATH.includes(m))) return ctx;
    }
    return {
      icon: 'fa-solid fa-robot',
      greeting: "How can I help you today?",
      hint: "Ask me anything about JavaScript or the SkillSprint platform."
    };
  }



  /* ── State ── */
  let panelOpen = false;
  let isLocked  = false;

  /* ── Build HTML ── */
  const ctx = getPageContext();

  const orbWrapperHTML = `
    <link rel="stylesheet" href="./assets/css/ai-orb.css" id="ssAiOrbCss">
    <div id="ssAiOrbWrapper" style="position:fixed;z-index:9500;bottom:0;right:0;pointer-events:none;">

      <!-- Compact Panel -->
      <div class="ss-ai-panel" id="ssAiPanel" role="dialog" aria-label="AI Mentor compact assistant">

        <!-- Header -->
        <div class="sap-header">
          <div class="sap-bot-wrap">
            <div class="ss-bot size-sm" data-state="idle" id="sapBotIcon">
              <div class="ss-bot-head">
                <div class="ss-bot-eyes">
                  <div class="ss-bot-eye left"></div>
                  <div class="ss-bot-eye right"></div>
                </div>
                <div class="ss-bot-mouth"></div>
              </div>
            </div>
          </div>
          <div class="sap-title-group">
            <p class="sap-title">AI Mentor</p>
            <p class="sap-subtitle" id="sapSubtitle">${ctx.hint}</p>
          </div>
          <button class="sap-close-btn" id="sapCloseBtn" title="Close" aria-label="Close AI assistant">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Context Banner -->
        <div class="sap-context-banner" id="sapContextBanner">
          <i class="${ctx.icon} sap-context-icon"></i>
          <span class="sap-context-text" id="sapContextText">${ctx.greeting}</span>
        </div>

        <!-- Feed -->
        <div class="sap-feed" id="sapFeed"></div>

        <!-- Input -->
        <div class="sap-input-row">
          <textarea
            class="sap-input"
            id="sapInput"
            placeholder="Ask about JavaScript or the platform..."
            rows="1"
            aria-label="Message input"
          ></textarea>
          <button class="sap-send-btn" id="sapSendBtn" disabled title="Send">
            <i class="fa-solid fa-arrow-up"></i>
          </button>
        </div>

        <!-- Open Full Workspace -->
        <a href="${AI_URL}" class="sap-workspace-link" id="sapWorkspaceLink">
          <i class="fa-solid fa-arrow-up-right-from-square"></i>
          Open full AI workspace
        </a>
      </div>

      <!-- Orb -->
      <button class="ss-ai-orb" id="ssAiOrb" aria-label="Open AI Mentor" title="AI Mentor">
        <div class="ss-bot size-sm orb-bot" data-state="idle">
          <div class="ss-bot-head">
            <div class="ss-bot-eyes">
              <div class="ss-bot-eye left"></div>
              <div class="ss-bot-eye right"></div>
            </div>
            <div class="ss-bot-mouth"></div>
          </div>
        </div>
        <span class="orb-lock-badge" id="orbLockBadge" aria-hidden="true">
          <i class="fa-solid fa-lock"></i>
        </span>
        <!-- Tooltip -->
        <div class="ss-ai-orb-tooltip" id="ssAiOrbTooltip" role="tooltip">AI Mentor</div>
      </button>

    </div>
  `;

  /* ── Inject ── */
  function inject() {
    // Needs bot animations + Font Awesome (already loaded on most pages)
    // Inject bot-animations CSS if not present
    if (!document.querySelector('link[href*="bot-animations.css"]')) {
      const botCss = document.createElement('link');
      botCss.rel = 'stylesheet';
      botCss.href = './assets/css/bot-animations.css';
      document.head.appendChild(botCss);
    }

    document.body.insertAdjacentHTML('beforeend', orbWrapperHTML);
    bindEvents();
    syncLockState();
  }

  /* ── Events ── */
  function bindEvents() {
    const orb          = document.getElementById('ssAiOrb');
    const panel        = document.getElementById('ssAiPanel');
    const closeBtn     = document.getElementById('sapCloseBtn');
    const input        = document.getElementById('sapInput');
    const sendBtn      = document.getElementById('sapSendBtn');
    const tooltip      = document.getElementById('ssAiOrbTooltip');

    // Orb Dragging Logic
    let isDragging = false;
    let dragHasMoved = false;
    let startX, startY, initialLeft, initialTop;

    function startDrag(e) {
      if (e.target.closest('.orb-lock-badge')) return;
      
      const evt = e.touches ? e.touches[0] : e;
      startX = evt.clientX;
      startY = evt.clientY;
      
      const rect = orb.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      
      // Override fixed positioning constraints so we can drag it freely
      orb.style.right = 'auto';
      orb.style.bottom = 'auto';
      orb.style.left = initialLeft + 'px';
      orb.style.top = initialTop + 'px';
      orb.style.transition = 'none'; // disable hover transition during drag
      
      isDragging = true;
      dragHasMoved = false;
      
      document.addEventListener(e.touches ? 'touchmove' : 'mousemove', moveDrag, { passive: false });
      document.addEventListener(e.touches ? 'touchend' : 'mouseup', endDrag);
    }
    
    function moveDrag(e) {
      if (!isDragging) return;
      const evt = e.touches ? e.touches[0] : e;
      
      const deltaX = evt.clientX - startX;
      const deltaY = evt.clientY - startY;
      
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        dragHasMoved = true;
      }
      
      if (dragHasMoved) {
        e.preventDefault(); // prevent scroll on touch
        orb.style.left = (initialLeft + deltaX) + 'px';
        orb.style.top = (initialTop + deltaY) + 'px';
      }
    }
    
    function endDrag(e) {
      if (!isDragging) return;
      isDragging = false;
      
      orb.style.transition = ''; // restore
      
      const isTouch = e.type === 'touchend';
      document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', moveDrag);
      document.removeEventListener(isTouch ? 'touchend' : 'mouseup', endDrag);
      
      // Clamp to screen bounds
      const rect = orb.getBoundingClientRect();
      const maxLeft = window.innerWidth - rect.width - 10;
      const maxTop = window.innerHeight - rect.height - 10;
      
      let finalLeft = Math.max(10, Math.min(rect.left, maxLeft));
      let finalTop = Math.max(10, Math.min(rect.top, maxTop));
      
      orb.style.left = finalLeft + 'px';
      orb.style.top = finalTop + 'px';
    }

    orb.addEventListener('mousedown', startDrag);
    orb.addEventListener('touchstart', startDrag, { passive: false });

    // Orb click → toggle panel or show locked state
    orb.addEventListener('click', (e) => {
      if (dragHasMoved) {
        dragHasMoved = false;
        return; // Ignore click if a drag just finished
      }
      if (isLocked) return; // hard block
      togglePanel();
    });

    // Close
    closeBtn.addEventListener('click', closePanel);

    // Input
    input.addEventListener('input', () => {
      sendBtn.disabled = input.value.trim().length === 0;
      autoResizeInput(input);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) handleSend();
      }
    });

    sendBtn.addEventListener('click', handleSend);

    // Close panel on outside click
    document.addEventListener('click', (e) => {
      if (!panelOpen) return;
      const wrapper = document.getElementById('ssAiOrbWrapper');
      if (wrapper && !wrapper.contains(e.target)) closePanel();
    }, true);

    // Listen for quiz state changes from other scripts (e.g. quiz.js)
    window.addEventListener('storage', (e) => {
      if (e.key === QUIZ_FLAG) syncLockState();
    });

    // Custom event dispatched by quiz.js in the same tab
    window.addEventListener('ss:quizStateChanged', syncLockState);
  }

  /* ── Panel Toggle ── */
  function togglePanel() {
    panelOpen ? closePanel() : openPanel();
  }

  function openPanel() {
    panelOpen = true;
    const panel = document.getElementById('ssAiPanel');
    const feed  = document.getElementById('sapFeed');
    panel.classList.add('panel-open');

    // Show greeting if feed is empty
    if (feed && feed.children.length === 0) {
      appendBotMsg(ctx.greeting);
    }

    setTimeout(() => {
      const input = document.getElementById('sapInput');
      if (input) input.focus();
    }, 200);

    setBotState('wave');
    setTimeout(() => setBotState('idle'), 1800);
  }

  function closePanel() {
    panelOpen = false;
    const panel = document.getElementById('ssAiPanel');
    if (panel) panel.classList.remove('panel-open');
  }

  /* ── Chat ── */
  async function handleSend() {
    const input = document.getElementById('sapInput');
    const query = input.value.trim();
    if (!query) return;

    appendUserMsg(query);
    input.value = '';
    document.getElementById('sapSendBtn').disabled = true;
    autoResizeInput(input);

    setBotState('thinking');
    const thinkEl = appendThinking();

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${window.API_BASE_URL}/ai/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ message: query })
      });

      if (!res.ok) throw new Error('API error');
      const data = await res.json();

      thinkEl.remove();
      
      let answerText = data.response || "I'm not sure how to answer that.";
      
      const ROUTE_MAP = {
        "LIVE_SESSIONS": "/dashboard/live-sessions.html",
        "PAIR_PROGRAMMING": "/dashboard/pair-programming.html",
        "WHITEBOARD": "/dashboard/whiteboard.html",
        "MATCHMAKING": "/dashboard/matchmaking.html",
        "QUIZZES": "/dashboard/quizzes.html",
        "CERTIFICATES": "/dashboard/certificates.html",
        "LIBRARY": "/dashboard/library.html",
        "WALLET": "/dashboard/wallet.html",
        "TASKS": "/dashboard/tasks.html",
        "SOCIAL": "/dashboard/social.html",
        "HELP_AUTH": "/help/authentication.html",
        "SETTINGS": "/dashboard/settings.html",
        "SYSTEM_HEALTH": "/help/system-health.html",
        "NONE": ""
      };
      
      let route = ROUTE_MAP[data.route] || data.route || null;
      
      // Confidence Tiers
      const conf = data.confidence || 0;
      if (conf >= 0.75) {
        // High confidence
      } else if (conf >= 0.50 && conf < 0.75) {
        answerText = `<em>I think you're asking about this:</em><br><br>${answerText}`;
      } else {
        if (data.alternatives && data.alternatives.length > 0) {
          answerText = `I'm not entirely sure. Try one of these topics:<ul>` + 
            data.alternatives.map(alt => `<li>${alt.intent}</li>`).join('') + `</ul>`;
          route = null;
        }
      }

      let finalHtml = answerText.replace(/\n/g, '<br />');
      if (route) {
        finalHtml += `<br><br><a href="${route}" style="color:#DCEF62;text-decoration:underline;">Click here to go there</a>`;
      }
      
      appendBotMsg(finalHtml);
      setBotState('success');
      setTimeout(() => setBotState('idle'), 1600);
    } catch (err) {
      console.error('Orb AI Predict Error:', err);
      thinkEl.remove();
      appendBotMsg("I'm sorry, I'm currently unreachable. Please try again later.");
      setBotState('idle');
    }
  }

  function appendUserMsg(text) {
    const feed = document.getElementById('sapFeed');
    const el = document.createElement('div');
    el.className = 'sap-msg user';
    el.innerHTML = `<div class="sap-msg-bubble">${escHtml(text)}</div>`;
    feed.appendChild(el);
    scrollFeed();
  }

  function appendBotMsg(html) {
    const feed = document.getElementById('sapFeed');
    const el = document.createElement('div');
    el.className = 'sap-msg bot';
    el.innerHTML = `<div class="sap-msg-bubble">${html}</div>`;
    feed.appendChild(el);
    scrollFeed();
  }

  function appendThinking() {
    const feed = document.getElementById('sapFeed');
    const el = document.createElement('div');
    el.className = 'sap-msg bot sap-thinking';
    el.innerHTML = `
      <div class="sap-msg-bubble">
        <div class="sap-dot"></div>
        <div class="sap-dot"></div>
        <div class="sap-dot"></div>
      </div>`;
    feed.appendChild(el);
    scrollFeed();
    return el;
  }

  function scrollFeed() {
    requestAnimationFrame(() => {
      const feed = document.getElementById('sapFeed');
      if (feed) feed.scrollTop = feed.scrollHeight;
    });
  }

  /* ── Bot State ── */
  function setBotState(state) {
    const bot = document.getElementById('sapBotIcon');
    if (bot) bot.dataset.state = state;
  }

  /* ── Quiz Lock ── */
  function syncLockState() {
    const locked = localStorage.getItem(QUIZ_FLAG) === 'true';
    isLocked = locked;

    const orb         = document.getElementById('ssAiOrb');
    const tooltip     = document.getElementById('ssAiOrbTooltip');
    const panel       = document.getElementById('ssAiPanel');
    const workspaceLink = document.getElementById('sapWorkspaceLink');

    if (!orb) return;

    if (locked) {
      orb.classList.add('orb-locked');
      if (tooltip) tooltip.textContent = 'AI Mentor unavailable during quiz sessions';
      if (panelOpen) closePanel();
      if (workspaceLink) {
        workspaceLink.style.pointerEvents = 'none';
        workspaceLink.style.opacity = '0.35';
      }
    } else {
      orb.classList.remove('orb-locked');
      if (tooltip) tooltip.textContent = 'AI Mentor';
      if (workspaceLink) {
        workspaceLink.style.pointerEvents = '';
        workspaceLink.style.opacity = '';
      }
    }
  }

  /* ── Helpers ── */
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function autoResizeInput(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 80) + 'px';
  }

  /* ── Init ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

  /* ── Expose global controller for quiz.js and other modules ── */
  window.SSAiOrb = {
    lock:   () => { localStorage.setItem(QUIZ_FLAG, 'true');  window.dispatchEvent(new Event('ss:quizStateChanged')); },
    unlock: () => { localStorage.removeItem(QUIZ_FLAG);       window.dispatchEvent(new Event('ss:quizStateChanged')); },
    open:   openPanel,
    close:  closePanel
  };

})();

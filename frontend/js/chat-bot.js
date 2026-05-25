/**
 * SkillSprint AI Mentor Bot — Frontend UI Controller
 * Layer: chatbot-ui.js (UI logic ONLY — no AI engine calls yet)
 *
 * Responsibilities:
 *   - Suggestion chip shuffle & auto-fill
 *   - Structured response card rendering (Answer + Code + Related)
 *   - AI Indicator state machine (idle / thinking / wave / success)
 *   - Confidence meter updates
 *   - Sidebar navigation & mobile drawer
 *   - Textarea auto-resize
 *   - Query submission flow (stub → ready for ai-client.js wiring)
 *   - Recent-chat session history (localStorage)
 *   - Save query feature
 */

'use strict';

/* ================================================================
   SUGGESTION CHIP DATA
   Domain-locked: SkillSprint platform + JavaScript only
================================================================ */
const SUGGESTION_POOL = [
  { label: 'What is a JavaScript closure?',        icon: 'fa-brands fa-js',           category: 'javascript'  },
  { label: 'How do I join a SkillSprint session?', icon: 'fa-solid fa-video',          category: 'platform'    },
  { label: 'Explain promises in JavaScript',       icon: 'fa-brands fa-js',           category: 'javascript'  },
  { label: 'Help me upload a file',                icon: 'fa-solid fa-cloud-arrow-up', category: 'platform'    },
  { label: 'Difference between var, let, const',   icon: 'fa-brands fa-js',           category: 'javascript'  },
  { label: 'How do I book a mentor session?',      icon: 'fa-solid fa-calendar-check', category: 'platform'    },
  { label: 'What is async/await?',                 icon: 'fa-brands fa-js',           category: 'javascript'  },
  { label: 'How do wallet credits work?',          icon: 'fa-solid fa-wallet',         category: 'platform'    },
  { label: 'Explain the JavaScript event loop',    icon: 'fa-brands fa-js',           category: 'javascript'  },
  { label: 'How to get my certificate?',           icon: 'fa-solid fa-certificate',    category: 'platform'    },
  { label: 'What is a JavaScript prototype?',      icon: 'fa-brands fa-js',           category: 'javascript'  },
  { label: 'How do I start pair programming?',     icon: 'fa-solid fa-code',           category: 'platform'    },
  { label: 'Array methods: map, filter, reduce',   icon: 'fa-brands fa-js',           category: 'javascript'  },
  { label: 'How do quiz sessions work?',           icon: 'fa-solid fa-circle-question', category: 'platform'   },
  { label: 'What are JavaScript modules?',         icon: 'fa-brands fa-js',           category: 'javascript'  },
  { label: 'How to enable notifications?',         icon: 'fa-solid fa-bell',           category: 'platform'    },
];

/* Chips shown in empty state (centre + inline) */
const CHIP_DISPLAY_COUNT = 7;

/* ================================================================
   MOCK RESPONSE DATA
   Stub responses keyed by intent — will be replaced by ai-client.js
================================================================ */
const MOCK_RESPONSES = {
  'js.closures': {
    intent:     'js.closures',
    confidence: 0.93,
    answer: `A <strong>closure</strong> in JavaScript is a function that retains access to its outer (enclosing) lexical scope even after the outer function has returned.\n\nEvery function in JavaScript forms a closure over the environment in which it was created. This means the inner function can read and write variables from the outer scope, even when called later or in a different context.`,
    code: {
      lang: 'JavaScript',
      source: `<span class="tok-kw">function</span> <span class="tok-fn">makeCounter</span>() {
  <span class="tok-kw">let</span> count <span class="tok-op">=</span> <span class="tok-num">0</span><span class="tok-punc">;</span>        <span class="tok-cmt">// private variable (closure)</span>

  <span class="tok-kw">return</span> {
    increment<span class="tok-punc">:</span> () <span class="tok-op">=></span> <span class="tok-punc">{</span> count<span class="tok-op">++</span><span class="tok-punc">;</span> <span class="tok-punc">},</span>
    decrement<span class="tok-punc">:</span> () <span class="tok-op">=></span> <span class="tok-punc">{</span> count<span class="tok-op">--</span><span class="tok-punc">;</span> <span class="tok-punc">},</span>
    value<span class="tok-punc">:</span>     () <span class="tok-op">=></span> count
  <span class="tok-punc">};</span>
<span class="tok-punc">}</span>

<span class="tok-kw">const</span> counter <span class="tok-op">=</span> <span class="tok-fn">makeCounter</span>()<span class="tok-punc">;</span>
counter<span class="tok-punc">.</span><span class="tok-fn">increment</span>()<span class="tok-punc">;</span>
counter<span class="tok-punc">.</span><span class="tok-fn">increment</span>()<span class="tok-punc">;</span>
console<span class="tok-punc">.</span><span class="tok-fn">log</span>(counter<span class="tok-punc">.</span><span class="tok-fn">value</span>())<span class="tok-punc">;</span>  <span class="tok-cmt">// → 2</span>`
    },
    related: [
      { label: 'What are higher-order functions?',    icon: 'fa-brands fa-js'           },
      { label: 'Explain the scope chain in JS',       icon: 'fa-brands fa-js'           },
      { label: 'What is a JavaScript prototype?',     icon: 'fa-brands fa-js'           },
      { label: 'Closures vs classes',                 icon: 'fa-brands fa-js'           },
    ]
  },

  'platform.sessions': {
    intent:     'platform.sessions',
    confidence: 0.88,
    answer: `To <strong>join a SkillSprint session</strong>, navigate to your Dashboard and locate the <strong>Upcoming Sessions</strong> section. Click the <strong>Join</strong> button on the relevant session card.\n\nIf the session hasn't started yet, the button will be disabled and a countdown will be shown. Make sure your camera and microphone are enabled in your browser before joining.`,
    code: null,
    related: [
      { label: 'How do I book a mentor session?',  icon: 'fa-solid fa-calendar-check' },
      { label: 'How do wallet credits work?',       icon: 'fa-solid fa-wallet'         },
      { label: 'How do I start pair programming?',  icon: 'fa-solid fa-code'           },
      { label: 'Can I reschedule a session?',       icon: 'fa-solid fa-clock-rotate-left' },
    ]
  },

  'js.promises': {
    intent:     'js.promises',
    confidence: 0.91,
    answer: `A <strong>Promise</strong> in JavaScript represents a value that may be available now, in the future, or never. It is an object that wraps an asynchronous operation and provides <code>.then()</code>, <code>.catch()</code>, and <code>.finally()</code> methods to handle the result.\n\nA Promise exists in one of three states:\n<strong>Pending</strong> → initial state\n<strong>Fulfilled</strong> → operation completed successfully\n<strong>Rejected</strong> → operation failed`,
    code: {
      lang: 'JavaScript',
      source: `<span class="tok-kw">const</span> fetchUser <span class="tok-op">=</span> (id) <span class="tok-op">=></span>
  <span class="tok-kw">new</span> <span class="tok-fn">Promise</span>((resolve, reject) <span class="tok-op">=></span> <span class="tok-punc">{</span>
    <span class="tok-fn">setTimeout</span>(() <span class="tok-op">=></span> <span class="tok-punc">{</span>
      <span class="tok-kw">if</span> (id <span class="tok-op">></span> <span class="tok-num">0</span>) resolve(<span class="tok-punc">{</span> id, name<span class="tok-punc">:</span> <span class="tok-str">'Alex'</span> <span class="tok-punc">}</span>)<span class="tok-punc">;</span>
      <span class="tok-kw">else</span>        reject(<span class="tok-kw">new</span> <span class="tok-fn">Error</span>(<span class="tok-str">'Invalid ID'</span>))<span class="tok-punc">;</span>
    <span class="tok-punc">},</span> <span class="tok-num">500</span>)<span class="tok-punc">;</span>
  <span class="tok-punc">}</span>)<span class="tok-punc">;</span>

<span class="tok-fn">fetchUser</span>(<span class="tok-num">1</span>)
  <span class="tok-punc">.</span><span class="tok-fn">then</span>(user  <span class="tok-op">=></span> console<span class="tok-punc">.</span><span class="tok-fn">log</span>(user<span class="tok-punc">.</span>name))  <span class="tok-cmt">// 'Alex'</span>
  <span class="tok-punc">.</span><span class="tok-fn">catch</span>(err   <span class="tok-op">=></span> console<span class="tok-punc">.</span><span class="tok-fn">error</span>(err))<span class="tok-punc">;</span>`
    },
    related: [
      { label: 'What is async/await?',            icon: 'fa-brands fa-js' },
      { label: 'Promise.all vs Promise.race',     icon: 'fa-brands fa-js' },
      { label: 'Explain the JavaScript event loop', icon: 'fa-brands fa-js' },
      { label: 'What is a callback function?',    icon: 'fa-brands fa-js' },
    ]
  },

  'fallback': {
    intent:     'fallback',
    confidence: 0.42,
    answer: `I couldn't find a close match for your question.\n\nPlease try rephrasing it, or select one of the suggested topics below.`,
    code: null,
    related: [
      { label: 'What is a JavaScript closure?',   icon: 'fa-brands fa-js' },
      { label: 'How do I join a session?',        icon: 'fa-solid fa-video' },
      { label: 'Explain promises in JavaScript',  icon: 'fa-brands fa-js' },
      { label: 'How do wallet credits work?',     icon: 'fa-solid fa-wallet' },
    ],
    isFallback: true
  }
};

/* Simple keyword-to-intent mapping for the UI stub */
function mockClassify(query) {
  const q = query.toLowerCase();
  if (q.includes('closure'))                               return 'js.closures';
  if (q.includes('session') || q.includes('join'))        return 'platform.sessions';
  if (q.includes('promise'))                               return 'js.promises';
  if (q.includes('async') || q.includes('await'))         return 'js.promises';
  return 'fallback';
}

/* ================================================================
   STATE
================================================================ */
const State = {
  chatActive:     false,
  currentSection: 'chat',
  savedQueries:   JSON.parse(localStorage.getItem('ss_mentor_saved') || '[]'),
  recentChats:    JSON.parse(localStorage.getItem('ss_mentor_recent') || '[]'),
  currentSession: JSON.parse(localStorage.getItem('ss_mentor_session') || '[]'),
};

/* ================================================================
   DOM REFS
================================================================ */
const $ = (id) => document.getElementById(id);

const dom = {
  shell:            $('mentorShell'),
  sidebar:          document.querySelector('.mentor-sidebar'),
  sidebarToggle:    $('msbToggleBtn'),
  sidebarClose:     $('msbCloseBtn'),
  sidebarOverlay:   $('msbOverlay'),
  newChatBtn:       $('newChatBtn'),

  navItems:         document.querySelectorAll('.msb-nav-item'),

  emptyState:       $('emptyState'),
  mentorThread:     $('mentorThread'),
  mentorBody:       $('mentorBody'),

  suggestionChips:  $('suggestionChips'),
  inlineChipsRow:   $('inlineChipsRow'),

  mentorInput:      $('mentorInput'),
  sendBtn:          $('sendBtn'),
  aiIndicator:      $('aiIndicator'),

  confidenceFill:   $('confidenceFill'),
  confidenceValue:  $('confidenceValue'),
};

/* ================================================================
   CHIP SHUFFLE
================================================================ */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderSuggestionChips() {
  const shuffled = shuffleArray(SUGGESTION_POOL).slice(0, CHIP_DISPLAY_COUNT);

  // Centre empty-state chips
  dom.suggestionChips.innerHTML = shuffled.map(chip => `
    <button class="suggestion-chip" data-query="${escHtml(chip.label)}">
      <i class="${chip.icon}"></i>
      ${escHtml(chip.label)}
    </button>
  `).join('');

  // Inline chips (above input, shown when empty)
  dom.inlineChipsRow.innerHTML = shuffled.slice(0, 4).map(chip => `
    <button class="miz-chip-inline" data-query="${escHtml(chip.label)}">
      <i class="${chip.icon}"></i>
      ${escHtml(chip.label)}
    </button>
  `).join('');

  // Attach click events
  dom.suggestionChips.querySelectorAll('.suggestion-chip').forEach(btn => {
    btn.addEventListener('click', () => fillInput(btn.dataset.query));
  });
  dom.inlineChipsRow.querySelectorAll('.miz-chip-inline').forEach(btn => {
    btn.addEventListener('click', () => fillInput(btn.dataset.query));
  });
}

function fillInput(text) {
  dom.mentorInput.value = text;
  dom.mentorInput.dispatchEvent(new Event('input'));
  dom.mentorInput.focus();
}

/* ================================================================
   TEXTAREA AUTO-RESIZE
================================================================ */
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

dom.mentorInput.addEventListener('input', () => {
  autoResize(dom.mentorInput);
  dom.sendBtn.disabled = dom.mentorInput.value.trim().length === 0;
});

dom.mentorInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!dom.sendBtn.disabled) submitQuery();
  }
});

dom.sendBtn.addEventListener('click', () => {
  if (!dom.sendBtn.disabled) submitQuery();
});

/* ================================================================
   AI INDICATOR STATE MACHINE
================================================================ */
function setIndicatorState(state) {
  dom.aiIndicator.dataset.state = state;
  if (state === 'wave') {
    setTimeout(() => setIndicatorState('idle'), 1600);
  } else if (state === 'success') {
    setTimeout(() => setIndicatorState('idle'), 1800);
  }
}

/* ================================================================
   CONFIDENCE METER
================================================================ */
function updateConfidenceMeter(score) {
  const pct = Math.round(score * 100);
  dom.confidenceFill.style.width = pct + '%';
  dom.confidenceValue.textContent = pct + '%';
  dom.confidenceFill.classList.remove('low', 'medium', 'high');
  if (score < 0.5)      dom.confidenceFill.classList.add('low');
  else if (score < 0.70) dom.confidenceFill.classList.add('medium');
  else                   dom.confidenceFill.classList.add('high');
}

function resetConfidenceMeter() {
  dom.confidenceFill.style.width = '0%';
  dom.confidenceValue.textContent = '—';
  dom.confidenceFill.classList.remove('low', 'medium', 'high');
}

/* ================================================================
   QUERY SUBMISSION + RESPONSE RENDERING
================================================================ */
function submitQuery() {
  const query = dom.mentorInput.value.trim();
  if (!query) return;

  // Transition UI to chat active
  activateChat();

  // Append user bubble
  appendUserBubble(query);

  // Clear input
  dom.mentorInput.value = '';
  dom.sendBtn.disabled = true;
  autoResize(dom.mentorInput);

  // Show thinking state
  setIndicatorState('thinking');
  const thinkEl = appendThinkingIndicator();

  // Simulate AI round-trip delay (will be replaced by actual API call)
  const delay = 900 + Math.random() * 500;
  setTimeout(() => {
    thinkEl.remove();
    const intentKey = mockClassify(query);
    const response  = MOCK_RESPONSES[intentKey] || MOCK_RESPONSES['fallback'];
    appendResponse(response, query);
    updateConfidenceMeter(response.confidence);
    setIndicatorState('success');
    // Persist to recent + session
    addToRecent(query, response);
    persistSession(query, response);
  }, delay);
}

/* ── Activate chat mode (hide empty state) ── */
function activateChat() {
  if (State.chatActive) return;
  State.chatActive = true;

  dom.emptyState.style.display = 'none';
  dom.inlineChipsRow.style.display = 'none';
  dom.mentorThread.classList.add('active');
}

/* ── User query bubble ── */
function appendUserBubble(query) {
  const el = document.createElement('div');
  el.className = 'thread-query';
  el.innerHTML = `<div class="thread-query-bubble">${escHtml(query)}</div>`;
  dom.mentorThread.appendChild(el);
  scrollToBottom();
}

/* ── Thinking indicator ── */
function appendThinkingIndicator() {
  const el = document.createElement('div');
  el.className = 'thread-thinking';
  el.innerHTML = `
    <div class="thinking-dots">
      <div class="thinking-dot"></div>
      <div class="thinking-dot"></div>
      <div class="thinking-dot"></div>
    </div>
    <span class="thinking-label">Finding the best answer...</span>
  `;
  dom.mentorThread.appendChild(el);
  scrollToBottom();
  return el;
}

/* ── Full structured response ── */
function appendResponse(resp, originalQuery) {
  const block = document.createElement('div');
  block.className = 'thread-response';

  // ── 1. Fallback banner (no good match) ──
  if (resp.isFallback) {
    block.innerHTML += `
      <div class="resp-fallback-banner">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>
          <strong>I’m not sure about that one.</strong> I couldn’t find a close match
          for your question. Try rephrasing it, or pick a suggested topic below.
        </span>
      </div>`;
  }

  // ── 2. Answer Card ──
  const confClass = resp.confidence >= 0.70 ? 'high' :
                    resp.confidence >= 0.50 ? 'medium' : 'low';
  const confPct   = Math.round(resp.confidence * 100);

  // Map raw intent key to a readable topic label
  const intentLabels = {
    'js.closures':       'JavaScript',
    'js.promises':       'JavaScript',
    'platform.sessions': 'Platform Help',
    'fallback':          'General'
  };
  const topicLabel = intentLabels[resp.intent] || 'Answer';

  block.innerHTML += `
    <div class="resp-answer-card">
      <div class="rac-header">
        <span class="rac-badge"><i class="fa-solid fa-square-check"></i> Answer</span>
        <span class="rac-intent-tag">${escHtml(topicLabel)}</span>
      </div>
      <div class="rac-body">${formatAnswer(resp.answer)}</div>
      <div class="rac-footer">
        <div class="rac-confidence-row">
          <span class="rac-conf-label">Confidence</span>
          <span class="rac-conf-pill ${confClass}">${confPct}%</span>
        </div>
        <button class="rac-save-btn" data-query="${escHtml(originalQuery || resp.intent)}">
          <i class="fa-regular fa-bookmark"></i> Save
        </button>
      </div>
    </div>`;

  // ── 3. Code Snippet (conditional) ──
  if (resp.code) {
    block.innerHTML += `
      <div class="resp-code-card">
        <div class="rcc-header">
          <div class="rcc-dots">
            <div class="rcc-dot"></div>
            <div class="rcc-dot"></div>
            <div class="rcc-dot"></div>
          </div>
          <span class="rcc-lang-badge">
            <i class="fa-brands fa-js"></i>${escHtml(resp.code.lang)}
          </span>
          <button class="rcc-copy-btn" data-code="${encodeURIComponent(stripHtml(resp.code.source))}">
            <i class="fa-regular fa-copy"></i> Copy
          </button>
        </div>
        <div class="rcc-body">
          <code class="rcc-code">${resp.code.source}</code>
        </div>
      </div>`;
  }

  // ── 4. Related Intents ──
  if (resp.related && resp.related.length > 0) {
    const chips = resp.related.map(r => `
      <button class="rrc-chip" data-query="${escHtml(r.label)}">
        <i class="${r.icon}"></i>${escHtml(r.label)}
      </button>`).join('');

    block.innerHTML += `
      <div class="resp-related-card">
        <div class="rrc-header">
          <i class="fa-solid fa-arrow-right-long"></i>
          Related intents — try asking
        </div>
        <div class="rrc-chips">${chips}</div>
      </div>`;
  }

  dom.mentorThread.appendChild(block);

  // ── Wire events ──
  // Save button
  block.querySelector('.rac-save-btn')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    saveQuery(btn.dataset.query, resp);
    btn.innerHTML = '<i class="fa-solid fa-bookmark"></i> Saved';
    btn.style.color = '#5a6e00';
    btn.style.borderColor = 'rgba(220,239,98,0.4)';
    btn.style.background = 'rgba(220,239,98,0.1)';
    btn.disabled = true;
  });

  // Copy button
  block.querySelector('.rcc-copy-btn')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const code = decodeURIComponent(btn.dataset.code);
    navigator.clipboard.writeText(code).then(() => {
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
        btn.classList.remove('copied');
      }, 2000);
    });
  });

  // Related chip clicks
  block.querySelectorAll('.rrc-chip').forEach(chip => {
    chip.addEventListener('click', () => fillInput(chip.dataset.query));
  });

  scrollToBottom();
}

/* ================================================================
   UTILITY HELPERS
================================================================ */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function formatAnswer(text) {
  // Convert newlines to <br>, preserve inline HTML from mock data
  return text.replace(/\n/g, '<br />');
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    dom.mentorBody.scrollTo({ top: dom.mentorBody.scrollHeight, behavior: 'smooth' });
  });
}

/* ================================================================
   RECENT CHATS & SAVED QUERIES (localStorage)
================================================================ */
function addToRecent(query, response) {
  // Check if already exists (same query) and remove it first
  State.recentChats = State.recentChats.filter(r => r.query !== query);
  const entry = { query, response, time: Date.now() };
  State.recentChats.unshift(entry);
  if (State.recentChats.length > 20) State.recentChats.pop();
  localStorage.setItem('ss_mentor_recent', JSON.stringify(State.recentChats));
}

function saveQuery(query, response) {
  // Avoid duplicates
  const exists = State.savedQueries.some(s => s.query === query);
  if (exists) return;
  State.savedQueries.push({ query, response, time: Date.now() });
  localStorage.setItem('ss_mentor_saved', JSON.stringify(State.savedQueries));
}

function unsaveQuery(query) {
  State.savedQueries = State.savedQueries.filter(s => s.query !== query);
  localStorage.setItem('ss_mentor_saved', JSON.stringify(State.savedQueries));
}

function persistSession(query, response) {
  State.currentSession.push({ query, response });
  localStorage.setItem('ss_mentor_session', JSON.stringify(State.currentSession));
}

function restoreSession() {
  if (State.currentSession.length === 0) return;
  activateChat();
  State.currentSession.forEach(({ query, response }) => {
    appendUserBubble(query);
    appendResponse(response);
  });
  updateConfidenceMeter(State.currentSession[State.currentSession.length - 1].response.confidence);
  scrollToBottom();
}

function renderRecentChats(container) {
  if (State.recentChats.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:32px 0;color:#bbb;font-size:0.82rem;">
        No recent chats yet. Ask your first question.
      </div>`;
    return;
  }

  container.innerHTML = `<p class="sp-heading">Recent Chats</p>` +
    State.recentChats.slice(0, 10).map((r, i) => {
      const d = new Date(r.time);
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="recent-chat-item" data-query="${escHtml(r.query)}">
          <div class="rci-icon"><i class="fa-solid fa-clock-rotate-left"></i></div>
          <div class="rci-content">
            <div class="rci-query">${escHtml(r.query)}</div>
            <div class="rci-meta">${timeStr}</div>
          </div>
          <span class="rci-intent-tag">${mockClassify(r.query)}</span>
          <button class="rci-delete-btn" data-index="${i}" title="Delete chat">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>`;
    }).join('');

  container.querySelectorAll('.recent-chat-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.rci-delete-btn')) {
        e.stopPropagation();
        const index = parseInt(e.target.closest('.rci-delete-btn').dataset.index, 10);
        State.recentChats.splice(index, 1);
        localStorage.setItem('ss_mentor_recent', JSON.stringify(State.recentChats));
        renderRecentChats(container);
        return;
      }
      fillInput(item.dataset.query);
      showSection('chat');
    });
  });
}

function renderTopicList(container, category) {
  const items = SUGGESTION_POOL.filter(c => c.category === category);
  container.innerHTML = `<p class="sp-heading">${category === 'javascript' ? 'JavaScript Topics' : 'Platform Help Topics'}</p>` +
    items.map(c => `
      <div class="recent-chat-item" data-query="${escHtml(c.label)}">
        <div class="rci-icon"><i class="${c.icon}"></i></div>
        <div class="rci-content">
          <div class="rci-query">${escHtml(c.label)}</div>
          <div class="rci-meta">${category === 'javascript' ? 'JavaScript' : 'Platform'}</div>
        </div>
        <span class="rci-intent-tag">${category}</span>
      </div>`).join('');

  container.querySelectorAll('.recent-chat-item').forEach(item => {
    item.addEventListener('click', () => {
      fillInput(item.dataset.query);
      showSection('chat');
    });
  });
}

function renderSavedQueries(container) {
  if (State.savedQueries.length === 0) {
    container.innerHTML = `
      <p class="sp-heading">Saved Queries</p>
      <div style="text-align:center;padding:32px 0;color:#bbb;font-size:0.82rem;">
        No saved queries yet. Click the Save button on any answer card.
      </div>`;
    return;
  }

  container.innerHTML = `<p class="sp-heading">Saved Queries</p>`;

  State.savedQueries.forEach((s, i) => {
    const d = new Date(s.time);
    const timeStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
                  + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const item = document.createElement('div');
    item.className = 'recent-chat-item';
    item.innerHTML = `
      <div class="rci-icon"><i class="fa-solid fa-bookmark"></i></div>
      <div class="rci-content">
        <div class="rci-query">${escHtml(s.query)}</div>
        <div class="rci-meta">${timeStr}</div>
      </div>
      <button class="rci-delete-btn" data-index="${i}" title="Remove bookmark">
        <i class="fa-solid fa-bookmark-slash"></i>
      </button>`;

    // Click row → re-ask the query
    item.addEventListener('click', (e) => {
      if (e.target.closest('.rci-delete-btn')) return;
      fillInput(s.query);
      showSection('chat');
    });

    // Unsave button
    item.querySelector('.rci-delete-btn').addEventListener('click', () => {
      unsaveQuery(s.query);
      renderSavedQueries(container);
    });

    container.appendChild(item);
  });
}

/* ================================================================
   SECTION NAVIGATION
================================================================ */
let sectionPanel = null;

function showSection(section) {
  // Remove old section panel if any
  if (sectionPanel) { sectionPanel.remove(); sectionPanel = null; }

  // Update active nav item
  dom.navItems.forEach(n => {
    n.classList.toggle('active', n.dataset.section === section);
  });

  State.currentSection = section;

  if (section === 'chat') {
    dom.emptyState.style.display  = State.chatActive ? 'none' : '';
    dom.mentorThread.style.display = State.chatActive ? '' : 'none';
    if (State.chatActive) dom.mentorThread.classList.add('active');
    dom.inlineChipsRow.style.display = State.chatActive ? 'none' : '';
    return;
  }

  // Hide chat views
  dom.emptyState.style.display   = 'none';
  dom.mentorThread.style.display = 'none';
  dom.inlineChipsRow.style.display = 'none';

  // Build section panel
  sectionPanel = document.createElement('div');
  sectionPanel.className = 'section-panel active';
  dom.mentorBody.appendChild(sectionPanel);

  if (section === 'recent')     renderRecentChats(sectionPanel);
  if (section === 'platform')   renderTopicList(sectionPanel, 'platform');
  if (section === 'javascript') renderTopicList(sectionPanel, 'javascript');
  if (section === 'saved') renderSavedQueries(sectionPanel);
}

/* ================================================================
   SIDEBAR TOGGLE (MOBILE)
================================================================ */
function openSidebar() {
  dom.sidebar.classList.add('open');
  dom.sidebarOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  dom.sidebar.classList.remove('open');
  dom.sidebarOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

dom.sidebarToggle?.addEventListener('click', openSidebar);
dom.sidebarClose?.addEventListener('click', closeSidebar);
dom.sidebarOverlay?.addEventListener('click', closeSidebar);

/* ================================================================
   NAV ITEM CLICKS
================================================================ */
dom.navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.dataset.section;
    showSection(section);
    // Close on mobile
    if (window.innerWidth <= 768) closeSidebar();
  });
});

/* ================================================================
   SEND BUTTON
================================================================ */
dom.sendBtn.addEventListener('click', submitQuery);

/* ================================================================
   NEW CHAT BUTTON
================================================================ */
dom.newChatBtn.addEventListener('click', () => {
  // Clear current session
  State.chatActive = false;
  State.currentSession = [];
  localStorage.removeItem('ss_mentor_session');

  dom.mentorThread.innerHTML = '';
  dom.mentorThread.classList.remove('active');
  dom.emptyState.style.display = '';
  dom.inlineChipsRow.style.display = '';

  dom.mentorInput.value = '';
  dom.sendBtn.disabled = true;
  autoResize(dom.mentorInput);

  resetConfidenceMeter();
  setIndicatorState('wave');

  renderSuggestionChips();

  if (sectionPanel) { sectionPanel.remove(); sectionPanel = null; }
  showSection('chat');

  if (window.innerWidth <= 768) closeSidebar();
});

/* ================================================================
   GLOBAL NAVBAR AI MENTOR ICON HELPER
   Call this from bottomNav.js or navbar-loader.js to inject the icon
================================================================ */
window.MentorBot = {
  /**
   * Inject the AI Mentor nav icon into a container element.
   * @param {HTMLElement} container  — where to append the icon
   * @param {boolean}    isDisabled — true when user is in quiz session
   */
  injectNavIcon(container, isDisabled = false) {
    const a = document.createElement('a');
    a.href      = isDisabled ? '#' : 'chat-bot.html';
    a.className = 'ai-mentor-nav-icon' + (isDisabled ? ' disabled' : '');
    a.setAttribute('data-tooltip', isDisabled
      ? 'AI Mentor is unavailable during a quiz'
      : 'AI Mentor');
    a.title = isDisabled ? 'AI Mentor is unavailable during a quiz' : 'AI Mentor';
    a.setAttribute('aria-label', 'AI Mentor');
    a.innerHTML = '<i class="fa-solid fa-microchip-ai"></i>';
    container.appendChild(a);
    return a;
  },

  /**
   * Upgrade the existing `.ai-guide` sidebar block in dashboard.html
   * to the premium AI Guide design.
   */
  upgradeAiGuide() {
    const guide = document.getElementById('aiGuide');
    if (!guide) return;
    guide.className = 'ai-guide-upgraded';
  guide.innerHTML = `
      <div class="ai-guide-label">Your AI Guide</div>
      <div class="ai-guide-title">AI Mentor</div>
      <div class="ai-guide-desc">
        Get answers about JavaScript &amp; the SkillSprint platform.
      </div>
      <a href="chat-bot.html" class="ai-guide-open-btn">
        <i class="fa-solid fa-microchip-ai"></i> Open AI Mentor
      </a>`;
  }
};

/* ================================================================
   INIT
================================================================ */
(function init() {
  renderSuggestionChips();
  setIndicatorState('idle');

  // Restore last session if it exists
  restoreSession();

  // Upgrade dashboard sidebar block if present (when embedded in dashboard)
  window.MentorBot.upgradeAiGuide();
})();

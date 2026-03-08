// frontend/js/public-profile.js
// Public Profile Screen – SkillSprint
// Renders any user's read-only public profile, fetched from GET /api/users/:userId/public

(function () {
    'use strict';

    // ── Config ───────────────────────────────────────────────────────────────
    const API_BASE = window.API_BASE_URL;
    const USERS_API = `${API_BASE}/users`;
    const POSTING_API = `${API_BASE}/posting`;

    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.href);
        return;
    }

    const authHdr = { Authorization: `Bearer ${token}` };

    // Parse ?user=<id> from URL
    const urlParams = new URLSearchParams(window.location.search);
    const targetUserId = urlParams.get('user');

    if (!targetUserId) {
        showToastSafe('No user specified. Redirecting to feed…', 'error');
        setTimeout(() => (window.location.href = 'posting.html'), 1200);
        return;
    }

    // ── Socket (online presence) ──────────────────────────────────────────────
    let socket = null;
    function setupSocket() {
        try {
            socket = io(API_BASE, { auth: { token }, transports: ['websocket', 'polling'] });
            socket.on('user:online', (uid) => {
                if (uid === targetUserId) setOnlineDot(true);
            });
            socket.on('user:offline', (uid) => {
                if (uid === targetUserId) setOnlineDot(false);
            });
        } catch (e) {
            console.warn('[PublicProfile] Socket not available', e);
        }
    }

    function setOnlineDot(online) {
        const dot = document.getElementById('ppOnlineDot');
        if (!dot) return;
        dot.classList.toggle('online', online);
        dot.title = online ? 'Online now' : 'Offline';
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    function showToastSafe(msg, type) {
        if (typeof showToast === 'function') showToast(msg, type);
        else console.log(`[${type}] ${msg}`);
    }

    function fmtDate(iso) {
        if (!iso) return '–';
        const d = new Date(iso);
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    }

    function fmtNum(n) {
        if (n === undefined || n === null) return '–';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
        return String(n);
    }

    function fmtRelTime(iso) {
        if (!iso) return '';
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'just now';
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        const days = Math.floor(h / 24);
        if (days < 30) return `${days}d ago`;
        return fmtDate(iso);
    }

    function roleIcon(role) {
        const icons = { mentor: 'fa-chalkboard-teacher', admin: 'fa-shield', student: 'fa-graduation-cap' };
        return icons[role] || 'fa-user';
    }

    function levelFromXp(xp) {
        if (xp >= 5000) return { level: 10, name: 'Legend', xpForThis: 5000, xpForNext: 99999 };
        if (xp >= 2500) return { level: 8, name: 'Expert', xpForThis: 2500, xpForNext: 5000 };
        if (xp >= 1500) return { level: 7, name: 'Advanced', xpForThis: 1500, xpForNext: 2500 };
        if (xp >= 1000) return { level: 6, name: 'Proficient', xpForThis: 1000, xpForNext: 1500 };
        if (xp >= 600) return { level: 5, name: 'Skilled', xpForThis: 600, xpForNext: 1000 };
        if (xp >= 300) return { level: 4, name: 'Intermediate', xpForThis: 300, xpForNext: 600 };
        if (xp >= 150) return { level: 3, name: 'Learner', xpForThis: 150, xpForNext: 300 };
        if (xp >= 50) return { level: 2, name: 'Novice', xpForThis: 50, xpForNext: 150 };
        return { level: 1, name: 'Beginner', xpForThis: 0, xpForNext: 50 };
    }

    // ── Follow / Unfollow ─────────────────────────────────────────────────────
    let isFollowingState = false;

    async function toggleFollow() {
        const followBtn = document.getElementById('ppFollowBtn');
        if (!followBtn) return;

        const originalHtml = followBtn.innerHTML;
        followBtn.disabled = true;
        followBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading…';

        try {
            if (isFollowingState) {
                // Unfollow
                const res = await fetch(`${POSTING_API}/unfollow/${targetUserId}`, {
                    method: 'DELETE', headers: authHdr
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.message || 'Unfollow failed');
                isFollowingState = false;
                updateFollowBtn();
                // Update follower count on page
                const fv = document.getElementById('ppFollowersVal');
                if (fv) fv.textContent = fmtNum(Math.max(0, (parseInt(fv.textContent) || 1) - 1));
                showToastSafe('Unfollowed', 'info');
            } else {
                // Follow
                const res = await fetch(`${POSTING_API}/follow/${targetUserId}`, {
                    method: 'POST', headers: authHdr
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.message || 'Follow failed');
                isFollowingState = true;
                updateFollowBtn();
                const fv = document.getElementById('ppFollowersVal');
                if (fv) fv.textContent = fmtNum((parseInt(fv.textContent) || 0) + 1);
                showToastSafe('Following!', 'success');
            }
        } catch (err) {
            showToastSafe(err.message || 'Action failed', 'error');
            followBtn.innerHTML = originalHtml;
        } finally {
            followBtn.disabled = false;
        }
    }

    function updateFollowBtn() {
        const btn = document.getElementById('ppFollowBtn');
        if (!btn) return;
        if (isFollowingState) {
            btn.innerHTML = '<i class="fa-solid fa-user-check"></i> Following';
            btn.className = 'pp-btn pp-btn-secondary';
            btn.onmouseenter = () => { btn.innerHTML = '<i class="fa-solid fa-user-minus"></i> Unfollow'; btn.className = 'pp-btn pp-btn-danger'; };
            btn.onmouseleave = () => { btn.innerHTML = '<i class="fa-solid fa-user-check"></i> Following'; btn.className = 'pp-btn pp-btn-secondary'; };
        } else {
            btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Follow';
            btn.className = 'pp-btn pp-btn-primary';
            btn.onmouseenter = null;
            btn.onmouseleave = null;
        }
    }

    // ── Render helpers ────────────────────────────────────────────────────────
    function setBadge(id, active) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('active', active);
        el.classList.toggle('inactive', !active);
        const check = el.querySelector('.badge-check');
        if (check) check.innerHTML = active
            ? '<i class="fa-solid fa-circle-check"></i>'
            : '<i class="fa-solid fa-circle-xmark"></i>';
    }

    function renderSkills(skills = [], commonSkills = []) {
        const wrap = document.getElementById('ppSkillsWrap');
        if (!wrap) return;
        if (!skills.length) {
            wrap.innerHTML = '<div class="pp-empty"><i class="fa-solid fa-bolt"></i>No skills listed</div>';
            return;
        }
        const commonSet = new Set((commonSkills || []).map(s => s.toLowerCase()));
        wrap.innerHTML = '';
        skills.forEach(s => {
            const tag = document.createElement('span');
            const isCommon = commonSet.has(s.toLowerCase());
            tag.className = 'pp-skill-tag' + (isCommon ? ' common' : '');
            tag.textContent = s;
            if (isCommon) tag.title = '✓ You also know this!';
            wrap.appendChild(tag);
        });
    }

    function renderRecentPosts(posts = []) {
        const list = document.getElementById('ppRecentList');
        if (!list) return;
        if (!posts.length) {
            list.innerHTML = '<div class="pp-empty"><i class="fa-regular fa-newspaper"></i>No posts yet</div>';
            return;
        }
        list.innerHTML = posts.map(p => `
      <div class="pp-post-card">
        <div class="pp-post-content">${escHtml(p.content || '(media post)')}</div>
        <div class="pp-post-meta">
          <span><i class="fa-regular fa-clock"></i>${fmtRelTime(p.createdAt)}</span>
          <span><i class="fa-regular fa-heart"></i>${p.likesCount || 0} likes</span>
          ${p.media?.length ? `<span><i class="fa-regular fa-image"></i>${p.media.length} media</span>` : ''}
        </div>
      </div>
    `).join('');
    }

    function renderAchievements(achievements = []) {
        const grid = document.getElementById('ppAchGrid');
        if (!grid) return;
        if (!achievements.length) {
            grid.innerHTML = '<div class="pp-empty" style="width:100%"><i class="fa-solid fa-medal"></i>No achievements yet</div>';
            return;
        }
        const medalMap = { gold: 'fa-trophy', silver: 'fa-medal', bronze: 'fa-award' };
        grid.innerHTML = achievements.slice(0, 12).map(a => {
            const tier = (a.type || 'bronze').toLowerCase();
            const icon = medalMap[tier] || 'fa-star';
            return `
        <div class="pp-ach-badge ${tier}" title="${escHtml(a.title)}">
          <i class="fa-solid ${icon}"></i>
          <span>${escHtml(a.title)}</span>
        </div>`;
        }).join('');
    }

    function renderProjects(projects = []) {
        const card = document.getElementById('ppProjectsCard');
        const list = document.getElementById('ppProjectsList');
        if (!card || !list || !projects.length) return;
        card.style.display = '';
        list.innerHTML = projects.map(p => `
      <div class="pp-list-item">
        <h4>${escHtml(p.title || 'Untitled Project')}</h4>
        ${p.description ? `<p>${escHtml(p.description)}</p>` : ''}
        ${Array.isArray(p.tech_stack) && p.tech_stack.length ? `<div class="pp-tech-chips">${p.tech_stack.map(t => `<span class="pp-tech-chip">${escHtml(t)}</span>`).join('')}</div>` : ''}
        ${p.link ? `<a href="${escAttr(p.link)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> View Project</a>` : ''}
      </div>`).join('');
    }

    function renderEducation(edu = []) {
        const card = document.getElementById('ppEduCard');
        const list = document.getElementById('ppEduList');
        if (!card || !list || !edu.length) return;
        card.style.display = '';
        list.innerHTML = edu.map(e => `
      <div class="pp-list-item">
        <h4>${escHtml(e.degree || 'Degree')}</h4>
        <p>${escHtml(e.institution || '')}${e.year ? ` · ${escHtml(e.year)}` : ''}${e.grade ? ` · ${escHtml(e.grade)}` : ''}</p>
      </div>`).join('');
    }

    function renderSocial(user) {
        const row = document.getElementById('ppSocialRow');
        if (!row) return;
        const links = [];
        if (user.github) links.push(`<a href="${escAttr(user.github)}" target="_blank" rel="noopener" class="pp-social-btn"><i class="fa-brands fa-github"></i> GitHub</a>`);
        if (user.linkedin) links.push(`<a href="${escAttr(user.linkedin)}" target="_blank" rel="noopener" class="pp-social-btn"><i class="fa-brands fa-linkedin-in"></i> LinkedIn</a>`);
        if (user.portfolio) links.push(`<a href="${escAttr(user.portfolio)}" target="_blank" rel="noopener" class="pp-social-btn"><i class="fa-solid fa-globe"></i> Portfolio</a>`);
        row.innerHTML = links.length ? links.join('') : '<span class="pp-empty" style="padding:0.5rem"><i class="fa-solid fa-link" style="font-size:1.2rem; display:inline; margin:0 0.3rem 0 0;"></i>No links added</span>';
    }

    function renderMatchmaking(user) {
        const card = document.getElementById('ppMatchCard');
        if (!card) return;

        const myUser = JSON.parse(localStorage.getItem('user') || '{}');
        if (user.isOwnProfile) return; // Don't show compatibility for self

        const commonSkills = user.commonSkills || [];
        const totalSkills = (user.skills || []).length;
        const score = totalSkills > 0 ? Math.round((commonSkills.length / totalSkills) * 100) : 0;

        card.style.display = '';

        // Update ring (CSS conic-gradient percent)
        const ring = document.getElementById('ppScoreRing');
        if (ring) ring.style.background = `conic-gradient(var(--accent) ${score}%, rgba(255,255,255,0.05) ${score}%)`;

        const scoreText = document.getElementById('ppScoreText');
        if (scoreText) scoreText.textContent = `${score}%`;

        const head = document.getElementById('ppMatchHeadline');
        if (head) head.textContent = `${commonSkills.length} skill${commonSkills.length !== 1 ? 's' : ''} in common`;

        const sub = document.getElementById('ppMatchSub');
        if (sub) sub.textContent = score >= 60 ? 'Great match! High compatibility.' : score >= 30 ? 'Decent overlap – good learning partner.' : 'Different strengths – complementary team.';

        const csWrap = document.getElementById('ppCommonSkillsWrap');
        if (csWrap) {
            csWrap.innerHTML = commonSkills.length
                ? commonSkills.map(s => `<span class="pp-skill-tag common">${escHtml(s)}</span>`).join('')
                : '<span style="font-size:0.8rem; color:var(--text-dim)">No overlapping skills</span>';
        }
    }

    function renderXpLevel(xp = 0) {
        const { level, name, xpForThis, xpForNext } = levelFromXp(xp);
        const pct = xpForNext > xpForThis
            ? Math.min(100, Math.round(((xp - xpForThis) / (xpForNext - xpForThis)) * 100))
            : 100;

        const numEl = document.getElementById('ppLevelNum');
        const nameEl = document.getElementById('ppLevelName');
        const xpEl = document.getElementById('ppLevelXp');
        const xpPct = document.getElementById('ppXpPercent');
        const xpFill = document.getElementById('ppXpFill');

        if (numEl) numEl.textContent = level;
        if (nameEl) nameEl.textContent = name;
        if (xpEl) xpEl.textContent = `${xp.toLocaleString()} XP`;
        if (xpPct) xpPct.textContent = `${pct}%`;
        // Animate fill after tiny delay for CSS transition
        setTimeout(() => { if (xpFill) xpFill.style.width = `${pct}%`; }, 200);
    }

    // ── Security helpers ────────────────────────────────────────────────────
    const esc = document.createElement('div');
    function escHtml(s) {
        esc.textContent = String(s || '');
        return esc.innerHTML;
    }
    function escAttr(s) {
        return String(s || '').replace(/"/g, '&quot;');
    }

    // ── Render CTAs ──────────────────────────────────────────────────────────
    function renderCta(user) {
        const cta = document.getElementById('ppCta');
        if (!cta) return;

        if (user.isOwnProfile) {
            cta.innerHTML = `<a href="profile.html" class="pp-btn pp-btn-primary"><i class="fa-solid fa-pen-to-square"></i> Edit Profile</a>`;
            return;
        }

        isFollowingState = user.isFollowing;

        // Message button → opens chat.html with this user pre-selected via ?user= param
        const messageHref = `chat.html?user=${targetUserId}`;

        cta.innerHTML = `
      <button class="pp-btn pp-btn-primary" id="ppFollowBtn">
        ${isFollowingState ? '<i class="fa-solid fa-user-check"></i> Following' : '<i class="fa-solid fa-user-plus"></i> Follow'}
      </button>
      <a href="${messageHref}" class="pp-btn pp-btn-secondary" id="ppMessageBtn">
        <i class="fa-regular fa-comment-dots"></i> Message
      </a>
      <button class="pp-btn pp-btn-secondary" id="ppCollabBtn" title="Invite to collaborate">
        <i class="fa-solid fa-handshake"></i> Collab
      </button>
    `;

        if (isFollowingState) {
            const btn = document.getElementById('ppFollowBtn');
            btn.className = 'pp-btn pp-btn-secondary';
            btn.onmouseenter = () => { btn.innerHTML = '<i class="fa-solid fa-user-minus"></i> Unfollow'; btn.className = 'pp-btn pp-btn-danger'; };
            btn.onmouseleave = () => { btn.innerHTML = '<i class="fa-solid fa-user-check"></i> Following'; btn.className = 'pp-btn pp-btn-secondary'; };
        }

        document.getElementById('ppFollowBtn')?.addEventListener('click', toggleFollow);

        // Collab button – redirects to whiteboard with invite param
        document.getElementById('ppCollabBtn')?.addEventListener('click', () => {
            // Navigate to whiteboard and pass the invitee's userId as a query param
            // The whiteboard/pair-programming page can read ?invite= to auto-send an invite
            window.location.href = `board.html?invite=${targetUserId}`;
        });
    }

    // ── Main render ──────────────────────────────────────────────────────────
    function renderProfile(user) {
        document.title = `${user.name || 'Profile'} | SkillSprint`;

        // Avatar
        const avatar = document.getElementById('ppAvatar');
        if (avatar) avatar.src = user.profile_image || 'assets/images/user-avatar.png';

        // Name + handle
        const nameEl = document.getElementById('ppName');
        if (nameEl) nameEl.textContent = user.name || 'Unknown User';

        const handleEl = document.getElementById('ppHandle');
        if (handleEl) handleEl.textContent = `@${(user.name || 'user').toLowerCase().replace(/\s+/g, '')}`;

        // Role badge
        const roleText = document.getElementById('ppRoleText');
        if (roleText) roleText.textContent = (user.role || 'student').charAt(0).toUpperCase() + (user.role || 'student').slice(1);
        const roleBadge = document.getElementById('ppRoleBadge');
        if (roleBadge) roleBadge.querySelector('i').className = `fa-solid ${roleIcon(user.role)}`;

        // Meta row
        if (user.location) {
            const loc = document.getElementById('ppLocation');
            const locText = document.getElementById('ppLocationText');
            if (loc && locText) { loc.style.display = ''; locText.textContent = user.location; }
        }
        const memberText = document.getElementById('ppMemberSinceText');
        if (memberText) memberText.textContent = `Joined ${fmtDate(user.created_at)}`;

        if (user.designation) {
            const des = document.getElementById('ppDesignation');
            const desText = document.getElementById('ppDesignationText');
            if (des && desText) { des.style.display = ''; desText.textContent = user.designation; }
        }

        // Bio
        if (user.bio) {
            const bio = document.getElementById('ppBio');
            if (bio) { bio.style.display = ''; bio.textContent = user.bio; }
        }

        // Online dot
        setOnlineDot(user.isOnline);

        // CTA buttons
        renderCta(user);

        // Stats
        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmtNum(v); };
        setVal('ppFollowersVal', user.followers_count || (user.followers || []).length);
        setVal('ppFollowingVal', user.following_count || (user.following || []).length);
        setVal('ppPostsVal', (user.recentPosts || []).length >= 5 ? '5+' : (user.recentPosts || []).length);
        setVal('ppXpVal', user.xp || 0);
        document.getElementById('ppXpVal').textContent = fmtNum(user.xp || 0);
        setVal('ppStreakVal', user.streakCount || '–');

        // Verification badges
        setBadge('pvEmail', true); // email always verified on signup
        setBadge('pvGithub', !!user.github);
        setBadge('pvLinkedin', !!user.linkedin);
        setBadge('pvOnboarding', !!user.onboardingCompleted);

        // XP Level
        renderXpLevel(user.xp || 0);

        // Matchmaking
        renderMatchmaking(user);

        // Social links
        renderSocial(user);

        // Skills
        renderSkills(user.skills || [], user.commonSkills || []);

        // Recent posts
        renderRecentPosts(user.recentPosts || []);

        // Achievements
        renderAchievements(user.achievements || []);

        // Projects
        renderProjects(user.projects || []);

        // Education
        renderEducation(user.education || []);
    }

    // ── Fetch & Initialize ───────────────────────────────────────────────────
    async function init() {
        try {
            const res = await fetch(`${USERS_API}/${targetUserId}/public`, { headers: authHdr });
            if (res.status === 401 || res.status === 403) {
                showToastSafe('Session expired. Please log in again.', 'error');
                setTimeout(() => window.location.href = 'login.html', 1200);
                return;
            }
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || `HTTP ${res.status}`);
            }
            const user = await res.json();
            renderProfile(user);
        } catch (err) {
            console.error('[PublicProfile] Fetch error:', err);
            showToastSafe('Could not load profile. ' + err.message, 'error');
        }
    }

    // Start
    document.addEventListener('DOMContentLoaded', () => {
        setupSocket();
        init();
    });

})();

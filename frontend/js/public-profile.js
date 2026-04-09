// frontend/js/public-profile.js

// Renders any user's profile. If it's the owner's own profile (isOwnProfile: true),
// it enables premium editing controls and CRUD features.

(function () {
    'use strict';

    // ── Config ───────────────────────────────────────────────────────────────
    const API_BASE = window.API_BASE_URL;
    const USERS_API = `${API_BASE}/users`;
    const POSTING_API = `${API_BASE}/posting`;
    const LIBRARY_API = `${API_BASE}/library`;

    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.href);
        return;
    }

    const authHdr = { Authorization: `Bearer ${token}` };

    // Parse ?user=<id> from URL
    const urlParams = new URLSearchParams(window.location.search);
    const targetUserId = urlParams.get('user');

    // State
    let currentUser = {}; 
    let isOwner = false;
    let isFollowingState = false;
    let isSaving = false;

    // Robust check for missing or 'undefined' ID in URL
    if (!targetUserId || targetUserId === 'undefined' || targetUserId === 'null') {
        showToastSafe('No user specified. Redirecting to feed...', 'error');
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

    function escHtml(s) {
        const d = document.createElement('div');
        d.textContent = String(s || '');
        return d.innerHTML;
    }
    function escAttr(s) {
        return String(s || '').replace(/"/g, '&quot;');
    }

    // ── Follow / Unfollow ─────────────────────────────────────────────────────
    async function toggleFollow() {
        const followBtn = document.getElementById('ppFollowBtn');
        if (!followBtn) return;

        const originalHtml = followBtn.innerHTML;
        followBtn.disabled = true;
        followBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

        try {
            if (isFollowingState) {
                const res = await fetch(`${POSTING_API}/unfollow/${targetUserId}`, {
                    method: 'DELETE', headers: authHdr
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.message || 'Unfollow failed');
                isFollowingState = false;
                updateFollowBtn();
                const fv = document.getElementById('ppFollowersVal');
                if (fv) fv.textContent = fmtNum(Math.max(0, (parseInt(fv.textContent) || 1) - 1));
                showToastSafe('Unfollowed', 'info');
            } else {
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

    // ── Owner write operations (only called when isOwnProfile === true) ──────
    async function saveField(field, value, refreshWholeUser = false) {
        if (isSaving) return;
        isSaving = true;

        try {
            const fd = new FormData();
            
            if (field === null && typeof value === 'object') {
                // Multi-field update mode
                for (const key in value) {
                    const val = value[key];
                    if (val instanceof File) fd.append(key, val);
                    else if (val !== null && val !== undefined) {
                        fd.append(key, typeof val === 'object' ? JSON.stringify(val) : val);
                    }
                }
            } else {
                // Single field update mode
                if (value instanceof File) fd.append(field, value);
                else fd.append(field, typeof value === 'object' ? JSON.stringify(value) : value);
            }

            const res = await fetch(`${API_BASE}/auth/update-profile`, {
                method: "PUT", headers: authHdr, body: fd
            });
            const data = await res.json();
            if (res.ok) {
                showToastSafe("Saved!", "success");
                // Preserve computed ownership flags (not returned by /auth/update-profile)
                data.user.isOwnProfile = true;
                data.user.isFollowing = false;
                currentUser = data.user;
                
                // Determine what to re-render
                if (refreshWholeUser || field === 'profile_image' || field === 'banner_image' || field === null) {
                    renderProfile(data.user);
                } else {
                    if (field === 'projects') renderProjects(data.user.projects);
                    if (field === 'education') renderEducation(data.user.education);
                    if (field === 'experience') renderExperience(data.user.experience);
                    if (field === 'skills') renderSkills(data.user.skills);
                }
                localStorage.setItem("user", JSON.stringify(data.user));
            } else {
                showToastSafe(data.message || "Failed to save", "error");
            }
        } catch (err) {
            console.error(err);
            showToastSafe("Error saving", "error");
        } finally {
            isSaving = false;
        }
    }

    async function handleLogout() {
        if (typeof showConfirm === 'function') {
            if (await showConfirm("Logout", "Are you sure you want to logout?", "Logout")) {
                performLogout();
            }
        } else if (confirm("Are you sure you want to logout?")) {
            performLogout();
        }
    }

    function performLogout() {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "login.html";
    }

    window.openPpModal = (id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'flex';
    };
    window.closePpModal = (id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    };

    function showOwnerControls() {
        isOwner = true;
        // Hero/Avatar
        const editBanner = document.getElementById('ppEditBannerBtn');
        if (editBanner) editBanner.style.display = 'flex';
        const editAvatar = document.getElementById('ppEditAvatarBtn');
        if (editAvatar) editAvatar.style.display = 'flex';
        
        // Goal
        const goalSection = document.getElementById('ppGoalSection');
        if (goalSection) goalSection.style.display = 'block';
        
        // Preferences
        const prefsCard = document.getElementById('ppPrefsCard');
        if (prefsCard) prefsCard.style.display = 'block';
        
        // Skill Add UI
        const addSkillUI = document.getElementById('ppAddSkillUI');
        if (addSkillUI) addSkillUI.style.display = 'flex';
        
        // Project/Edu/Exp Add Buttons
        const addProjBtn = document.getElementById('ppAddProjectBtn');
        if (addProjBtn) addProjBtn.style.display = 'flex';
        const addEduBtn = document.getElementById('ppAddEduBtn');
        if (addEduBtn) addEduBtn.style.display = 'flex';
        const addExpBtn = document.getElementById('ppAddExpBtn');
        if (addExpBtn) addExpBtn.style.display = 'flex';

        // Re-render lists to show edit buttons
        renderProjects(currentUser.projects, currentUser.collaborativeProjects);
        renderEducation(currentUser.education);
        renderExperience(currentUser.experience);
        renderSkills(currentUser.skills);
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
            wrap.innerHTML = '<div class="pp-empty" style="width:100%"><i class="fa-solid fa-bolt"></i>No skills listed</div>';
            return;
        }
        const commonSet = new Set((commonSkills || []).map(s => s.toLowerCase()));
        wrap.innerHTML = '';
        skills.forEach((s, idx) => {
            const tag = document.createElement('span');
            const isCommon = commonSet.has(s.toLowerCase());
            tag.className = 'pp-skill-tag' + (isCommon ? ' common' : '');
            if (isOwner) {
                tag.innerHTML = `${escHtml(s)} <i class="fa-solid fa-xmark pp-remove-skill" data-index="${idx}" style="cursor:pointer; margin-left:4px; opacity:0.7"></i>`;
            } else {
                tag.textContent = s;
            }
            if (isCommon) tag.title = '✓ You also know this!';
            wrap.appendChild(tag);
        });

        // Bind remove events
        wrap.querySelectorAll('.pp-remove-skill').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const idx = parseInt(e.target.dataset.index);
                const newSkills = [...skills];
                newSkills.splice(idx, 1);
                await saveField('skills', newSkills);
            };
        });
    }

    function renderRecentActivity(posts = [], realAchievements = [], collaborativeProjects = []) {
        const list = document.getElementById('ppRecentList');
        if (!list) return;

        const activities = [];
        posts.forEach(p => activities.push({
            type: 'post',
            content: p.content || '(Media Post)',
            date: new Date(p.createdAt),
            meta: `${p.likesCount || 0} likes`
        }));
        realAchievements.forEach(a => activities.push({
            type: 'achievement',
            content: `Earned ${a.badgeTier || ''} badge: ${a.title}`,
            date: new Date(a.awardedAt),
            meta: 'New Milestone!'
        }));
        collaborativeProjects.forEach(p => activities.push({
            type: 'project',
            content: `Active session: ${p.name}`,
            date: new Date(p.updatedAt),
            meta: p.source === 'whiteboard' ? 'Whiteboard' : 'Pair-Programming'
        }));

        activities.sort((a, b) => b.date - a.date);

        if (!activities.length) {
            list.innerHTML = '<div class="pp-empty">No recent activity detected.</div>';
            return;
        }

        const iconMap = { post: 'fa-rss', achievement: 'fa-medal', project: 'fa-rocket' };
        list.innerHTML = activities.slice(0, 10).map(act => `
        <div class="pp-post-card standout">
            <div style="display:flex; gap:0.8rem;">
                <div style="font-size:1.1rem; color:var(--accent);"><i class="fa-solid ${iconMap[act.type]}"></i></div>
                <div style="flex:1">
                    <div class="pp-post-content" style="font-size:0.85rem; font-weight:500;">${escHtml(act.content)}</div>
                    <div class="pp-post-meta" style="margin-top:0.3rem;">
                        <span><i class="fa-regular fa-clock"></i>${fmtRelTime(act.date)}</span>
                        ${act.meta ? `<span><i class="fa-solid fa-circle-info"></i> ${escHtml(act.meta)}</span>` : ''}
                    </div>
                </div>
            </div>
        </div>
        `).join('');
    }

    function renderAchievements(achievements = [], realAchievements = []) {
        const grid = document.getElementById('ppAchGrid');
        if (!grid) return;
        
        // Prefer real dynamic achievements if they exist
        const items = realAchievements && realAchievements.length ? realAchievements : achievements;
        
        if (!items.length) {
            grid.innerHTML = '<div class="pp-empty" style="width:100%"><i class="fa-solid fa-medal"></i>No achievements yet</div>';
            return;
        }

        const medalMap = { 
            gold: 'fa-trophy', silver: 'fa-medal', bronze: 'fa-award',
            badge: 'fa-certificate', certificate: 'fa-file-contract'
        };

        grid.innerHTML = items.slice(0, 12).map(a => {
            const type = a.achievementType || a.type || 'badge';
            const tier = (a.badgeTier || a.type || 'bronze').toLowerCase();
            const icon = medalMap[tier] || medalMap[type] || 'fa-star';
            
            return `
            <div class="pp-ach-badge ${tier}" title="${escHtml(a.description || a.title)}">
                <i class="fa-solid ${icon}"></i>
                <span>${escHtml(a.title)}</span>
            </div>`;
        }).join('');
    }

    function renderProjects(manualProjects = [], collaborativeProjects = []) {
        const card = document.getElementById('ppProjectsCard');
        const list = document.getElementById('ppProjectsList');
        if (!card || !list) return;
        
        if (!manualProjects.length && !collaborativeProjects.length && !isOwner) {
            card.style.display = 'none';
            return;
        }
        card.style.display = '';
        
        const manItemsHtml = manualProjects.map((p, idx) => `
        <div class="pp-list-item">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div style="flex:1">
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.2rem;">
                        <h4 style="margin:0">${escHtml(p.title || 'Untitled')}</h4>
                        <span class="pp-tech-chip" style="background:var(--pp-card2); color:var(--pp-muted); font-size:0.65rem; border:1px solid var(--pp-border)">Manual</span>
                    </div>
                    ${p.description ? `<p>${escHtml(p.description)}</p>` : ''}
                    ${Array.isArray(p.tech_stack) && p.tech_stack.length ? `<div class="pp-tech-chips">${p.tech_stack.map(t => `<span class="pp-tech-chip">${escHtml(t)}</span>`).join('')}</div>` : ''}
                    ${p.link ? `<a href="${escAttr(p.link)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> View Project</a>` : ''}
                </div>
                ${isOwner ? `
                <div class="pp-item-actions">
                    <button class="pp-action-btn pp-edit-project" data-index="${idx}"><i class="fa-solid fa-pen"></i></button>
                    <button class="pp-action-btn danger pp-delete-project" data-index="${idx}"><i class="fa-solid fa-trash"></i></button>
                </div>
                ` : ''}
            </div>
        </div>`).join('');

        const collabItemsHtml = (collaborativeProjects || []).map(p => {
            const isWb = p.source === "whiteboard";
            const url = isWb ? `board.html?id=${p.id}` : `pair-programming.html?id=${p.id}`;
            const icon = isWb ? 'fa-chalkboard' : 'fa-code-branch';
            const color = isWb ? '#7e57c2' : '#26a69a';
            
            return `
            <div class="pp-list-item standout">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="flex:1">
                        <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.2rem;">
                            <h4 style="margin:0">${escHtml(p.name || 'Collaborative Session')}</h4>
                            <span class="pp-tech-chip" style="background:${color}15; color:${color}; font-size:0.65rem; border:1px solid ${color}30">
                                <i class="fa-solid ${icon}"></i> ${p.source === 'whiteboard' ? 'Whiteboard' : 'Pair-Programming'}
                            </span>
                        </div>
                        <p>${escHtml(p.description || 'Live collaboration session on SkillSprint.')}</p>
                        <a href="${url}" target="_blank" style="color:${color}"><i class="fa-solid fa-arrow-right-to-bracket"></i> Open Session</a>
                    </div>
                </div>
            </div>`;
        }).join('');

        list.innerHTML = (manItemsHtml + collabItemsHtml) || '<div class="pp-empty">No projects added yet.</div>';

        if (isOwner) {
            list.querySelectorAll('.pp-edit-project').forEach(btn => {
                btn.onclick = () => {
                    const idx = btn.dataset.index;
                    const p = manualProjects[idx];
                    const form = document.getElementById('ppProjectForm');
                    form.index.value = idx;
                    form.title.value = p.title || '';
                    form.description.value = p.description || '';
                    form.tech_stack.value = (p.tech_stack || []).join(', ');
                    form.link.value = p.link || '';
                    document.getElementById('ppProjectModalTitle').textContent = 'Edit Project';
                    window.openPpModal('ppProjectModal');
                };
            });
            list.querySelectorAll('.pp-delete-project').forEach(btn => {
                btn.onclick = async () => {
                    if (confirm("Delete this project?")) {
                        const idx = btn.dataset.index;
                        const newProjs = [...manualProjects];
                        newProjs.splice(idx, 1);
                        await saveField('projects', newProjs);
                    }
                };
            });
        }
    }

    function renderExperience(exp = []) {
        const card = document.getElementById('ppExpCard');
        const list = document.getElementById('ppExpList');
        if (!card || !list) return;

        if (!exp.length && !isOwner) {
            card.style.display = 'none';
            return;
        }
        card.style.display = 'block';

        if (!exp.length) {
            list.innerHTML = '<div class="pp-empty">No experience history added.</div>';
            return;
        }

        list.innerHTML = exp.map((e, idx) => `
        <div class="pp-list-item standout">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div style="flex:1">
                    <h4 style="margin:0; font-size:0.95rem;">${escHtml(e.title || 'Untitled Role')}</h4>
                    <div style="font-size:0.82rem; color:var(--pp-muted); margin-top:0.2rem;">${escHtml(e.company || 'Unknown Company')}</div>
                    ${e.description ? `<p style="margin-top:0.5rem; font-size:0.8rem; line-height:1.5;">${escHtml(e.description)}</p>` : ''}
                </div>
                <div style="display:flex; align-items:flex-start; gap:0.6rem; margin-left:1rem;">
                    <div style="text-align:right; min-width:85px;">
                        <div style="font-size:0.75rem; font-weight:700; color:var(--accent);">${e.start_year || ''}${e.end_year ? ` \u2013 ${e.end_year}` : ' \u2013 Present'}</div>
                    </div>
                    ${isOwner ? `
                    <div class="pp-item-actions" style="opacity:0">
                        <button class="pp-action-btn pp-edit-exp" data-index="${idx}"><i class="fa-solid fa-pen"></i></button>
                        <button class="pp-action-btn danger pp-delete-exp" data-index="${idx}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>`).join('');

        if (isOwner) {
            list.querySelectorAll('.pp-edit-exp').forEach(btn => {
                btn.onclick = () => {
                    const idx = btn.dataset.index;
                    const e = exp[idx];
                    const form = document.getElementById('ppExpForm');
                    form.index.value = idx;
                    form.title.value = e.title || '';
                    form.company.value = e.company || '';
                    form.start_year.value = e.start_year || '';
                    form.end_year.value = e.end_year || '';
                    form.description.value = e.description || '';
                    document.getElementById('ppExpModalTitle').textContent = 'Edit Experience';
                    openPpModal('ppExpModal');
                };
            });
            list.querySelectorAll('.pp-delete-exp').forEach(btn => {
                btn.onclick = async () => {
                    if (confirm("Delete this experience entry?")) {
                        const idx = btn.dataset.index;
                        const newExp = [...exp];
                        newExp.splice(idx, 1);
                        await saveField('experience', newExp);
                    }
                };
            });
        }
    }

    function renderCertifications(certs = []) {
        const card = document.getElementById('ppCertsCard');
        const list = document.getElementById('ppCertsList');
        if (!card || !list) return;

        if (!certs.length && !isOwner) {
            card.style.display = 'none';
            return;
        }
        card.style.display = 'block';

        if (!certs.length) {
            list.innerHTML = '<div class="pp-empty">No certifications listed.</div>';
            return;
        }

        list.innerHTML = certs.map(c => `
        <div class="pp-list-item">
            <div style="display:flex; gap:0.9rem; align-items:center;">
                <div style="width:38px; height:38px; border-radius:10px; background:rgba(220,239,98,0.1); display:flex; align-items:center; justify-content:center; color:var(--accent); flex-shrink:0;">
                    <i class="fa-solid fa-award" style="font-size:1.1rem;"></i>
                </div>
                <div style="flex:1">
                    <div style="font-weight:600; font-size:0.9rem;">${escHtml(c.name || 'Certificate')}</div>
                    <div style="font-size:0.75rem; color:var(--pp-muted); text-transform:uppercase; letter-spacing:0.5px;">${escHtml(c.provider || 'University / Institution')}</div>
                </div>
                ${c.link ? `<a href="${escAttr(c.link)}" target="_blank" class="pp-mini-btn" title="View Certificate"><i class="fa-solid fa-external-link"></i></a>` : ''}
            </div>
        </div>`).join('');
    }

    function renderEducation(edu = []) {
        const card = document.getElementById('ppEduCard');
        const list = document.getElementById('ppEduList');
        if (!card || !list) return;

        if (!edu.length && !isOwner) {
            card.style.display = 'none';
            return;
        }
        card.style.display = '';
        if (!edu.length) {
            list.innerHTML = '<div class="pp-empty">No education added yet.</div>';
            return;
        }

        list.innerHTML = edu.map((e, idx) => `
      <div class="pp-list-item">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="flex:1">
                <h4>${escHtml(e.degree || 'Degree')}</h4>
                <p>${escHtml(e.institution || '')}${e.year ? ` · ${escHtml(e.year)}` : ''}${e.grade ? ` · ${escHtml(e.grade)}` : ''}</p>
            </div>
            ${isOwner ? `
            <div class="pp-item-actions">
                <button class="pp-action-btn pp-edit-edu" data-index="${idx}"><i class="fa-solid fa-pen"></i></button>
                <button class="pp-action-btn danger pp-delete-edu" data-index="${idx}"><i class="fa-solid fa-trash"></i></button>
            </div>
            ` : ''}
        </div>
      </div>`).join('');

        if (isOwner) {
            list.querySelectorAll('.pp-edit-edu').forEach(btn => {
                btn.onclick = () => {
                    const idx = btn.dataset.index;
                    const e = edu[idx];
                    const form = document.getElementById('ppEduForm');
                    form.index.value = idx;
                    form.degree.value = e.degree || '';
                    form.institution.value = e.institution || '';
                    form.year.value = e.year || '';
                    form.grade.value = e.grade || '';
                    document.getElementById('ppEduModalTitle').textContent = 'Edit Education';
                    openPpModal('ppEduModal');
                };
            });
            list.querySelectorAll('.pp-delete-edu').forEach(btn => {
                btn.onclick = async () => {
                    if (confirm("Delete this education entry?")) {
                        const idx = btn.dataset.index;
                        const newEdu = [...edu];
                        newEdu.splice(idx, 1);
                        await saveField('education', newEdu);
                    }
                };
            });
        }
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
        if (user.isOwnProfile) {
            card.style.display = 'none';
            return;
        }

        const commonSkills = user.commonSkills || [];
        const totalSkills = (user.skills || []).length;
        const score = totalSkills > 0 ? Math.round((commonSkills.length / totalSkills) * 100) : 0;
        card.style.display = '';

        const ring = document.getElementById('ppScoreRing');
        if (ring) ring.style.background = `conic-gradient(var(--accent) ${score}%, rgba(255,255,255,0.05) ${score}%)`;
        const scoreText = document.getElementById('ppScoreText');
        if (scoreText) scoreText.textContent = `${score}%`;
        const head = document.getElementById('ppMatchHeadline');
        if (head) head.textContent = `${commonSkills.length} skill${commonSkills.length !== 1 ? 's' : ''} in common`;
        const sub = document.getElementById('ppMatchSub');
        if (sub) sub.textContent = score >= 60 ? 'Great match! High compatibility.' : score >= 30 ? 'Decent overlap – good partner.' : 'Different strengths – complementary.';

        const csWrap = document.getElementById('ppCommonSkillsWrap');
        if (csWrap) {
            csWrap.innerHTML = commonSkills.length
                ? commonSkills.map(s => `<span class="pp-skill-tag common">${escHtml(s)}</span>`).join('')
                : '<span style="font-size:0.8rem; color:#888">No direct overlap</span>';
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
        setTimeout(() => { if (xpFill) xpFill.style.width = `${pct}%`; }, 200);
    }

    async function fetchAndRenderPublicLibrary() {
        try {
            const res = await fetch(`${LIBRARY_API}/user/${targetUserId}/public`, { headers: authHdr });
            if (!res.ok) throw new Error('Library fetch error');
            const data = await res.json();
            renderPublicLibrary(data.data || []);
        } catch (err) {
            console.error(err);
            renderPublicLibrary([]);
        }
    }

    function renderPublicLibrary(items = []) {
        const card = document.getElementById('ppLibraryCard');
        const list = document.getElementById('ppLibraryStrip');
        if (!card || !list) return;
        if (!items.length) { card.style.display = 'none'; return; }
        card.style.display = '';
        const maxVisible = 5;
        list.innerHTML = items.slice(0, maxVisible).map(item => {
            const iconClass = item.type === 'Document' ? 'fa-solid fa-file-lines' : item.type === 'Note' ? 'fa-solid fa-note-sticky' : 'fa-solid fa-photo-film';
            const fileUrl = item.file_url ? escAttr(item.file_url) : '#';
            return `
            <div class="pp-lib-card" onclick="window.openLibraryItemViewer('${escAttr(item.title)}', '${escAttr(item.type)}', '${escAttr(item.description || '')}', '${fileUrl}')" style="cursor:pointer">
                <div class="pp-lib-card-top">
                    <div class="pp-lib-icon"><i class="${iconClass}"></i></div>
                    <div class="pp-lib-tag">${escHtml(item.type)}</div>
                </div>
                <div class="pp-lib-title">${escHtml(item.title)}</div>
                <div class="pp-lib-desc">${escHtml(item.description || 'No description')}</div>
                <div class="pp-lib-click">View Resource <i class="fa-solid fa-arrow-right"></i></div>
            </div>`;
        }).join('');

        const seeAll = document.getElementById('ppLibrarySeeAll');
        if (seeAll) {
            seeAll.style.display = items.length > maxVisible ? '' : 'none';
            seeAll.textContent = `See all ${items.length} items →`;
            seeAll.onclick = () => window.location.href = `library.html?user=${targetUserId}&filter=public`;
        }
    }

    // ── Main logic ────────────────────────────────────────────────────────────
    function renderProfile(user) {
        currentUser = user;
        document.title = `${user.name || 'User'} | SkillSprint`;
        
        // Populate owner form
        const editForm = document.getElementById('ppEditForm');
        if (editForm) {
            editForm.name.value = user.name || '';
            editForm.designation.value = user.designation || '';
            editForm.location.value = user.location || '';
            editForm.bio.value = user.bio || '';
            editForm.github.value = user.github || '';
            editForm.linkedin.value = user.linkedin || '';
            editForm.portfolio.value = user.portfolio || '';
            editForm.showSkills.checked = !!user.showSkills;
            editForm.showStreaks.checked = !!user.showStreaks;
        }

        // Primary Goal
        const goalText = document.getElementById('ppGoalText');
        const goalInput = document.getElementById('ppGoalInput');
        if (goalText) goalText.textContent = user.primary_goal || 'Set your primary learning goal...';
        if (goalInput) goalInput.value = user.primary_goal || '';

        // Preferences
        if (user.learning_preferences) {
            const styleRad = document.querySelector(`input[name="pp_learning_style"][value="${user.learning_preferences.style}"]`);
            if (styleRad) styleRad.checked = true;
            const depthRad = document.querySelector(`input[name="pp_explanation_depth"][value="${user.learning_preferences.depth}"]`);
            if (depthRad) depthRad.checked = true;
        }

        // Visuals
        const cover = document.getElementById('ppCover');
        if (cover) {
            if (user.banner_image) {
                cover.style.backgroundImage = `url('${escAttr(user.banner_image)}')`;
                cover.style.backgroundSize = 'cover';
                cover.style.backgroundPosition = 'center';
            } else cover.style.backgroundImage = '';
        }
        const avatar = document.getElementById('ppAvatar');
        if (avatar) avatar.src = user.profile_image || 'assets/images/user-avatar.png';

        // Identity
        const nameEl = document.getElementById('ppName');
        if (nameEl) nameEl.textContent = user.name || 'Unknown User';
        const handleEl = document.getElementById('ppHandle');
        if (handleEl) handleEl.textContent = `@${(user.name || 'user').toLowerCase().replace(/\s+/g, '')}`;
        const roleText = document.getElementById('ppRoleText');
        if (roleText) roleText.textContent = (user.role || 'student').charAt(0).toUpperCase() + (user.role || 'student').slice(1);
        const roleBadge = document.getElementById('ppRoleBadge');
        if (roleBadge) roleBadge.querySelector('i').className = `fa-solid ${roleIcon(user.role)}`;

        const loc = document.getElementById('ppLocation');
        if (user.location) { loc.style.display = ''; document.getElementById('ppLocationText').textContent = user.location; }
        else if (loc) loc.style.display = 'none';

        const memberText = document.getElementById('ppMemberSinceText');
        if (memberText) memberText.textContent = `Joined ${fmtDate(user.created_at)}`;

        const des = document.getElementById('ppDesignation');
        if (user.designation) { des.style.display = ''; document.getElementById('ppDesignationText').textContent = user.designation; }
        else if (des) des.style.display = 'none';

        const bio = document.getElementById('ppBio');
        if (user.bio) { bio.style.display = ''; bio.textContent = user.bio; }
        else if (bio) bio.style.display = 'none';

        // Stats
        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmtNum(v); };
        setVal('ppFollowersVal', user.followers_count || (user.followers || []).length);
        setVal('ppFollowingVal', user.following_count || (user.following || []).length);
        setVal('ppPostsVal', (user.recentPosts || []).length >= 5 ? '5+' : (user.recentPosts || []).length);
        setVal('ppXpVal', user.xp || 0);
        setVal('ppStreakVal', user.streakCount || '–');

        // Render sections
        renderCta(user);
        if (user.isOwnProfile) showOwnerControls();
        
        setBadge('pvEmail', !!user.emailVerified);
        setBadge('pvGithub', !!user.github);
        setBadge('pvLinkedin', !!user.linkedin);
        setBadge('pvOnboarding', !!user.onboardingCompleted);
        
        renderXpLevel(user.xp || 0);
        renderMatchmaking(user);
        renderSocial(user);
        renderSkills(user.skills || [], user.commonSkills || []);
        renderRecentActivity(user.recentPosts || [], user.realAchievements || [], user.collaborativeProjects || []);
        renderAchievements(user.achievements || [], user.realAchievements || []);
        renderProjects(user.projects || [], user.collaborativeProjects || []);
        renderExperience(user.experience || []);
        renderCertifications(user.certifications || []);
        renderEducation(user.education || []);
        fetchAndRenderPublicLibrary();

        setupEventListenersOnce();
    }

    function renderCta(user) {
        const wrap = document.getElementById('ppCta');
        if (!wrap) return;
        wrap.innerHTML = '';

        if (user.isOwnProfile) {
            const editBtn = document.createElement('button');
            editBtn.className = 'pp-btn pp-btn-primary';
            editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Profile';
            editBtn.onclick = () => window.openPpModal('ppEditModal');
            wrap.appendChild(editBtn);

            const logoutBtn = document.createElement('button');
            logoutBtn.className = 'pp-btn pp-btn-secondary';
            logoutBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
            logoutBtn.onclick = () => handleLogout();
            wrap.appendChild(logoutBtn);

            renderNavbarActions(user);
            return;
        }

        isFollowingState = user.isFollowing;
        const messageHref = `chat.html?user=${targetUserId}`;
        wrap.innerHTML = `
      <button class="pp-btn pp-btn-primary" id="ppFollowBtn"></button>
      <a href="${messageHref}" class="pp-btn pp-btn-secondary"><i class="fa-regular fa-comment-dots"></i> Message</a>
      <button class="pp-btn pp-btn-secondary" id="ppCollabBtn"><i class="fa-solid fa-handshake"></i> Collab</button>
    `;
        updateFollowBtn();
        document.getElementById('ppFollowBtn')?.addEventListener('click', toggleFollow);
        document.getElementById('ppCollabBtn')?.addEventListener('click', () => {
            window.location.href = `board.html?invite=${targetUserId}`;
        });

        renderNavbarActions(user);
    }

    function renderNavbarActions(user) {
        // Find navbar action area (injected by navbar-loader.js)
        // We wait a bit to ensure navbar is rendered if it's dynamic
        setTimeout(() => {
            const navRight = document.querySelector('.navbar-right, .nav-right, .nav-actions, #navbar-placeholder nav');
            if (!navRight) return;

            // Remove existing injected actions if any
            const existing = document.getElementById('ppInjectedActions');
            if (existing) existing.remove();

            const wrap = document.createElement('div');
            wrap.id = 'ppInjectedActions';
            wrap.style.cssText = 'display:flex;align-items:center;gap:0.4rem;margin-right:16px;';

            // Share Button (Everyone)
            const shareBtn = document.createElement('button');
            shareBtn.className = 'pp-nav-icon-btn share'; // High contrast white
            shareBtn.title = 'Share Profile';
            shareBtn.innerHTML = '<i class="fa-solid fa-share-nodes"></i>';
            shareBtn.onclick = () => {
                const url = window.location.href;
                if (navigator.share) navigator.share({ title: document.title, url }).catch(()=>{});
                else if (navigator.clipboard) {
                    navigator.clipboard.writeText(url).then(() => showToastSafe('Link copied!', 'success'));
                } else prompt('Copy link:', url);
            };
            wrap.appendChild(shareBtn);

            if (user.isOwnProfile) {
                // Settings Button (Owner)
                const settingsBtn = document.createElement('button');
                settingsBtn.className = 'pp-nav-icon-btn settings'; // Lime accent color
                settingsBtn.title = 'Profile Settings';
                settingsBtn.innerHTML = '<i class="fa-solid fa-gear"></i>';
                settingsBtn.onclick = () => window.openPpModal('ppEditModal');
                wrap.appendChild(settingsBtn);
            } else {
                // Report Button (Visitor)
                const reportBtn = document.createElement('button');
                reportBtn.className = 'pp-nav-icon-btn danger';
                reportBtn.title = 'Report Profile';
                reportBtn.innerHTML = '<i class="fa-solid fa-flag"></i>';
                reportBtn.onclick = () => window.openPpModal('ppReportModal');
                wrap.appendChild(reportBtn);
            }

            navRight.appendChild(wrap);
        }, 350);
    }

    let listenersInitialized = false;
    function setupEventListenersOnce() {
        if (listenersInitialized) return;
        listenersInitialized = true;

        // Identity
        document.getElementById('ppEditForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = {
                name: fd.get('name'), 
                designation: fd.get('designation'), 
                location: fd.get('location'),
                bio: fd.get('bio'), 
                github: fd.get('github'), 
                linkedin: fd.get('linkedin'),
                portfolio: fd.get('portfolio'),
                privacy: {
                    showSkills: fd.get('showSkills') === 'on', 
                    showStreaks: fd.get('showStreaks') === 'on'
                }
            };
            await saveField(null, data, true);
            closePpModal('ppEditModal');
        });

        // Banner
        document.getElementById('ppEditBannerBtn')?.addEventListener('click', () => document.getElementById('ppBannerInput').click());
        document.getElementById('ppBannerInput')?.addEventListener('change', async (e) => {
            if (e.target.files?.[0]) await saveField('banner_image', e.target.files[0]);
        });

        // Avatar (mirrors banner logic)
        document.getElementById('ppEditAvatarBtn')?.addEventListener('click', () => document.getElementById('ppAvatarInput').click());
        document.getElementById('ppAvatarInput')?.addEventListener('change', async (e) => {
            if (e.target.files?.[0]) await saveField('profile_image', e.target.files[0]);
        });

        // Goal
        document.getElementById('ppGoalText')?.addEventListener('click', () => {
            if (!isOwner) return;
            document.getElementById('ppGoalText').style.display = 'none';
            document.getElementById('ppGoalEditArea').style.display = 'block';
            document.getElementById('ppGoalInput').focus();
        });
        document.getElementById('ppCancelGoalBtn')?.addEventListener('click', () => {
            document.getElementById('ppGoalText').style.display = 'block';
            document.getElementById('ppGoalEditArea').style.display = 'none';
        });
        document.getElementById('ppSaveGoalBtn')?.addEventListener('click', async () => {
            const val = document.getElementById('ppGoalInput').value;
            await saveField('primary_goal', val, true);
            document.getElementById('ppGoalText').style.display = 'block';
            document.getElementById('ppGoalEditArea').style.display = 'none';
        });

        // Preferences
        document.querySelectorAll('input[name="pp_learning_style"], input[name="pp_explanation_depth"]').forEach(inp => {
            inp.addEventListener('change', async () => {
                const style = document.querySelector('input[name="pp_learning_style"]:checked')?.value;
                const depth = document.querySelector('input[name="pp_explanation_depth"]:checked')?.value;
                await saveField('learning_preferences', { style, depth });
            });
        });

        // Skills
        document.getElementById('ppAddSkillBtn')?.addEventListener('click', async () => {
            const input = document.getElementById('ppNewSkillInput');
            const val = input.value.trim();
            if (!val) return;
            const newSkills = [...(currentUser.skills || []), val];
            await saveField('skills', newSkills);
            input.value = '';
        });
        document.getElementById('ppNewSkillInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('ppAddSkillBtn').click(); });

        // Projects
        document.getElementById('ppAddProjectBtn')?.addEventListener('click', () => {
            const form = document.getElementById('ppProjectForm');
            form.reset(); form.index.value = -1;
            document.getElementById('ppProjectModalTitle').textContent = 'Add Project';
            openPpModal('ppProjectModal');
        });
        document.getElementById('ppProjectForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const idx = parseInt(fd.get('index'));
            const p = {
                title: fd.get('title'), description: fd.get('description'),
                tech_stack: fd.get('tech_stack').split(',').map(s => s.trim()).filter(Boolean), link: fd.get('link')
            };
            const newProjs = [...(currentUser.projects || [])];
            if (idx === -1) newProjs.push(p); else newProjs[idx] = p;
            await saveField('projects', newProjs);
            closePpModal('ppProjectModal');
        });

        // Education
        document.getElementById('ppAddEduBtn')?.addEventListener('click', () => {
            const form = document.getElementById('ppEduForm');
            form.reset(); form.index.value = -1;
            document.getElementById('ppEduModalTitle').textContent = 'Add Education';
            openPpModal('ppEduModal');
        });
        document.getElementById('ppEduForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const idx = parseInt(fd.get('index'));
            const eduEntry = { degree: fd.get('degree'), institution: fd.get('institution'), year: fd.get('year'), grade: fd.get('grade') };
            const newEdu = [...(currentUser.education || [])];
            if (idx === -1) newEdu.push(eduEntry); else newEdu[idx] = eduEntry;
            await saveField('education', newEdu);
            closePpModal('ppEduModal');
        });

        // Experience
        document.getElementById('ppAddExpBtn')?.addEventListener('click', () => {
            const form = document.getElementById('ppExpForm');
            form.reset(); form.index.value = -1;
            document.getElementById('ppExpModalTitle').textContent = 'Add Experience';
            openPpModal('ppExpModal');
        });
        document.getElementById('ppExpForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const idx = parseInt(fd.get('index'));
            const expEntry = {
                title: fd.get('title'), company: fd.get('company'),
                start_year: fd.get('start_year') ? parseInt(fd.get('start_year')) : null,
                end_year: fd.get('end_year') ? parseInt(fd.get('end_year')) : null,
                description: fd.get('description')
            };
            const newExp = [...(currentUser.experience || [])];
            if (idx === -1) newExp.push(expEntry); else newExp[idx] = expEntry;
            await saveField('experience', newExp);
            closePpModal('ppExpModal');
        });

        // Logout
        document.getElementById('ppLogoutBtn')?.addEventListener('click', handleLogout);

        // Sidebar Report modal logic (already in HTML script block, but we can unify here)
        window.openReportModal = () => openPpModal('ppReportModal');
    }

    async function init() {
        try {
            const res = await fetch(`${USERS_API}/${targetUserId}/public`, { headers: authHdr });
            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem('token'); localStorage.removeItem('user');
                window.location.href = 'login.html'; return;
            }
            if (!res.ok) throw new Error('Profile fetch failed');
            const user = await res.json();
            renderProfile(user);
        } catch (err) {
            console.error(err);
            showToastSafe('Could not load profile', 'error');
        }
    }

    // Modal view for library items
    window.openLibraryItemViewer = (title, type, desc, fileUrl) => {
        const modal = document.getElementById('ppLibViewModal');
        if (!modal) return;
        document.getElementById('ppLibModalTitle').textContent = title;
        document.getElementById('ppLibModalTag').textContent = type;
        document.getElementById('ppLibModalDesc').textContent = desc || 'No description';

        const downBtn = document.getElementById('ppLibModalDownloadBtn');
        if (downBtn) downBtn.href = fileUrl;

        const container = document.getElementById('ppLibPreviewContainer');
        container.innerHTML = '';
        if (type === 'Recording') {
            const video = document.createElement('video');
            video.controls = true;
            video.style.cssText = "width:100%; max-height:400px; border-radius:8px; background:#000;";
            const source = document.createElement('source');
            source.src = fileUrl;
            source.type = "video/mp4";
            video.appendChild(source);
            container.appendChild(video);
            
            // Explicit play handler with AbortError catch
            // Some browsers trigger play() immediately when controls are shown or by user intent
            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    if (error.name === 'AbortError') {
                        console.log('[PublicProfile] Play request was interrupted, ignoring.');
                    } else {
                        console.error('[PublicProfile] Play failed:', error);
                    }
                });
            }
        }
        else if (fileUrl.endsWith('.pdf')) container.innerHTML = `<iframe src="${fileUrl}" style="width:100%; height:400px; border:none; border-radius:8px;"></iframe>`;
        else if (fileUrl.match(/\.(jpeg|jpg|png|gif|webp)$/i)) container.innerHTML = `<img src="${fileUrl}" style="max-width:100%; max-height:400px; object-fit:contain; border-radius:8px;" />`;
        else container.innerHTML = `<div class="pp-empty"><i class="fa-solid fa-file-arrow-down"></i>No preview available</div>`;

        modal.style.display = 'flex';
    };

    document.addEventListener('DOMContentLoaded', () => {
        setupSocket();
        init();
    });

})();

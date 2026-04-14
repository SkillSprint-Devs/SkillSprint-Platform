const token = localStorage.getItem("token");
if (!token) {
    window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
}
const API_BASE = window.API_BASE_URL;

// Global State
const SOCKET_URL = window.API_SOCKET_URL;
const socket = io(SOCKET_URL, { auth: { token } });

let localStream;
let peerConnections = {}; // peerId -> RTCPeerConnection
let signalingStates = {}; // peerId -> { makingOffer, ignoreOffer, isSettingRemoteAnswerPending, candidates: [] }
let grantedPermissions = { mic: false, cam: false, whiteboard: false };
let roomPermissions = {}; // All users (for mentor)
let sessionId = new URLSearchParams(window.location.search).get("sessionId");
let currentTool = 'pen';
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let canvas, ctx;

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function linkify(text) {
    const urlPattern = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlPattern, '<a href="$1" target="_blank">$1</a>');
}

const iceConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

document.addEventListener("DOMContentLoaded", async () => {
    if (!sessionId) {
        alert("Session ID missing!");
        window.location.href = "dashboard.html";
        return;
    }

    setupCanvas();
    await initMedia();
    joinSession();
    setupEventListeners();
});

async function initMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById("localVideo").srcObject = localStream;
    } catch (err) {
        console.error("Media error:", err);
        if (typeof showToast === 'function') showToast("Could not access camera/mic. Joining as observer.", "warning");
        const canvas = document.createElement("canvas");
        localStream = canvas.captureStream();
    }
}

function joinSession() {
    // 1. Setup ALL Listeners BEFORE Emitting
    socket.on("live:error", (msg) => {
        if (typeof showToast === 'function') showToast(msg, "error");
        setTimeout(() => window.location.href = "dashboard.html", 3000);
    });

    socket.on("live:init", async (data) => {
        document.getElementById("sessionName").textContent = data.sessionName || "Live Session";
        document.getElementById("sessionStatus").textContent = data.status;

        window.isMentor = data.isMentor;
        console.log("[LIVE] Session Init. Is Mentor:", window.isMentor);

        // UI Adjustments
        if (window.isMentor) {
            if (data.status === 'scheduled') document.getElementById("startSessionBtn").style.display = "block";
            document.querySelector(".video-wrapper.local .participant-name").textContent = "You (Mentor)";
        } else {
            document.getElementById("startSessionBtn").style.display = "none";
            document.getElementById("toggleWhiteboard").style.display = "none";
            document.querySelector(".video-wrapper.local .participant-name").textContent = "You (Learner)";
        }

        updateParticipants(data.participants);
        if (data.whiteboard) data.whiteboard.forEach(draw => drawOnCanvas(draw));

        // Restore Permissions
        if (data.grantedPermissions) {
            grantedPermissions = data.grantedPermissions;
            Object.entries(grantedPermissions).forEach(([type, granted]) => {
                updateLocalPermissions(type, granted, true);
            });
        }
        if (data.allPermissions) {
            roomPermissions = data.allPermissions;
        }

        if (data.status === 'live') startTimer(data.sessionStartedAt);

        // INITIALIZE MESH: Connect to everyone already in the room
        data.participants.forEach(p => {
            if (p.id !== getMyId() && p.status === "Joined") {
                console.log("[WEBRTC] Initiating connection to existing participant:", p.name);
                initiatePeerConnection(p.id);
            }
        });

        // Init Navbar
        if (typeof window.initNavbar === 'function') {
            window.initNavbar({
                activePage: 'Live Session',
                showInviteBtn: window.isMentor,
                showSearch: false,
                showSettingsBtn: false,
                showNotifications: false,
                showProfileBtn: false,
                onInviteClick: () => window.handleInviteClick?.(),
                primaryAction: {
                    show: true,
                    label: 'End Session',
                    onClick: () => window.handleEndSession?.()
                }
            });
        }
    });

    socket.on("live:chat", appendChatMessage);
    socket.on("live:whiteboard", drawOnCanvas);
    socket.on("live:whiteboardClear", () => ctx.clearRect(0, 0, canvas.width, canvas.height));

    socket.on("live:statusChanged", (status) => {
        document.getElementById("sessionStatus").textContent = status;
        if (status === 'live') {
            document.getElementById("startSessionBtn").style.display = "none";
            startTimer(new Date());
        } else if (status === 'ended' || status === 'completed') {
            if (typeof showToast === 'function') showToast("Session ended", "info");
            setTimeout(() => window.location.href = "dashboard.html", 2000);
        }
    });

    socket.on("live:presence", updateParticipants);
    socket.on("live:permissionsUpdated", ({ type, granted }) => {
        updateLocalPermissions(type, granted);
    });
    socket.on("live:roomPermissions", (allPerms) => {
        roomPermissions = allPerms;
        updateParticipants(window.lastParticipants);
    });
    socket.on("live:permissionRequest", ({ userId, type }) => {
        if (window.isMentor) handlePermissionRequest(userId, type);
    });

    socket.on("live:peerJoined", ({ userId }) => {
        if (userId !== getMyId()) {
            console.log("[WEBRTC] Peer joined, initiating connection:", userId);
            initiatePeerConnection(userId);
        }
    });

    socket.on("live:signal", async ({ fromUserId, signal }) => {
        try {
            let pc = peerConnections[fromUserId];
            if (!pc) pc = await createPeerConnection(fromUserId, false);

            const state = signalingStates[fromUserId];
            const description = signal.sdp;

            if (description) {
                // Perfect Negotiation: Check for glare
                const offerCollision = (description.type === "offer") &&
                    (state.makingOffer || pc.signalingState !== "stable");

                state.ignoreOffer = !window.isMentor && offerCollision; // Mentees are polite
                if (state.ignoreOffer) {
                    console.warn("[WEBRTC] Glare detected, ignoring offer (polite).");
                    return;
                }

                await pc.setRemoteDescription(description);
                if (description.type === "offer") {
                    await pc.setLocalDescription(await pc.createAnswer());
                    socket.emit("live:signal", { sessionId, targetUserId: fromUserId, signal: { sdp: pc.localDescription } });
                }

                // Flush queued candidates
                while (state.candidates.length) {
                    await pc.addIceCandidate(state.candidates.shift());
                }
            } else if (signal.candidate) {
                try {
                    if (pc.remoteDescription) {
                        await pc.addIceCandidate(signal.candidate);
                    } else {
                        state.candidates.push(signal.candidate);
                    }
                } catch (err) {
                    if (!state.ignoreOffer) throw err;
                }
            }
        } catch (err) {
            console.error("[WEBRTC] Signaling error:", err);
        }
    });

    // 2. NOW Join
    socket.emit("live:join", { sessionId });
}

async function initiatePeerConnection(peerId) {
    if (peerConnections[peerId]) return;
    await createPeerConnection(peerId, true);
}

async function createPeerConnection(peerId, isOffer) {
    const pc = new RTCPeerConnection(iceConfig);
    peerConnections[peerId] = pc;
    signalingStates[peerId] = { makingOffer: false, ignoreOffer: false, isSettingRemoteAnswerPending: false, candidates: [] };

    if (localStream) {
        localStream.getTracks().forEach(track => {
            // Mentees only add tracks if permitted
            if (window.isMentor) {
                pc.addTrack(track, localStream);
            } else {
                if (track.kind === 'audio' && grantedPermissions.mic) pc.addTrack(track, localStream);
                if (track.kind === 'video' && grantedPermissions.cam) pc.addTrack(track, localStream);
            }
        });
    }

    pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit("live:signal", { sessionId, targetUserId: peerId, signal: { candidate } });
    };

    pc.onnegotiationneeded = async () => {
        try {
            if (pc.signalingState !== 'stable') return;
            const state = signalingStates[peerId];
            state.makingOffer = true;
            await pc.setLocalDescription();
            socket.emit("live:signal", { sessionId, targetUserId: peerId, signal: { sdp: pc.localDescription } });
        } catch (err) {
            console.error("[WEBRTC] Negotiation error:", err);
        } finally {
            signalingStates[peerId].makingOffer = false;
        }
    };

    pc.ontrack = ({ track, streams }) => {
        console.log("[WEBRTC] Track received:", track.kind, "from", peerId);
        let video = document.getElementById(`video-${peerId}`);
        if (!video) {
            const wrapper = document.createElement("div");
            wrapper.className = "video-wrapper";
            wrapper.id = `wrapper-${peerId}`;
            video = document.createElement("video");
            video.id = `video-${peerId}`;
            video.autoplay = true;
            video.playsinline = true;
            const nameEl = document.createElement("span");
            nameEl.className = "participant-name";
            nameEl.id = `name-${peerId}`;
            nameEl.textContent = window.lastParticipants?.find(p => p.id === peerId)?.name || "Participant";
            wrapper.appendChild(video);
            wrapper.appendChild(nameEl);
            document.getElementById("videoGrid").appendChild(wrapper);
        }
        video.srcObject = streams[0] || new MediaStream([track]);
    };

    pc.oniceconnectionstatechange = () => {
        if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
            document.getElementById(`wrapper-${peerId}`)?.remove();
            delete peerConnections[peerId];
            delete signalingStates[peerId];
        }
    };

    if (isOffer) {
        // Initial offer will be triggered by onnegotiationneeded or manually
    }

    return pc;
}

// UI & Logic Helpers (Unchanged essentially but kept for consistency)
function setupCanvas() {
    canvas = document.getElementById("whiteboardCanvas");
    ctx = canvas.getContext("2d");
    const resize = () => {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    };
    window.addEventListener("resize", resize);
    window.triggerWhiteboardResize = resize;
    resize();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    canvas.addEventListener('mousedown', (e) => {
        if (!window.isMentor) return;
        isDrawing = true;
        [lastX, lastY] = getCoords(e);
    });
    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing || !window.isMentor) return;
        const [currX, currY] = getCoords(e);
        const drawData = {
            x0: lastX, y0: lastY, x1: currX, y1: currY,
            color: currentTool === 'eraser' ? '#ffffff' : document.getElementById("whiteboardColor").value,
            width: currentTool === 'eraser' ? 20 : 2
        };
        drawOnCanvas(drawData);
        socket.emit("live:whiteboard", { sessionId, draw: drawData });
        [lastX, lastY] = [currX, currY];
    });
    canvas.addEventListener('mouseup', () => isDrawing = false);
    canvas.addEventListener('mouseout', () => isDrawing = false);
}

function getCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
}

function drawOnCanvas(draw) {
    if (!ctx) return;
    const container = document.getElementById("whiteboardContainer");
    if (container && container.style.display === "none") {
        container.style.display = "block";
        document.getElementById("toggleWhiteboard")?.classList.add("active");
        window.triggerWhiteboardResize?.();
    }
    const { x0, y0, x1, y1, color, width } = draw;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = color || '#000000';
    ctx.lineWidth = width || 2;
    ctx.stroke();
    ctx.closePath();
}

function setupEventListeners() {
    document.getElementById("sendChatBtn").addEventListener("click", sendChat);
    document.getElementById("chatInput").addEventListener("keypress", (e) => e.key === 'Enter' && sendChat());

    document.getElementById("toggleMic").addEventListener("click", function () {
        if (!window.isMentor && !grantedPermissions.mic) {
            socket.emit("live:requestPermission", { sessionId, type: 'mic' });
            if (typeof showToast === 'function') showToast("Requesting mic access...", "info");
            return;
        }
        const track = localStream.getAudioTracks()[0];
        if (track) { track.enabled = !track.enabled; this.classList.toggle("off", !track.enabled); }
    });

    document.getElementById("toggleCam").addEventListener("click", function () {
        if (!window.isMentor && !grantedPermissions.cam) {
            socket.emit("live:requestPermission", { sessionId, type: 'cam' });
            if (typeof showToast === 'function') showToast("Requesting camera access...", "info");
            return;
        }
        const track = localStream.getVideoTracks()[0];
        if (track) { track.enabled = !track.enabled; this.classList.toggle("off", !track.enabled); }
    });

    document.getElementById("toggleWhiteboard").addEventListener("click", () => {
        const container = document.getElementById("whiteboardContainer");
        const visible = container.style.display === "none";
        container.style.display = visible ? "block" : "none";
        document.getElementById("toggleWhiteboard").classList.toggle("active", visible);
        if (visible) window.triggerWhiteboardResize?.();
        if (window.isMentor) socket.emit("live:whiteboardToggle", { sessionId, visible });
    });

    const startBtn = document.getElementById("startSessionBtn");
    if (startBtn) startBtn.addEventListener("click", () => socket.emit("live:startSession", { sessionId }));

    const endBtn = document.getElementById("endSessionBtn");
    if (endBtn) endBtn.addEventListener("click", () => triggerEndSession());

    document.querySelectorAll(".whiteboard-tools .tool").forEach(btn => {
        btn.addEventListener("click", function () {
            if (!window.isMentor) return;
            document.querySelectorAll(".whiteboard-tools .tool").forEach(b => b.classList.remove("active"));
            this.classList.add("active");
            currentTool = this.dataset.tool;
        });
    });
}

function sendChat() {
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (text) { socket.emit("live:chat", { sessionId, message: text }); input.value = ""; }
}

function appendChatMessage({ user, message }) {
    const container = document.getElementById("chatMessages");
    const isSelf = user.id === getMyId();
    const div = document.createElement("div");
    div.className = `message ${isSelf ? 'self' : 'other'}`;
    div.innerHTML = `<strong>${isSelf ? 'You' : user.name}</strong><br>${linkify(escapeHtml(message))}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function updateParticipants(participants) {
    if (!participants) return;
    window.lastParticipants = participants;

    // 1. Update Navbar avatars (Global status)
    const navContainer = document.getElementById("nav-participants");
    if (navContainer) {
        navContainer.innerHTML = "";
        participants.forEach(p => {
            const wrap = document.createElement("div");
            wrap.className = "nav-avatar-wrapper";
            wrap.innerHTML = `<img src="${p.profile_image || 'assets/images/user-avatar.png'}" class="nav-p-avatar ${p.role.toLowerCase()}${p.status === 'Absent' ? ' offline' : ''}" title="${p.name}"><span class="nav-status-dot ${p.status.toLowerCase()}"></span>`;
            navContainer.appendChild(wrap);
            const nameEl = document.getElementById(`name-${p.id}`);
            if (nameEl) nameEl.textContent = p.name;
        });
    }

    // 2. Update Side Panel (Detailed info & Mentor controls)
    const listContainer = document.getElementById("participantsList");
    if (listContainer) {
        listContainer.innerHTML = "";
        participants.forEach(p => {
            const isSelf = p.id === getMyId();
            const perms = roomPermissions[p.id] || { mic: false, cam: false, whiteboard: false };

            const item = document.createElement("div");
            item.className = `participant-item ${p.status.toLowerCase()}`;
            item.innerHTML = `
                <div class="p-info">
                    <img src="${p.profile_image || 'assets/images/user-avatar.png'}" class="p-avatar">
                    <div class="p-meta">
                        <span class="p-name">${p.name} ${isSelf ? '(You)' : ''}</span>
                        <span class="p-role">${p.role}</span>
                    </div>
                </div>
                ${window.isMentor && !isSelf ? `
                <div class="p-controls">
                    <button onclick="toggleUserPermission('${p.id}', 'mic')" class="perm-btn ${perms.mic ? 'on' : 'off'}" title="Mic">
                        <i class="fa-solid fa-microphone${perms.mic ? '' : '-slash'}"></i>
                    </button>
                    <button onclick="toggleUserPermission('${p.id}', 'cam')" class="perm-btn ${perms.cam ? 'on' : 'off'}" title="Camera">
                        <i class="fa-solid fa-video${perms.cam ? '' : '-slash'}"></i>
                    </button>
                    <button onclick="toggleUserPermission('${p.id}', 'whiteboard')" class="perm-btn ${perms.whiteboard ? 'on' : 'off'}" title="Whiteboard">
                        <i class="fa-solid fa-chalkboard"></i>
                    </button>
                </div>
                ` : ''}
            `;
            listContainer.appendChild(item);
        });
    }
}

window.toggleUserPermission = (targetUserId, type) => {
    const current = (roomPermissions[targetUserId] && roomPermissions[targetUserId][type]) || false;
    socket.emit("live:togglePermission", { sessionId, targetUserId, type, granted: !current });
};

async function handlePermissionRequest(userId, type) {
    const user = window.lastParticipants?.find(p => p.id === userId);
    if (!user) return;
    const confirmed = await showConfirm("Permission Request", `${user.name} wants to use ${type}. Grant access?`, "Grant", false);
    if (confirmed) {
        socket.emit("live:togglePermission", { sessionId, targetUserId: userId, type, granted: true });
    }
}

async function ensureMediaTracks(type) {
    let track = type === 'mic' ? localStream.getAudioTracks()[0] : localStream.getVideoTracks()[0];
    if (!track || track.readyState === 'ended' || track.label.toLowerCase().includes("canvas")) {
        try {
            const fresh = await navigator.mediaDevices.getUserMedia({ audio: type === 'mic', video: type === 'cam' });
            const freshTrack = type === 'mic' ? fresh.getAudioTracks()[0] : fresh.getVideoTracks()[0];
            localStream.addTrack(freshTrack);
            document.getElementById("localVideo").srcObject = localStream;
            return freshTrack;
        } catch (e) { console.error(e); return null; }
    }
    return track;
}

async function updateLocalPermissions(type, granted, silent = false) {
    const prev = grantedPermissions[type];
    grantedPermissions[type] = granted;

    if (!silent) {
        showToast(`Mentor ${granted ? 'granted' : 'revoked'} ${type} access`, granted ? "success" : "warning");
    }

    if (type === 'mic' || type === 'cam') {
        const track = type === 'mic' ? localStream.getAudioTracks()[0] : localStream.getVideoTracks()[0];
        if (track) {
            if (!granted) {
                track.enabled = false;
                document.getElementById(type === 'mic' ? "toggleMic" : "toggleCam")?.classList.add("off");
            } else {
                // If it was newly granted, we might need to add it to existing peer connections
                if (!prev && granted) {
                    const freshTrack = await ensureMediaTracks(type);
                    if (freshTrack) {
                        freshTrack.enabled = true;
                        document.getElementById(type === 'mic' ? "toggleMic" : "toggleCam")?.classList.remove("off");
                        Object.values(peerConnections).forEach(pc => {
                            const senders = pc.getSenders();
                            if (!senders.find(s => s.track === freshTrack)) {
                                pc.addTrack(freshTrack, localStream);
                            }
                        });
                    }
                }
            }
        }
    } else if (type === 'whiteboard' && !window.isMentor) {
        document.getElementById("toggleWhiteboard").style.display = granted ? "block" : "none";
        if (!granted) {
            document.getElementById("whiteboardContainer").style.display = "none";
            document.getElementById("toggleWhiteboard").classList.remove("active");
        }
    }
}

function getMyId() { return JSON.parse(localStorage.getItem("user") || "{}").id || JSON.parse(localStorage.getItem("user") || "{}")._id; }

let timerInterval;
function startTimer(startedAt) {
    let secs = startedAt ? Math.floor((new Date() - new Date(startedAt)) / 1000) : 0;
    const el = document.getElementById("sessionTimer");
    if (!el) return;
    clearInterval(timerInterval);
    const update = () => {
        const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
        el.textContent = `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };
    update();
    timerInterval = setInterval(() => { secs++; update(); }, 1000);
}

window.handleEndSession = () => triggerEndSession();
window.handleInviteClick = () => { document.getElementById("inviteModal").classList.add("active"); document.getElementById("inviteUserList").innerHTML = ""; };

async function triggerEndSession() {
    if (await showConfirm("End Session?", "Deduct credits and close room?", "End Session", true)) {
        await fetch(`${API_BASE}/live-sessions/end-session`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ sessionId })
        });
    }
}

// Invite logic truncated for brevity as sync was the focus, but it should be standard
function initInviteModal() {
    const modal = document.getElementById("inviteModal");
    const closeBtn = document.querySelector(".btn-close-invite");
    const search = document.getElementById("inviteSearch");
    const sendBtn = document.getElementById("sendInviteBtn");

    if (closeBtn) closeBtn.onclick = () => modal.classList.remove("active");

    if (!search) return;
    search.oninput = async (e) => {
        const query = e.target.value;
        if (query.length < 2) return;
        try {
            const res = await fetch(`${API_BASE}/users/search?query=${query}`, { headers: { Authorization: `Bearer ${token}` } });
            const users = await res.json();
            document.getElementById("inviteUserList").innerHTML = users.map(u =>
                `<div onclick="window.selectInvitee('${u._id}', this)" class="user-item">
                    <span>${u.name}</span>
                    <span class="user-email" style="font-size: 0.7rem; opacity: 0.6;">${u.email}</span>
                </div>`
            ).join('');
        } catch (err) { console.error("Search error:", err); }
    };

    if (sendBtn) {
        sendBtn.onclick = async () => {
            try {
                const res = await fetch(`${API_BASE}/live-sessions/invite`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ sessionId, userId: window.selectedId })
                });
                if (res.ok) {
                    if (typeof showToast === 'function') showToast("Invite sent!", "success");
                    modal.classList.remove("active");
                }
            } catch (err) { console.error("Invite error:", err); }
        };
    }
}

window.selectInvitee = (id, el) => {
    window.selectedId = id;
    document.querySelectorAll(".user-item").forEach(item => item.classList.remove("selected"));
    el.classList.add("selected");
    document.getElementById("sendInviteBtn").disabled = false;
};
initInviteModal();

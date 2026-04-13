const token = localStorage.getItem("token");
if (!token) {
    window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
}
const API_BASE = window.API_BASE_URL;
// Global State
let currentChatUserId = null;
let debounceTimer;
const SOCKET_URL = window.API_SOCKET_URL;
let makingOffer = false;

const socket = io(SOCKET_URL, {
    auth: { token }
});
let localStream;
let peerConnections = {};
let grantedPermissions = { mic: false, cam: false, whiteboard: false };
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
    return text.replace(urlPattern, '<a href="$1" target="_blank" style="color: #DCEF62; text-decoration: underline;">$1</a>');
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
        if (typeof showToast === 'function') showToast("Could not access camera/mic. You can still join as observer.", "warning");
        // Create dummy stream to avoid crashes
        const canvas = document.createElement("canvas");
        localStream = canvas.captureStream();
    }
}

function joinSession() {
    const token = localStorage.getItem("token");

    socket.emit("live:join", { sessionId, token });

    socket.on("live:error", (msg) => {
        if (typeof showToast === 'function') showToast(msg, "error");
        setTimeout(() => window.location.href = "dashboard.html", 3000);
    });

    socket.on("live:init", (data) => {
        document.getElementById("sessionName").textContent = data.sessionName || "Live Session";
        document.getElementById("sessionStatus").textContent = data.status;

        const isMentor = data.isMentor;
        window.isMentor = isMentor; // Global for checks
        console.log("[LIVE] Session Init. Is Mentor:", isMentor, "Session ID:", sessionId);

        if (isMentor) {
            if (data.status === 'scheduled') {
                const startBtn = document.getElementById("startSessionBtn");
                if (startBtn) startBtn.style.display = "block";
            }
            // endSessionBtn is now in the top navbar, handled by initNavbar
            document.querySelector(".video-wrapper.local .participant-name").textContent = "You (Mentor)";
            const pName = document.querySelector(".video-wrapper.local .participant-name");
            pName.style.cursor = 'pointer';
            pName.onclick = () => { if (window.goToMyPublicProfile) window.goToMyPublicProfile(); };
        } else {
            // Mentee UI Restrictions
            const startBtn = document.getElementById("startSessionBtn");
            if (startBtn) startBtn.style.display = "none";

            const toggleWb = document.getElementById("toggleWhiteboard");
            if (toggleWb) toggleWb.style.display = "none"; // Mentee can't open it

            document.querySelector(".video-wrapper.local .participant-name").textContent = "You (Learner)";
            const pName = document.querySelector(".video-wrapper.local .participant-name");
            pName.style.cursor = 'pointer';
            pName.onclick = () => { if (window.goToMyPublicProfile) window.goToMyPublicProfile(); };

            // Note: If mentor opens whiteboard, mentee should see it. 
            // We'll handle sync below.
        }

        updateParticipants(data.participants);
        if (data.whiteboard && data.whiteboard.length > 0) {
            data.whiteboard.forEach(draw => drawOnCanvas(draw));
        }

        // Sync local permissions
        if (data.grantedPermissions) {
            console.log("[LIVE] Restoring permissions:", data.grantedPermissions);
            Object.entries(data.grantedPermissions).forEach(([type, granted]) => {
                if (granted) handlePermissionGranted(type, true, true); // silent sync
            });
        }

        if (data.status === 'live') startTimer(data.sessionStartedAt);

        // Re-initialize navbar to show Invite button if Mentor
        if (typeof window.initNavbar === 'function') {
            window.initNavbar({
                activePage: 'Live Session',
                contextIcon: 'fa-video',
                backUrl: 'dashboard.html',
                showSearch: false,
                showSettingsBtn: false,
                showNotifications: false,
                showInviteBtn: window.isMentor,
                onInviteClick: () => {
                    if (window.handleInviteClick) window.handleInviteClick();
                },
                primaryAction: {
                    show: true,
                    label: 'End Session',
                    icon: 'fa-phone-slash',
                    onClick: () => {
                        if (window.handleEndSession) window.handleEndSession();
                    }
                }
            });
        }
    });

    socket.on("live:chat", (msg) => {
        appendChatMessage(msg);
    });

    socket.on("live:whiteboard", (draw) => {
        drawOnCanvas(draw);
    });

    socket.on("live:whiteboardClear", () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    socket.on("live:statusChanged", (status) => {
        console.log("[RUNTIME-DEBUG] Socket Event: live:statusChanged ->", status);
        document.getElementById("sessionStatus").textContent = status;
        if (status === 'live') {
            const startBtn = document.getElementById("startSessionBtn");
            if (startBtn) startBtn.style.display = "none";
            startTimer(new Date());
        } else if (status === 'ended' || status === 'completed') {
            console.log("[LIVE] Session ended status received via socket");
            if (typeof showToast === 'function') showToast("Session ended by Mentor", "info");
            // Give user time to see toast before redirect
            setTimeout(() => {
                if (window.location.pathname.includes("livevideo.html")) {
                    window.location.href = "dashboard.html";
                }
            }, 2000);
        }
    });

    socket.on("live:presence", (participants) => {
        updateParticipants(participants);
    });

    socket.on("live:peerJoined", ({ userId }) => {
        console.log("[LIVE] New peer joined:", userId);
        if (userId !== getMyId()) {
            initiatePeerConnection(userId);
        }
    });

    socket.on("live:whiteboardToggle", ({ visible }) => {
        const container = document.getElementById("whiteboardContainer");
        if (container) {
            container.style.display = visible ? "block" : "none";
            document.getElementById("toggleWhiteboard")?.classList.toggle("active", visible);
            if (visible && typeof window.triggerWhiteboardResize === 'function') {
                window.triggerWhiteboardResize();
            }
        }
    });

    socket.on("live:permissionRequest", ({ userId, type }) => {
        if (!window.isMentor) return;
        handlePermissionRequest(userId, type);
    });

    socket.on("live:permissionGranted", ({ type, granted }) => {
        handlePermissionGranted(type, granted);
    });

    socket.on("live:signal", async ({ fromUserId, signal }) => {
        try {
            let pc = peerConnections[fromUserId];
            if (!pc) {
                pc = await createPeerConnection(fromUserId, false);
            }

            if (signal.sdp) {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                if (signal.type === "offer") {
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    socket.emit("live:signal", { sessionId, targetUserId: fromUserId, signal: { sdp: pc.localDescription, type: "answer" } });
                }
            } else if (signal.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
        } catch (err) {
            console.error("Signal handling error:", err);
        }
    });
}

async function initiatePeerConnection(peerId) {
    if (peerConnections[peerId]) return;
    await createPeerConnection(peerId, true);
}

async function createPeerConnection(peerId, isOffer) {
    const pc = new RTCPeerConnection(iceConfig);
    peerConnections[peerId] = pc;

    // IMPORTANT: Add tracks in a deterministic order (Audio then Video) to avoid m-line mismatch
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        const videoTrack = localStream.getVideoTracks()[0];

        if (window.isMentor) {
            if (audioTrack) pc.addTrack(audioTrack, localStream);
            if (videoTrack) pc.addTrack(videoTrack, localStream);
        } else {
            if (audioTrack && grantedPermissions.mic) pc.addTrack(audioTrack, localStream);
            if (videoTrack && grantedPermissions.cam) pc.addTrack(videoTrack, localStream);
        }
    }

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("live:signal", { sessionId, targetUserId: peerId, signal: { candidate: event.candidate } });
        }
    };

    pc.onnegotiationneeded = async () => {
        try {
            if (makingOffer || pc.signalingState !== 'stable') return;
            makingOffer = true;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("live:signal", { sessionId, targetUserId: peerId, signal: { sdp: pc.localDescription, type: "offer" } });
        } catch (err) {
            console.error("Negotiation error:", err);
        } finally {
            makingOffer = false;
        }
    };

    pc.ontrack = (event) => {
        console.log("[WEBRTC] Track received from", peerId, event.streams);
        let remoteVid = document.getElementById(`video-${peerId}`);
        if (!remoteVid) {
            const wrapper = document.createElement("div");
            wrapper.className = "video-wrapper";
            wrapper.id = `wrapper-${peerId}`;
            remoteVid = document.createElement("video");
            remoteVid.id = `video-${peerId}`;
            remoteVid.autoplay = true;
            remoteVid.playsinline = true;

            const nameSpan = document.createElement("span");
            nameSpan.className = "participant-name";
            nameSpan.id = `name-${peerId}`;
            nameSpan.textContent = "Remote User"; // Will be updated by presence

            wrapper.appendChild(remoteVid);
            wrapper.appendChild(nameSpan);
            document.getElementById("videoGrid").appendChild(wrapper);

            // Sync name if we already have it in presence
            const p = window.lastParticipants?.find(part => part.id === peerId);
            if (p) nameSpan.textContent = p.name;
        }
        remoteVid.srcObject = event.streams[0];
    };

    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
            const wrapper = document.getElementById(`wrapper-${peerId}`);
            if (wrapper) wrapper.remove();
            delete peerConnections[peerId];
        }
    };

    if (isOffer) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("live:signal", { sessionId, targetUserId: peerId, signal: { sdp: pc.localDescription, type: "offer" } });
    }

    return pc;
}

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
        console.log("[WHITEBOARD] Mousedown at", getCoords(e));
        isDrawing = true;
        [lastX, lastY] = getCoords(e);
    });

    canvas.addEventListener('touchstart', (e) => {
        if (!window.isMentor) return;
        e.preventDefault();
        const touch = e.touches[0];
        isDrawing = true;
        [lastX, lastY] = getCoords(touch);
    }, { passive: false });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing || !window.isMentor) return;
        const [currX, currY] = getCoords(e);
        const drawData = {
            x0: lastX, y0: lastY,
            x1: currX, y1: currY,
            color: currentTool === 'eraser' ? '#ffffff' : document.getElementById("whiteboardColor").value,
            width: currentTool === 'eraser' ? 20 : 2
        };
        drawOnCanvas(drawData);
        socket.emit("live:whiteboard", { sessionId, draw: drawData });
        [lastX, lastY] = [currX, currY];
    });

    canvas.addEventListener('touchmove', (e) => {
        if (!isDrawing || !window.isMentor) return;
        e.preventDefault();
        const touch = e.touches[0];
        const [currX, currY] = getCoords(touch);
        const drawData = {
            x0: lastX, y0: lastY,
            x1: currX, y1: currY,
            color: currentTool === 'eraser' ? '#ffffff' : document.getElementById("whiteboardColor").value,
            width: currentTool === 'eraser' ? 20 : 2
        };
        drawOnCanvas(drawData);
        socket.emit("live:whiteboard", { sessionId, draw: drawData });
        [lastX, lastY] = [currX, currY];
    }, { passive: false });

    canvas.addEventListener('mouseup', () => isDrawing = false);
    canvas.addEventListener('mouseout', () => isDrawing = false);
}

function getCoords(e) {
    if (!window.isMentor) return [0, 0]; // Double check although UI is hidden
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
}

function drawOnCanvas(draw) {
    if (!ctx) {
        console.error("[WHITEBOARD] Drawing failed: No canvas context found.");
        return;
    }
    console.log("[WHITEBOARD] Drawing stroke:", draw);
    // Auto-show whiteboard for mentees when mentor draws
    const container = document.getElementById("whiteboardContainer");
    if (container && container.style.display === "none") {
        container.style.display = "block";
        document.getElementById("toggleWhiteboard")?.classList.add("active");
        if (typeof window.triggerWhiteboardResize === 'function') {
            window.triggerWhiteboardResize();
        }
    }

    const { x0, y0, x1, y1, color, width } = draw;
    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
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
            if (typeof showToast === 'function') showToast("Mic permission requested from Mentor...", "info");
            return;
        }
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            this.classList.toggle("off", !audioTrack.enabled);
        }
    });

    document.getElementById("toggleCam").addEventListener("click", function () {
        if (!window.isMentor && !grantedPermissions.cam) {
            socket.emit("live:requestPermission", { sessionId, type: 'cam' });
            if (typeof showToast === 'function') showToast("Camera permission requested from Mentor...", "info");
            return;
        }
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            this.classList.toggle("off", !videoTrack.enabled);
        }
    });

    document.getElementById("toggleWhiteboard").addEventListener("click", () => {
        const container = document.getElementById("whiteboardContainer");
        const isVisible = container.style.display !== "none";
        const newVisible = !isVisible;

        container.style.display = newVisible ? "block" : "none";
        document.getElementById("toggleWhiteboard").classList.toggle("active", newVisible);

        if (newVisible && typeof window.triggerWhiteboardResize === 'function') {
            window.triggerWhiteboardResize();
        }

        if (window.isMentor) {
            socket.emit("live:whiteboardToggle", { sessionId, visible: newVisible });
        }
    });

    const clearBtn = document.getElementById("clearBoard");
    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            socket.emit("live:whiteboardClear", { sessionId });
        });
    }

    const startBtn = document.getElementById("startSessionBtn");
    if (startBtn) {
        startBtn.addEventListener("click", () => {
            socket.emit("live:startSession", { sessionId });
        });
    }

    const endBtn = document.getElementById("endSessionBtn");
    if (endBtn) {
        endBtn.addEventListener("click", () => triggerEndSession());
    }
    // endSessionBtn logic removed here as it is unified in triggerEndSession


    // Tool switching
    document.querySelectorAll(".whiteboard-tools .tool").forEach(btn => {
        btn.addEventListener("click", function () {
            if (!window.isMentor) return;
            document.querySelectorAll(".whiteboard-tools .tool").forEach(b => b.classList.remove("active"));
            this.classList.add("active");
            currentTool = this.dataset.tool;
        });
    });

    document.getElementById("toggleShare").addEventListener("click", async function () {
        if (!window.isMentor) {
            if (typeof showToast === 'function') showToast("Only Mentors can start screen sharing", "info");
            return;
        }

        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];

            // Sync UI
            document.getElementById("localVideo").srcObject = screenStream;
            this.classList.add("active");

            screenTrack.onended = () => {
                stopScreenShare();
            };
        } catch (err) {
            console.error(err);
        }
    });
}

function stopScreenShare() {
    document.getElementById("localVideo").srcObject = localStream;
    document.getElementById("toggleShare").classList.remove("active");
}

function sendChat() {
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (!text) return;
    socket.emit("live:chat", { sessionId, message: text });
    input.value = "";
}

function appendChatMessage({ user, message, timestamp }) {
    const container = document.getElementById("chatMessages");
    const isSelf = user.id === getMyId();
    const div = document.createElement("div");
    div.className = `message ${isSelf ? 'self' : 'other'}`;
    const safeContent = linkify(escapeHtml(message));
    div.innerHTML = `<strong>${isSelf ? 'You' : user.name}</strong><br>${safeContent}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function updateParticipants(participants) {
    window.lastParticipants = participants;
    const navContainer = document.getElementById("nav-participants");
    if (!navContainer) return;

    navContainer.innerHTML = "";

    participants.forEach(p => {
        const wrapper = document.createElement("div");
        wrapper.className = "nav-avatar-wrapper";

        const img = document.createElement("img");
        img.src = p.profile_image || 'assets/images/user-avatar.png';
        img.alt = p.name;
        img.className = `nav-p-avatar ${p.role.toLowerCase()}`;
        if (p.status === "Absent") img.classList.add("offline");
        img.title = `${p.name} (${p.role})`;
        img.style.cursor = 'pointer';
        img.onclick = () => window.location.href = `public-profile.html?user=${p.id}`;

        const dot = document.createElement("span");
        dot.className = `nav-status-dot ${p.status.toLowerCase()}`;

        wrapper.appendChild(img);
        wrapper.appendChild(dot);
        navContainer.appendChild(wrapper);

        // Update video grid names if present
        const nameEl = document.getElementById(`name-${p.id}`);
        if (nameEl) nameEl.textContent = p.name;
    });
}

// Permission System Handlers
async function handlePermissionRequest(userId, type) {
    const user = window.lastParticipants?.find(p => p.id === userId);
    const userName = user ? user.name : "A participant";

    const confirmed = await showConfirm(
        "Permission Request",
        `${userName} is requesting permission to use ${type}. Grant it?`,
        "Grant",
        false
    );

    socket.emit("live:grantPermission", { sessionId, targetUserId: userId, type, granted: confirmed });
}

async function ensureMediaTracks(type) {
    console.log(`[WEBRTC] Ensuring ${type} tracks are available...`);
    let track = type === 'mic' ? localStream.getAudioTracks()[0] : localStream.getVideoTracks()[0];

    // Check if it's a real track or a dummy one (canvas-based dummy won't have the right label/kind for some browsers)
    // Or if it's missing altogether
    if (!track || track.label.toLowerCase().includes("canvas") || track.readyState === 'ended') {
        try {
            console.log(`[WEBRTC] Missing real ${type} track. Requesting hardware access...`);
            const freshStream = await navigator.mediaDevices.getUserMedia({
                audio: type === 'mic' || (localStream && localStream.getAudioTracks().length > 0),
                video: type === 'cam' || (localStream && localStream.getVideoTracks().length > 0)
            });

            // Update local stream with real hardware tracks
            if (type === 'mic') {
                const oldMic = localStream.getAudioTracks()[0];
                if (oldMic) localStream.removeTrack(oldMic);
                localStream.addTrack(freshStream.getAudioTracks()[0]);
            } else {
                const oldCam = localStream.getVideoTracks()[0];
                if (oldCam) localStream.removeTrack(oldCam);
                localStream.addTrack(freshStream.getVideoTracks()[0]);
            }
            // Update local preview
            document.getElementById("localVideo").srcObject = localStream;
            track = type === 'mic' ? localStream.getAudioTracks()[0] : localStream.getVideoTracks()[0];
        } catch (err) {
            console.error(`[WEBRTC] Failed to get hardware for ${type}:`, err);
            if (typeof showToast === 'function') showToast(`Failed to access ${type}. Please check browser permissions.`, "error");
            return null;
        }
    }
    return track;
}

async function handlePermissionGranted(type, granted, isSilent = false) {
    if (!granted) {
        if (!isSilent && typeof showToast === 'function') showToast(`Mentor denied ${type} permission.`, "warning");
        return;
    }

    grantedPermissions[type] = true;
    if (!isSilent && typeof showToast === 'function') showToast(`Mentor granted ${type} permission!`, "success");

    if (type === 'mic' || type === 'cam') {
        const track = await ensureMediaTracks(type);
        if (track) {
            track.enabled = true;
            const btnId = type === 'mic' ? "toggleMic" : "toggleCam";
            document.getElementById(btnId)?.classList.remove("off");

            // WebRTC: Add track to active connections
            Object.values(peerConnections).forEach(pc => {
                const senders = pc.getSenders();
                const exists = senders.find(s => s.track === track);
                if (!exists) {
                    console.log(`[WEBRTC] Injecting ${type} track into connection with peer.`);
                    pc.addTrack(track, localStream);
                }
            });
        }
    } else if (type === 'whiteboard') {
        // Allow whiteboard access
        if (!window.isMentor) {
            const toggleWb = document.getElementById("toggleWhiteboard");
            if (toggleWb) toggleWb.style.display = "block";
        }
    }
}

// Wrap existing toggle handlers to check for permissions if mentee
const originalMicHandler = document.getElementById("toggleMic").onclick; // Not working because it's added via addEventListener
// I will instead modify the event listeners in setupEventListeners directly.

function getMyId() {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return user.id || user._id;
}

let timerInterval;
function startTimer(startedAt = null) {
    let seconds = 0;
    if (startedAt) {
        const start = new Date(startedAt);
        const now = new Date();
        seconds = Math.max(0, Math.floor((now - start) / 1000));
    }

    const timerDisplay = document.getElementById("sessionTimer");
    if (!timerDisplay) return;

    clearInterval(timerInterval);

    const updateDisplay = () => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        timerDisplay.textContent = `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    updateDisplay(); // Set initial state immediately

    timerInterval = setInterval(() => {
        seconds++;
        updateDisplay();
    }, 1000);
}

// Global Handlers
window.handleEndSession = () => {
    triggerEndSession();
};

window.handleInviteClick = () => {
    if (!window.isMentor) return;
    document.getElementById("inviteModal").classList.add("active");
    document.getElementById("inviteSearch").value = "";
    document.getElementById("inviteUserList").innerHTML = `
        <div style="padding: 40px 20px; text-align: center; color: #999;">
            <i class="fa-solid fa-magnifying-glass" style="font-size: 32px; margin-bottom: 12px; opacity: 0.3;"></i>
            <p style="margin: 0; font-size: 13px;">Start typing to search users</p>
        </div>`;
    document.getElementById("sendInviteBtn").disabled = true;
    window.selectedInviteeId = null;
};

// Initialization for Invite Modal
function initInviteModal() {
    console.log("[LIVE] Initializing Invite Modal logic...");
    const inviteSearch = document.getElementById("inviteSearch");
    const userList = document.getElementById("inviteUserList");
    const sendBtn = document.getElementById("sendInviteBtn");
    const closeBtn = document.querySelector(".btn-close-invite");

    if (closeBtn) {
        closeBtn.onclick = () => document.getElementById("inviteModal").classList.remove("active");
    }

    if (inviteSearch) {
        let searchTimeout;
        inviteSearch.oninput = (e) => {
            const query = e.target.value.trim();
            clearTimeout(searchTimeout);
            if (query.length < 2) {
                userList.innerHTML = `<p style="padding:20px; text-align:center; color:#999;">Search at least 2 chars</p>`;
                return;
            }

            searchTimeout = setTimeout(async () => {
                try {
                    const res = await fetch(`${API_BASE}/users/search?query=${query}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    const users = await res.json();

                    if (users.length === 0) {
                        userList.innerHTML = `<p style="padding:20px; text-align:center; color:#999;">No users found</p>`;
                        return;
                    }

                    userList.innerHTML = users.map(u => `
                        <div class="user-item" data-id="${u._id}" onclick="window.selectInvitee('${u._id}', '${u.name}')" 
                             style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; display: flex; align-items: center; gap: 10px;">
                            <img src="${u.profile_image || 'assets/images/default-avatar.png'}" style="width: 32px; height: 32px; border-radius: 50%;">
                            <div>
                                <div style="font-weight: 600; font-size: 14px; color: #fff;">${u.name}</div>
                                <div style="font-size: 11px; color: #aaa;">${u.email}</div>
                            </div>
                        </div>
                    `).join('');
                } catch (err) {
                    console.error("Search error:", err);
                }
            }, 300);
        };
    }

    if (sendBtn) {
        sendBtn.onclick = async () => {
            if (!window.selectedInviteeId || !sessionId) return;
            try {
                sendBtn.disabled = true;
                sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

                const res = await fetch(`${API_BASE}/live-sessions/invite`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ sessionId, userId: window.selectedInviteeId })
                });

                const data = await res.json();
                if (res.ok) {
                    if (typeof showToast === 'function') showToast("Invitation sent successfully!", "success");
                    document.getElementById("inviteModal").classList.remove("active");
                } else {
                    if (typeof showToast === 'function') showToast(data.message || "Failed to send invite", "error");
                }
            } catch (err) {
                console.error("Invite error:", err);
                if (typeof showToast === 'function') showToast("Network error", "error");
            } finally {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Invite';
            }
        };
    }
}

// Call init once ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInviteModal);
} else {
    initInviteModal();
}

window.selectInvitee = (id, name) => {
    window.selectedInviteeId = id;
    document.querySelectorAll(".user-item").forEach(el => el.style.background = "transparent");
    const selectedEl = document.querySelector(`.user-item[data-id="${id}"]`);
    if (selectedEl) selectedEl.style.background = "rgba(220, 239, 98, 0.2)";
    document.getElementById("sendInviteBtn").disabled = false;
};

async function triggerEndSession() {
    console.log("[LIVE] triggerEndSession called. SessionID:", sessionId);
    if (!sessionId) {
        if (typeof showToast === 'function') showToast("Error: Session ID missing", "error");
        return;
    }

    const confirmed = await showConfirm(
        "End Session?",
        "Are you sure you want to end this session? This will deduct credits and close the room.",
        "End Session",
        true // isDanger
    );

    if (confirmed) {
        const btn = document.getElementById("endSessionBtn");
        let originalHtml = "";
        if (btn) {
            originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        }

        try {
            if (typeof showToast === 'function') showToast("Ending session and processing credits...", "info");

            const res = await fetch(`${API_BASE}/live-sessions/end-session`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ sessionId })
            });

            if (res.ok) {
                console.log("[LIVE] Session ended successfully via API.");
            } else {
                const err = await res.json();
                if (typeof showToast === 'function') showToast(err.message || "Failed to end session", "error");
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalHtml;
                }
            }
        } catch (err) {
            console.error("End session error:", err);
            if (typeof showToast === 'function') showToast("Network error", "error");
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        }
    }
}


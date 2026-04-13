const token = localStorage.getItem("token");
if (!token) {
    window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
}
const API_BASE = window.API_BASE_URL;
// Global State
let currentChatUserId = null;
let debounceTimer;
const SOCKET_URL = window.API_SOCKET_URL;

const socket = io(SOCKET_URL, {
    auth: { token }
});
let localStream;
let peerConnections = {}; // peerId -> RTCPeerConnection
let signalingStates = {}; // peerId -> { makingOffer, ignoreOffer, isSettingRemoteAnswerPending }
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

        // Re-initialize navbar
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

            const state = signalingStates[fromUserId];
            const description = signal.sdp;

            if (description) {
                const offerCollision = (description.type === "offer") &&
                    (state.makingOffer || pc.signalingState !== "stable");

                state.ignoreOffer = !window.isMentor && offerCollision; // Mentee is polite (Mentor is impolite)
                if (state.ignoreOffer) {
                    console.log("[WEBRTC] Ignoring offer due to collision (Polite colleague)");
                    return;
                }

                await pc.setRemoteDescription(description);
                if (description.type === "offer") {
                    await pc.setLocalDescription(await pc.createAnswer());
                    socket.emit("live:signal", {
                        sessionId,
                        targetUserId: fromUserId,
                        signal: { sdp: pc.localDescription }
                    });
                }
            } else if (signal.candidate) {
                try {
                    await pc.addIceCandidate(signal.candidate);
                } catch (err) {
                    if (!state.ignoreOffer) throw err;
                }
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
    signalingStates[peerId] = {
        makingOffer: false,
        ignoreOffer: false,
        isSettingRemoteAnswerPending: false
    };

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
            const state = signalingStates[peerId];
            state.makingOffer = true;
            await pc.setLocalDescription();
            socket.emit("live:signal", {
                sessionId,
                targetUserId: peerId,
                signal: { sdp: pc.localDescription }
            });
        } catch (err) {
            console.error("[WEBRTC] Negotiation error:", err);
        } finally {
            signalingStates[peerId].makingOffer = false;
        }
    };

    pc.ontrack = ({ track, streams }) => {
        console.log("[WEBRTC] Track received from", peerId, track.kind);
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
            nameSpan.textContent = "Remote User";

            wrapper.appendChild(remoteVid);
            wrapper.appendChild(nameSpan);
            document.getElementById("videoGrid").appendChild(wrapper);

            const p = window.lastParticipants?.find(part => part.id === peerId);
            if (p) nameSpan.textContent = p.name;
        }

        // Perfect track rendering: handle streams or individual tracks
        if (remoteVid.srcObject) return; // Already initialized
        if (streams && streams[0]) {
            remoteVid.srcObject = streams[0];
        } else {
            remoteVid.srcObject = new MediaStream([track]);
        }
    };

    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
            const wrapper = document.getElementById(`wrapper-${peerId}`);
            if (wrapper) wrapper.remove();
            delete peerConnections[peerId];
        }
    };

    if (isOffer) {
        try {
            const state = signalingStates[peerId];
            state.makingOffer = true;
            await pc.setLocalDescription();
            socket.emit("live:signal", {
                sessionId,
                targetUserId: peerId,
                signal: { sdp: pc.localDescription }
            });
        } catch (err) {
            console.error("Initial offer error:", err);
        } finally {
            signalingStates[peerId].makingOffer = false;
        }
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
        isDrawing = true;
        [lastX, lastY] = getCoords(e);
    });

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
        if (typeof window.triggerWhiteboardResize === 'function') {
            window.triggerWhiteboardResize();
        }
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
            if (typeof showToast === 'function') showToast("Mic permission requested...", "info");
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
            if (typeof showToast === 'function') showToast("Camera permission requested...", "info");
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
        const newVisible = container.style.display === "none";
        container.style.display = newVisible ? "block" : "none";
        document.getElementById("toggleWhiteboard").classList.toggle("active", newVisible);
        if (newVisible) window.triggerWhiteboardResize();
        if (window.isMentor) socket.emit("live:whiteboardToggle", { sessionId, visible: newVisible });
    });

    const startBtn = document.getElementById("startSessionBtn");
    if (startBtn) {
        startBtn.addEventListener("click", () => {
            socket.emit("live:startSession", { sessionId });
        });
    }

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
    if (!text) return;
    socket.emit("live:chat", { sessionId, message: text });
    input.value = "";
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
    window.lastParticipants = participants;
    const navContainer = document.getElementById("nav-participants");
    if (!navContainer) return;
    navContainer.innerHTML = "";
    participants.forEach(p => {
        const wrapper = document.createElement("div");
        wrapper.className = "nav-avatar-wrapper";
        wrapper.innerHTML = `
            <img src="${p.profile_image || 'assets/images/user-avatar.png'}" class="nav-p-avatar ${p.role.toLowerCase()}${p.status === 'Absent' ? ' offline' : ''}" title="${p.name} (${p.role})">
            <span class="nav-status-dot ${p.status.toLowerCase()}"></span>
        `;
        navContainer.appendChild(wrapper);
        const nameEl = document.getElementById(`name-${p.id}`);
        if (nameEl) nameEl.textContent = p.name;
    });
}

async function handlePermissionRequest(userId, type) {
    const user = window.lastParticipants?.find(p => p.id === userId);
    const confirmed = await showConfirm("Permission Request", `${user ? user.name : "A participant"} requests ${type}. Grant?`, "Grant", false);
    socket.emit("live:grantPermission", { sessionId, targetUserId: userId, type, granted: confirmed });
}

async function ensureMediaTracks(type) {
    let track = type === 'mic' ? localStream.getAudioTracks()[0] : localStream.getVideoTracks()[0];
    if (!track || track.label.toLowerCase().includes("canvas") || track.readyState === 'ended') {
        try {
            const freshStream = await navigator.mediaDevices.getUserMedia({
                audio: type === 'mic' || (localStream && localStream.getAudioTracks().length > 0),
                video: type === 'cam' || (localStream && localStream.getVideoTracks().length > 0)
            });
            if (type === 'mic') {
                localStream.addTrack(freshStream.getAudioTracks()[0]);
            } else {
                localStream.addTrack(freshStream.getVideoTracks()[0]);
            }
            document.getElementById("localVideo").srcObject = localStream;
            track = type === 'mic' ? localStream.getAudioTracks()[0] : localStream.getVideoTracks()[0];
        } catch (err) {
            console.error("Hardware access failed", err);
            return null;
        }
    }
    return track;
}

async function handlePermissionGranted(type, granted, isSilent = false) {
    if (!granted) {
        if (!isSilent && typeof showToast === 'function') showToast(`Mentor denied ${type}.`, "warning");
        return;
    }
    grantedPermissions[type] = true;
    if (!isSilent && typeof showToast === 'function') showToast(`Mentor granted ${type}!`, "success");

    if (type === 'mic' || type === 'cam') {
        const track = await ensureMediaTracks(type);
        if (track) {
            track.enabled = true;
            document.getElementById(type === 'mic' ? "toggleMic" : "toggleCam")?.classList.remove("off");
            Object.values(peerConnections).forEach(pc => {
                const exists = pc.getSenders().find(s => s.track === track);
                if (!exists) pc.addTrack(track, localStream);
            });
        }
    } else if (type === 'whiteboard') {
        if (!window.isMentor) document.getElementById("toggleWhiteboard").style.display = "block";
    }
}

function getMyId() {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return user.id || user._id;
}

let timerInterval;
function startTimer(startedAt = null) {
    let seconds = 0;
    if (startedAt) {
        seconds = Math.max(0, Math.floor((new Date() - new Date(startedAt)) / 1000));
    }
    const timerDisplay = document.getElementById("sessionTimer");
    if (!timerDisplay) return;
    clearInterval(timerInterval);
    const update = () => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        timerDisplay.textContent = `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };
    update();
    timerInterval = setInterval(() => { seconds++; update(); }, 1000);
}

window.handleEndSession = () => triggerEndSession();
window.handleInviteClick = () => {
    document.getElementById("inviteModal").classList.add("active");
    document.getElementById("inviteUserList").innerHTML = "";
};

function initInviteModal() {
    const inviteSearch = document.getElementById("inviteSearch");
    if (inviteSearch) {
        inviteSearch.oninput = async (e) => {
            const query = e.target.value.trim();
            if (query.length < 2) return;
            const res = await fetch(`${API_BASE}/users/search?query=${query}`, { headers: { Authorization: `Bearer ${token}` } });
            const users = await res.json();
            document.getElementById("inviteUserList").innerHTML = users.map(u => `
                <div class="user-item" data-id="${u._id}" onclick="window.selectInvitee('${u._id}')" style="padding:10px; cursor:pointer;">
                    ${u.name} (${u.email})
                </div>
            `).join('');
        };
    }
    document.getElementById("sendInviteBtn").onclick = async () => {
        const res = await fetch(`${API_BASE}/live-sessions/invite`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ sessionId, userId: window.selectedInviteeId })
        });
        if (res.ok) {
            showToast("Invite sent!", "success");
            document.getElementById("inviteModal").classList.remove("active");
        }
    };
    document.querySelector(".btn-close-invite").onclick = () => document.getElementById("inviteModal").classList.remove("active");
}

initInviteModal();
window.selectInvitee = (id) => {
    window.selectedInviteeId = id;
    document.getElementById("sendInviteBtn").disabled = false;
};

async function triggerEndSession() {
    const confirmed = await showConfirm("End Session?", "Close room and process credits?", "End Session", true);
    if (confirmed) {
        const res = await fetch(`${API_BASE}/live-sessions/end-session`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ sessionId })
        });
        if (res.ok) showToast("Session ended", "success");
    }
}

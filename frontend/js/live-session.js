const token = localStorage.getItem("token");
if (!token) {
    window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
}
const API_BASE = window.API_BASE_URL;

// Global State
const SOCKET_URL = window.API_SOCKET_URL;
const socket = io(SOCKET_URL, { auth: { token } });

let localStream;
let screenStream = null; // FIX D: Screen sharing state
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
    adjustVideoGrid();
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

        // Restore media state placeholders
        if (data.allMediaStates) {
            Object.entries(data.allMediaStates).forEach(([uid, state]) => {
                if (state && state.video !== undefined) {
                    updateVideoWrapperCameraState(uid, state.video);
                }
            });
        }

        // Setup local media state on join
        if (!window.isMentor) {
            if (localStream && localStream.getVideoTracks()[0]) localStream.getVideoTracks()[0].enabled = !!grantedPermissions.cam;
            if (localStream && localStream.getAudioTracks()[0]) localStream.getAudioTracks()[0].enabled = !!grantedPermissions.mic;
        }
        const isVideoOn = localStream && localStream.getVideoTracks()[0] ? localStream.getVideoTracks()[0].enabled : false;
        const isAudioOn = localStream && localStream.getAudioTracks()[0] ? localStream.getAudioTracks()[0].enabled : false;
        updateVideoWrapperCameraState(getMyId(), isVideoOn);
        socket.emit("live:mediaStateChanged", { sessionId, video: isVideoOn, audio: isAudioOn });

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
                showChatToggle: true,
                showParticipantsToggle: true,
                onInviteClick: () => window.handleInviteClick?.(),
                primaryAction: {
                    show: true,
                    label: 'End Session',
                    onClick: () => window.handleEndSession?.()
                }
            });
            syncNavbarToggles();
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
    socket.on("live:mediaStateUpdated", ({ userId, video, audio }) => {
        console.log(`[MEDIA] State updated for ${userId}: video=${video}, audio=${audio}`);
        updateVideoWrapperCameraState(userId, video);
    });

    socket.on("live:peerJoined", ({ userId }) => {
        if (userId !== getMyId()) {
            console.log("[WEBRTC] Peer joined, waiting for connection request from:", userId);
        }
    });

    socket.on("live:signal", async ({ fromUserId, signal }) => {
        try {
            let pc = peerConnections[fromUserId];
            if (!pc) pc = await createPeerConnection(fromUserId, false);

            const state = signalingStates[fromUserId];
            const description = signal.sdp;

            if (description) {
                // Perfect Negotiation: Check for glare using asymmetric ID-based politeness
                const polite = getMyId() < fromUserId;
                const offerCollision = (description.type === "offer") &&
                    (state.makingOffer || pc.signalingState !== "stable");

                state.ignoreOffer = !polite && offerCollision;
                if (state.ignoreOffer) {
                    console.warn("[WEBRTC] Glare detected, ignoring offer.");
                    return;
                }

                if (offerCollision) {
                    await Promise.all([
                        pc.setLocalDescription({ type: "rollback" }),
                        pc.setRemoteDescription(description)
                    ]);
                } else {
                    // FIX 1: Track that we are actively applying a remote answer so
                    // incoming ICE candidates are queued rather than fed directly
                    // to addIceCandidate() while the peer connection is not yet stable.
                    state.isSettingRemoteAnswerPending = description.type === "answer";
                    await pc.setRemoteDescription(description);
                    state.isSettingRemoteAnswerPending = false;
                }

                if (description.type === "offer") {
                    await pc.setLocalDescription();
                    socket.emit("live:signal", { sessionId, targetUserId: fromUserId, signal: { sdp: pc.localDescription } });
                }

                // Flush queued candidates
                while (state.candidates.length) {
                    await pc.addIceCandidate(state.candidates.shift());
                }
            } else if (signal.candidate) {
                try {
                    // FIX 1: Queue if no remote description yet OR if an answer is
                    // still being applied — prevents InvalidStateError mid-handshake.
                    const readyForCandidate = pc.remoteDescription && !state.isSettingRemoteAnswerPending;
                    if (!readyForCandidate) {
                        state.candidates.push(signal.candidate);
                    } else {
                        await pc.addIceCandidate(signal.candidate);
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
            // FIX A: Removed `if (pc.signalingState !== 'stable') return;`
            // That guard silently discarded onnegotiationneeded events fired mid-negotiation
            // (e.g. when a new track is granted while an offer/answer cycle is in-flight),
            // causing a permanent deadlock where new tracks were never exchanged.
            // Perfect Negotiation's makingOffer + polite/impolite pattern handles collisions.
            signalingStates[peerId].makingOffer = true;
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
            
            const placeholder = document.createElement("div");
            placeholder.className = "avatar-placeholder";
            placeholder.innerHTML = `<i class="fa-solid fa-user"></i>`;
            
            const nameEl = document.createElement("span");
            nameEl.className = "participant-name";
            nameEl.id = `name-${peerId}`;
            nameEl.textContent = window.lastParticipants?.find(p => p.id === peerId)?.name || "Participant";
            
            wrapper.appendChild(video);
            wrapper.appendChild(placeholder);
            wrapper.appendChild(nameEl);
            document.getElementById("videoGrid").appendChild(wrapper);
            
            adjustVideoGrid();
        }
        
        let stream = streams[0];
        if (!stream) {
            stream = new MediaStream([track]);
        }
        
        if (video.srcObject) {
            if (video.srcObject instanceof MediaStream) {
                const existingTracks = video.srcObject.getTracks();
                if (!existingTracks.includes(track)) {
                    video.srcObject.addTrack(track);
                    // FIX C: Re-assign to force Chromium/Safari to flush the stale
                    // hardware decode pipeline after a dynamic track injection.
                    // Without this, the video element silently renders nothing.
                    video.srcObject = video.srcObject;
                }
            }
        } else {
            video.srcObject = stream;
        }
    };

    pc.oniceconnectionstatechange = () => {
        console.log(`[WEBRTC] ICE state: ${pc.iceConnectionState} for peer ${peerId}`);
        // FIX 3: 'disconnected' is a transient/recoverable state (normal network jitter).
        // Only tear down on truly terminal states: 'failed' or 'closed'.
        if (['failed', 'closed'].includes(pc.iceConnectionState)) {
            console.warn(`[WEBRTC] ICE state terminated: ${pc.iceConnectionState} for ${peerId}`);
            document.getElementById(`wrapper-${peerId}`)?.remove();
            delete peerConnections[peerId];
            delete signalingStates[peerId];
            adjustVideoGrid();
        }
    };

    if (isOffer) {
        // Ensure onnegotiationneeded fires even if no tracks are added initially
        pc.createDataChannel("dummy");
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

// --- FIX D: Screen Sharing Implementation ---
async function toggleScreenShare() {
    const shareBtn = document.getElementById("toggleShare");
    if (screenStream) {
        stopScreenShare();
    } else {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];

            // Auto-revert when user clicks browser's native "Stop sharing" button
            screenTrack.onended = () => stopScreenShare();

            // Seamlessly replace video track in every active peer connection
            // using replaceTrack — no renegotiation required
            for (const peerId in peerConnections) {
                const pc = peerConnections[peerId];
                const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (videoSender) {
                    await videoSender.replaceTrack(screenTrack);
                }
            }

            document.getElementById("localVideo").srcObject = screenStream;
            shareBtn?.classList.add("active");
            if (typeof showToast === 'function') showToast("Screen sharing active", "success");
        } catch (err) {
            console.error("[SCREEN] Share error:", err);
            screenStream = null;
            if (typeof showToast === 'function') showToast("Unable to share screen.", "error");
        }
    }
}

function stopScreenShare() {
    const shareBtn = document.getElementById("toggleShare");
    if (!screenStream) return;

    try { screenStream.getTracks().forEach(t => t.stop()); } catch (e) { console.error(e); }
    screenStream = null;

    // Restore original camera track to all peer connections
    const cameraTrack = localStream.getVideoTracks()[0];
    if (cameraTrack) {
        for (const peerId in peerConnections) {
            const pc = peerConnections[peerId];
            const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (videoSender) videoSender.replaceTrack(cameraTrack);
        }
    }

    document.getElementById("localVideo").srcObject = localStream;
    shareBtn?.classList.remove("active");
    if (typeof showToast === 'function') showToast("Screen sharing stopped", "info");
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
        if (track) { 
            track.enabled = !track.enabled; 
            this.classList.toggle("off", !track.enabled); 
            const isVideoOn = localStream.getVideoTracks()[0] ? localStream.getVideoTracks()[0].enabled : false;
            socket.emit("live:mediaStateChanged", { sessionId, video: isVideoOn, audio: track.enabled });
        }
    });

    document.getElementById("toggleCam").addEventListener("click", function () {
        if (!window.isMentor && !grantedPermissions.cam) {
            socket.emit("live:requestPermission", { sessionId, type: 'cam' });
            if (typeof showToast === 'function') showToast("Requesting camera access...", "info");
            return;
        }
        const track = localStream.getVideoTracks()[0];
        if (track) { 
            track.enabled = !track.enabled; 
            this.classList.toggle("off", !track.enabled); 
            updateVideoWrapperCameraState(getMyId(), track.enabled);
            const isAudioOn = localStream.getAudioTracks()[0] ? localStream.getAudioTracks()[0].enabled : false;
            socket.emit("live:mediaStateChanged", { sessionId, video: track.enabled, audio: isAudioOn });
        }
    });

    // FIX D: Bind screen share toggle (button existed in HTML but had no listener)
    const toggleShareBtn = document.getElementById("toggleShare");
    if (toggleShareBtn) toggleShareBtn.addEventListener("click", toggleScreenShare);

    // Event delegation for dynamically loaded navbar toggle buttons
    document.addEventListener("click", function (e) {
        // A. Toggle Chat Panel
        const toggleChatBtn = e.target.closest("#toggleChat");
        if (toggleChatBtn) {
            const leftPanel = document.querySelector(".left-panel");
            if (leftPanel) {
                const isCollapsed = (leftPanel.style.display === "none");
                leftPanel.style.display = isCollapsed ? "flex" : "none";
                toggleChatBtn.classList.toggle("active", isCollapsed);
                toggleChatBtn.classList.toggle("off", !isCollapsed);
            }
            return;
        }

        // B. Toggle Permissions List (Right Panel)
        const togglePermBtn = e.target.closest("#toggleParticipants");
        if (togglePermBtn) {
            const rightPanel = document.querySelector(".right-panel");
            if (rightPanel) {
                const isCollapsed = (rightPanel.style.display === "none");
                rightPanel.style.display = isCollapsed ? "flex" : "none";
                togglePermBtn.classList.toggle("active", isCollapsed);
                togglePermBtn.classList.toggle("off", !isCollapsed);
            }
            return;
        }
    });

    syncNavbarToggles();

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

    // FIX B: Only clean up peers for participants REMOVED from the session entirely (!p).
    // Previously `p.status === 'Absent'` also triggered teardown, which killed live calls
    // during momentary socket reconnects (the server now correctly emits 'Absent' only
    // when a user's last socket drops, but even then the WebRTC call may still be alive
    // and the user reconnecting). ICE state machine handles true failures via
    // oniceconnectionstatechange ('failed'/'closed').
    Object.keys(peerConnections).forEach(pid => {
        const p = participants.find(part => part.id === pid);
        if (!p) {
            console.log(`[WEBRTC] Cleaning up peer for removed participant: ${pid}`);
            const el = document.getElementById(`wrapper-${pid}`);
            if (el) {
                el.remove();
                adjustVideoGrid();
            }
            if (peerConnections[pid]) {
                try {
                    peerConnections[pid].close();
                } catch (e) {
                    console.error("Error closing peer connection:", e);
                }
                delete peerConnections[pid];
            }
            delete signalingStates[pid];
        }
    });

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
                if (type === 'cam') {
                    updateVideoWrapperCameraState(getMyId(), false);
                }
            } else {
                // If it was newly granted, we might need to add it to existing peer connections
                if (!prev && granted) {
                    const freshTrack = await ensureMediaTracks(type);
                    if (freshTrack) {
                        freshTrack.enabled = true;
                        document.getElementById(type === 'mic' ? "toggleMic" : "toggleCam")?.classList.remove("off");
                        if (type === 'cam') {
                            updateVideoWrapperCameraState(getMyId(), true);
                        }
                        Object.values(peerConnections).forEach(pc => {
                            const senders = pc.getSenders();
                            if (!senders.find(s => s.track === freshTrack)) {
                                pc.addTrack(freshTrack, localStream);
                            }
                        });
                    }
                }
            }
            // Broadcast new state
            const isVideoOn = localStream.getVideoTracks()[0] ? localStream.getVideoTracks()[0].enabled : false;
            const isAudioOn = localStream.getAudioTracks()[0] ? localStream.getAudioTracks()[0].enabled : false;
            socket.emit("live:mediaStateChanged", { sessionId, video: isVideoOn, audio: isAudioOn });
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
    if (!window.isMentor) {
        if (typeof showToast === 'function') showToast("Only mentors can end session", "warning");
        return;
    }
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

function updateVideoWrapperCameraState(userId, isCameraOn) {
    const isSelf = userId === getMyId();
    const wrapper = isSelf ? document.querySelector(".video-wrapper.local") : document.getElementById(`wrapper-${userId}`);
    if (wrapper) {
        wrapper.classList.toggle("camera-off", !isCameraOn);
    }
}

function adjustVideoGrid() {
    const grid = document.getElementById("videoGrid");
    if (!grid) return;
    const count = grid.children.length;
    
    // Remove old layout classes
    grid.classList.remove("grid-1", "grid-2", "grid-3", "grid-4", "grid-many");
    
    if (count === 1) {
        grid.classList.add("grid-1");
    } else if (count === 2) {
        grid.classList.add("grid-2");
    } else if (count === 3) {
        grid.classList.add("grid-3");
    } else if (count === 4) {
        grid.classList.add("grid-4");
    } else {
        grid.classList.add("grid-many");
    }
}

function syncNavbarToggles() {
    const leftPanel = document.querySelector(".left-panel");
    const rightPanel = document.querySelector(".right-panel");
    
    const toggleChatBtn = document.getElementById("toggleChat");
    if (toggleChatBtn && leftPanel) {
        const isVisible = leftPanel.style.display === "flex";
        toggleChatBtn.classList.toggle("active", isVisible);
        toggleChatBtn.classList.toggle("off", !isVisible);
    }
    
    const togglePermBtn = document.getElementById("toggleParticipants");
    if (togglePermBtn && rightPanel) {
        const isVisible = rightPanel.style.display === "flex";
        togglePermBtn.classList.toggle("active", isVisible);
        togglePermBtn.classList.toggle("off", !isVisible);
    }
}

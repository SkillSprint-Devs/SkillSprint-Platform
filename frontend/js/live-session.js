const token = localStorage.getItem("token");
if (!token) {
    window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
}
const API_BASE = window.API_BASE_URL;
const SOCKET_URL = window.API_SOCKET_URL; // Empty string for relative path in production

const socket = io(SOCKET_URL, {
    auth: { token }
});
let localStream;
let peerConnections = {};
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
                document.getElementById("startSessionBtn").style.display = "block";
            }
            if (data.status === 'live' || data.status === 'scheduled') {
                document.getElementById("endSessionBtn").style.display = "block";
            }
            document.querySelector(".video-wrapper.local .participant-name").textContent = "You (Mentor)";
        } else {
            // Mentee UI Restrictions
            document.getElementById("startSessionBtn").style.display = "none";
            document.getElementById("endSessionBtn").style.display = "none";
            document.getElementById("toggleWhiteboard").style.display = "none"; // Mentee can't open it
            document.querySelector(".video-wrapper.local .participant-name").textContent = "You (Learner)";

            // Note: If mentor opens whiteboard, mentee should see it. 
            // We'll handle sync below.
        }

        updateParticipants(data.participants);
        if (data.whiteboard && data.whiteboard.length > 0) {
            data.whiteboard.forEach(draw => drawOnCanvas(draw));
        }

        if (data.status === 'live') startTimer();
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
            document.getElementById("startSessionBtn").style.display = "none";
            if (window.isMentor) document.getElementById("endSessionBtn").style.display = "block";
            startTimer();
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

    socket.on("live:signal", async ({ fromUserId, signal }) => {
        // Handle signals for WebRTC logic...
    });
}

async function createPeerConnection(peerId, isOffer) {
    const pc = new RTCPeerConnection(iceConfig);
    peerConnections[peerId] = pc;

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("live:signal", { to: peerId, signal: { candidate: event.candidate } });
        }
    };

    pc.ontrack = (event) => {
        let remoteVid = document.getElementById(`video-${peerId}`);
        if (!remoteVid) {
            const wrapper = document.createElement("div");
            wrapper.className = "video-wrapper";
            wrapper.id = `wrapper-${peerId}`;
            remoteVid = document.createElement("video");
            remoteVid.id = `video-${peerId}`;
            remoteVid.autoplay = true;
            remoteVid.playsinline = true;
            wrapper.appendChild(remoteVid);
            document.getElementById("videoGrid").appendChild(wrapper);
        }
        remoteVid.srcObject = event.streams[0];
    };

    if (isOffer) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("live:signal", { to: peerId, signal: offer });
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
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        this.classList.toggle("off", !audioTrack.enabled);
    });

    document.getElementById("toggleCam").addEventListener("click", function () {
        const videoTrack = localStream.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
        this.classList.toggle("off", !videoTrack.enabled);
    });

    document.getElementById("toggleWhiteboard").addEventListener("click", () => {
        const container = document.getElementById("whiteboardContainer");
        const isVisible = container.style.display !== "none";
        container.style.display = isVisible ? "none" : "block";
        document.getElementById("toggleWhiteboard").classList.toggle("active", !isVisible);

        if (!isVisible && typeof window.triggerWhiteboardResize === 'function') {
            window.triggerWhiteboardResize();
        }
    });

    document.getElementById("clearBoard").addEventListener("click", () => {
        socket.emit("live:whiteboardClear", { sessionId });
    });

    document.getElementById("startSessionBtn").addEventListener("click", () => {
        socket.emit("live:startSession", { sessionId });
    });

    document.getElementById("endSessionBtn").addEventListener("click", async () => {
        console.log("[LIVE] End Session clicked. SessionID:", sessionId);
        if (!sessionId) {
            console.error("[LIVE] Cannot end session: sessionId is missing from URL");
            if (typeof showToast === 'function') showToast("Error: Session ID missing", "error");
            return;
        }


        // Use the custom confirm function
        const confirmed = await showConfirm(
            "End Session?",
            "Are you sure you want to end this session? This will deduct credits and close the room.",
            "End Session",
            true // isDanger
        );

        if (confirmed) {
            console.log("[DEBUG] User clicked OK on custom confirm");
            const btn = document.getElementById("endSessionBtn");
            console.log("[DEBUG] Button element:", btn);

            if (!btn) {
                console.error("[DEBUG] CRITICAL: endSessionBtn not found in DOM!");
                return;
            }

            const originalHtml = btn.innerHTML;

            try {
                console.log("[DEBUG] Starting try block");
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                console.log("[RUNTIME-DEBUG] Sending end-session fetch to API...");
                if (typeof showToast === 'function') showToast("Ending session and processing credits...", "info");

                const res = await fetch(`${API_BASE}/live-sessions/end-session`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ sessionId })
                });

                console.log("[RUNTIME-DEBUG] End-session API response status:", res.status);
                if (res.ok) {
                    console.log("[RUNTIME-DEBUG] Session ended successfully via API. Waiting for socket confirmation...");
                    // Socket listener will handle the redirect
                } else {
                    const err = await res.json();
                    console.error("[RUNTIME-DEBUG] API End Session Error:", err.message);
                    if (typeof showToast === 'function') showToast(err.message || "Failed to end session", "error");
                    btn.disabled = false;
                    btn.innerHTML = originalHtml;
                }
            } catch (err) {
                console.error("[RUNTIME-DEBUG] End session API fetch error:", err);
                if (typeof showToast === 'function') showToast("Network error. Ending via socket...", "warning");
                // Fallback to socket if API fails
                socket.emit("live:endSession", { sessionId });
            }
        } else {
            console.log("[DEBUG] User clicked CANCEL on custom confirm");
        }
    });

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
    const list = document.getElementById("participantList");
    list.innerHTML = "";
    document.getElementById("attendeeCount").textContent = participants.length;
    participants.forEach(p => {
        const div = document.createElement("div");
        div.className = "participant-item";

        let statusIcon = "[Offline]";
        if (p.status === "Joined") statusIcon = "[Online]";
        if (p.status === "Waiting") statusIcon = "[Waiting]";

        div.innerHTML = `
            <img src="${p.profile_image || 'assets/images/user-avatar.png'}" alt="${p.name}" class="p-avatar">
            <div class="p-info">
                <h5>${p.name} <span class="status-icon">${statusIcon}</span></h5>
                <span class="p-role ${p.role.toLowerCase()}">${p.role}</span>
                <span class="p-status-text">${p.status}</span>
            </div>
        `;
        list.appendChild(div);
    });
}

function getMyId() {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return user.id || user._id;
}

let timerInterval;
function startTimer() {
    let seconds = 0;
    const timerDisplay = document.getElementById("sessionTimer");
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        seconds++;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        timerDisplay.textContent = `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }, 1000);
}

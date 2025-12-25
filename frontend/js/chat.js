const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
    ? 'http://localhost:5000/api'
    : '/api';
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user'));

if (!token || !user) {
    window.location.href = 'login.html';
}

// Setup User Info
document.getElementById('myName').textContent = user.name;
document.getElementById('myAvatar').src = user.profile_image || 'https://ui-avatars.com/api/?name=' + user.name;

// Global State
let currentChatUserId = null;
let debounceTimer;
const SOCKET_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
    ? 'http://localhost:5000'
    : '';

let socket = io(SOCKET_URL, {
    auth: {
        token: token
    }
});

// Socket Events
const onlineUsers = new Set();

socket.on('connect', () => {
    console.log("Connected with ID:", socket.id);
    socket.emit('join_chat', user._id);
});

socket.on('receive_message', (data) => {
    if (currentChatUserId && (data.senderId === currentChatUserId || data.sender === currentChatUserId)) {
        appendMessage(data, false);
        scrollToBottom();
    } else {
        loadConversations();
    }
});

socket.on('user_typing', ({ senderId }) => {
    if (currentChatUserId === senderId) {
        document.getElementById('typingIndicator').textContent = 'typing...';
    }
});

socket.on('user_stop_typing', ({ senderId }) => {
    if (currentChatUserId === senderId) {
        document.getElementById('typingIndicator').textContent = '';
    }
});

// Presence Events
socket.on('presence:list', (ids) => {
    ids.forEach(id => onlineUsers.add(id));
    if (currentChatUserId) updateUserStatus(currentChatUserId);
});

socket.on('user:online', (userId) => {
    onlineUsers.add(userId);
    if (currentChatUserId === userId) updateUserStatus(userId);
});

socket.on('user:offline', (userId) => {
    onlineUsers.delete(userId);
    if (currentChatUserId === userId) updateUserStatus(userId);
});

function updateUserStatus(userId) {
    const statusEl = document.getElementById('userStatus');
    if (!statusEl) return;

    if (onlineUsers.has(userId)) {
        statusEl.textContent = "active";
        statusEl.className = "user-status active";
    } else {
        statusEl.textContent = "inactive";
        statusEl.className = "user-status inactive";
    }
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    loadConversations();
});

// --- Search Logic ---
document.getElementById('userSearchInput').addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(debounceTimer);

    if (query.length < 2) {
        document.getElementById('searchResults').style.display = 'none';
        return;
    }

    debounceTimer = setTimeout(async () => {
        try {
            const res = await fetch(`${API_URL}/chat/users/search?query=${query}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const users = await res.json();
            renderSearchResults(users);
        } catch (err) {
            console.error(err);
        }
    }, 300);
});

function renderSearchResults(users) {
    const container = document.getElementById('searchResults');
    container.innerHTML = '';

    if (users.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    users.forEach(u => {
        const item = document.createElement('div');
        item.className = 'user-item';
        item.innerHTML = `
            <img src="${u.profile_image || 'https://ui-avatars.com/api/?name=' + u.name}" class="user-avatar" style="width:30px;height:30px;">
            <div>
                <div class="fw-bold small">${u.name}</div>
                <div class="text-muted small" style="font-size:0.7rem">${u.email}</div>
            </div>
        `;
        // Use a function reference or properly escaped strings.
        // Easiest is to attach event listener dynamically or use data attributes.
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => {
            openChat(u);
            document.getElementById('userSearchInput').value = '';
            container.style.display = 'none';
        });

        item.innerHTML = `
            <img src="${u.profile_image || 'https://ui-avatars.com/api/?name=' + u.name}" class="user-avatar" style="width:30px;height:30px;">
            <div>
                <div class="fw-bold small">${u.name}</div>
                <div class="text-muted small" style="font-size:0.7rem">${u.email}</div>
            </div>
        `;
        container.appendChild(item);
    });
}

// --- Conversations ---
async function loadConversations() {
    try {
        const res = await fetch(`${API_URL}/chat/conversations/recent`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        const list = document.getElementById('conversationsList');
        list.innerHTML = '';

        if (data.length === 0) {
            list.innerHTML = '<div class="text-center mt-4 text-muted small">No recent chats</div>';
            return;
        }

        data.forEach(conv => {
            const userDetails = conv.userDetails;
            const isActive = currentChatUserId === userDetails._id ? 'active' : '';
            // Handle potentially missing content due to schema changes or deletion
            const content = conv.lastMessage ? conv.lastMessage.content : "Message deleted";
            const lastMsg = content.length > 30 ? content.substring(0, 30) + '...' : content;

            const item = document.createElement('div');
            item.className = `user-item ${isActive}`;
            item.onclick = () => openChat(userDetails);
            item.innerHTML = `
                <img src="${userDetails.avatarUrl || 'https://ui-avatars.com/api/?name=' + userDetails.name}" class="user-avatar">
                <div class="flex-grow-1">
                    <div class="d-flex justify-content-between align-items-center">
                        <h6 class="mb-0 text-truncate" style="max-width: 140px;">${userDetails.name}</h6>
                        <small class="text-muted" style="font-size: 0.7rem;">
                            ${conv.lastMessage ? new Date(conv.lastMessage.createdAt).toLocaleDateString() : ''}
                        </small>
                    </div>
                    <small class="text-muted text-truncate d-block" style="max-width: 180px;">${lastMsg}</small>
                </div>
            `;
            list.appendChild(item);
        });
    } catch (err) {
        console.error("Error loading conversations", err);
    }
}

async function openChat(otherUser) {
    currentChatUserId = otherUser._id;

    // UI Updates
    document.getElementById('noChatSelected').style.display = 'none';
    const activeView = document.getElementById('activeChatView');
    activeView.style.display = 'flex';

    document.getElementById('chatHeaderName').textContent = otherUser.name;
    document.getElementById('chatHeaderAvatar').src = otherUser.avatarUrl || otherUser.profile_image || 'https://ui-avatars.com/api/?name=' + otherUser.name;
    document.getElementById('typingIndicator').textContent = '';

    updateUserStatus(otherUser._id);

    loadConversations();

    const historyContainer = document.getElementById('chatHistory');
    historyContainer.innerHTML = '<div class="text-center mt-4"><div class="spinner-border text-primary spinner-border-sm"></div></div>'; // Loading

    try {
        const res = await fetch(`${API_URL}/chat/${otherUser._id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const messages = await res.json();

        historyContainer.innerHTML = ''; // clear loading
        messages.forEach(msg => {
            const isMe = msg.sender === user._id;
            appendMessage(msg, isMe);
        });
        scrollToBottom();

    } catch (err) {
        console.error("Error loading history", err);
        historyContainer.innerHTML = '<div class="text-center text-danger">Failed to load history</div>';
    }
}

function appendMessage(msg, isMe) {
    const historyContainer = document.getElementById('chatHistory');
    if (!isMe && msg.senderId) isMe = (msg.senderId === user._id);

    const date = new Date(msg.createdAt || Date.now());
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isMe ? 'message-sent' : 'message-received'}`;
    bubble.id = `msg-${msg._id || 'temp-' + Date.now()}`;

    let actionsHtml = '';
    if (isMe) {
        actionsHtml = `
            <div class="msg-actions">
                <span class="action-btn" title="Edit" onclick="openEditModal('${msg._id}', '${msg.content.replace(/'/g, "\\'")}')">
                    <i class="fa-solid fa-pen"></i>
                </span>
                <span class="action-btn text-danger" title="Delete" onclick="deleteMessage('${msg._id}')">
                    <i class="fa-solid fa-trash"></i>
                </span>
            </div>
        `;
    }

    const statusHtml = isMe ? '<div class="message-status">Delivered</div>' : '';

    bubble.innerHTML = `
        ${actionsHtml}
        <div class="msg-content">${msg.content}</div>
        <span class="message-time">${timeStr}</span>
        ${statusHtml}
    `;

    historyContainer.appendChild(bubble);
}

function scrollToBottom() {
    const historyContainer = document.getElementById('chatHistory');
    historyContainer.scrollTop = historyContainer.scrollHeight;
}

// Send Message
document.getElementById('messageForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    if (!content || !currentChatUserId) return;

    socket.emit('stop_typing', { senderId: user._id, recipientId: currentChatUserId });

    // Optimistic UI for speed
    // Ideally we append immediately, but for simplicity let's wait for ACK or just do it

    try {
        const res = await fetch(`${API_URL}/chat/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ recipientId: currentChatUserId, content })
        });
        const newMessage = await res.json();

        if (res.ok) {
            appendMessage(newMessage, true);
            scrollToBottom();
            input.value = '';

            socket.emit('send_message', {
                senderId: user._id,
                recipientId: currentChatUserId,
                content: content,
                _id: newMessage._id,
                createdAt: newMessage.createdAt
            });

            loadConversations();
        }
    } catch (err) {
        console.error("Error sending message", err);
    }
});

// Typing
const messageInput = document.getElementById('messageInput');
let typingTimeout;
messageInput.addEventListener('input', () => {
    if (!currentChatUserId) return;
    socket.emit('typing', { senderId: user._id, recipientId: currentChatUserId });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stop_typing', { senderId: user._id, recipientId: currentChatUserId });
    }, 2000);
});


function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}

// Edit & Delete
let editMsgId = null;
const editModal = document.getElementById('editModal');
const editInput = document.getElementById('editMessageContent');

// Close modal handlers
document.getElementById('closeModalBtn')?.addEventListener('click', () => {
    editModal.classList.remove('open');
});
document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
    editModal.classList.remove('open');
});

window.openEditModal = function (id, content) {
    editMsgId = id;
    editInput.value = content;
    editModal.classList.add('open');
}

window.submitEdit = async function () {
    const newContent = editInput.value;
    if (!newContent) return;

    try {
        const res = await fetch(`${API_URL}/chat/${editMsgId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ content: newContent })
        });

        if (res.ok) {
            const bubble = document.getElementById(`msg-${editMsgId}`);
            if (bubble) bubble.querySelector('.msg-content').textContent = newContent;
            editModal.classList.remove('open');
        } else {
            const d = await res.json();
            alert(d.message);
        }
    } catch (err) {
        console.error(err);
    }
}

window.deleteMessage = async function (id) {
    if (!confirm("Delete this message?")) return;

    try {
        const res = await fetch(`${API_URL}/chat/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const bubble = document.getElementById(`msg-${id}`);
            if (bubble) bubble.remove();
        } else {
            const d = await res.json();
            alert(d.message);
        }
    } catch (err) {
        console.error(err);
    }
}

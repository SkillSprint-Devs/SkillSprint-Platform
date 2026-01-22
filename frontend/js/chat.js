const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
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
    auth: { token: token }
});

// Socket Events
const onlineUsers = new Set();

socket.on('connect', () => {
    socket.emit('join_chat', user._id);
});

socket.on('receive_message', (data) => {
    if (currentChatUserId && (String(data.senderId) === String(currentChatUserId) || String(data.sender) === String(currentChatUserId))) {
        appendMessage(data, false);
        scrollToBottom();
    } else {
        loadConversations();
    }
});

//  Real-time delete listener so messages vanish for the receiver too
socket.on('message_deleted', (messageId) => {
    const bubble = document.getElementById(`msg-${messageId}`);
    if (bubble) bubble.remove();
    loadConversations();
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

document.addEventListener('DOMContentLoaded', () => {
    loadConversations();
    const backBtn = document.getElementById('mobileBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            document.body.classList.remove('chat-open');
            currentChatUserId = null;
        });
    }
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
        } catch (err) { console.error(err); }
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
        item.style.cursor = 'pointer';
        item.innerHTML = `
            <img src="${u.profile_image || 'https://ui-avatars.com/api/?name=' + u.name}" class="user-avatar" style="width:30px;height:30px;">
            <div>
                <div class="fw-bold small">${u.name}</div>
                <div class="text-muted small" style="font-size:0.7rem">${u.email}</div>
            </div>
        `;
        item.addEventListener('click', () => {
            openChat(u);
            document.getElementById('userSearchInput').value = '';
            container.style.display = 'none';
        });
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
            if (conv.unreadCount > 0) {
                const badge = document.createElement("span");
                badge.className = "chat-badge";
                badge.textContent = conv.unreadCount;
                item.appendChild(badge);
            }
            list.appendChild(item);
        });
    } catch (err) { console.error("Error loading conversations", err); }
}

async function openChat(otherUser) {
    currentChatUserId = otherUser._id;
    document.body.classList.add('chat-open');
    document.getElementById('noChatSelected').style.display = 'none';
    const activeView = document.getElementById('activeChatView');
    activeView.style.display = 'flex';

    document.getElementById('chatHeaderName').textContent = otherUser.name;
    document.getElementById('chatHeaderAvatar').src = otherUser.avatarUrl || otherUser.profile_image || 'https://ui-avatars.com/api/?name=' + otherUser.name;
    document.getElementById('typingIndicator').textContent = '';

    updateUserStatus(otherUser._id);
    loadConversations();

    const historyContainer = document.getElementById('chatHistory');
    historyContainer.innerHTML = '<div class="text-center mt-4"><div class="spinner-border text-primary spinner-border-sm"></div></div>';

    try {
        const res = await fetch(`${API_URL}/chat/${otherUser._id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const messages = await res.json();
        historyContainer.innerHTML = '';
        messages.forEach(msg => appendMessage(msg));
        scrollToBottom();
    } catch (err) {
        historyContainer.innerHTML = '<div class="text-center text-danger">Failed to load history</div>';
    }
}

function appendMessage(msg) {
    const historyContainer = document.getElementById('chatHistory');
    const myId = user._id;
    const senderId = msg.sender?._id || msg.sender || msg.senderId;
    const isMe = String(senderId) === String(myId);

    const date = new Date(msg.createdAt || Date.now());
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isMe ? 'message-sent' : 'message-received'}`;
    
    if (msg._id) bubble.id = `msg-${msg._id}`;

    let actionsHtml = '';
    if (isMe && msg._id) {
        actionsHtml = `
            <div class="msg-actions">
                <span class="action-btn edit-btn" title="Edit" onclick="window.handleEdit('${msg._id}', this)">
                    <i class="fa-solid fa-pen"></i>
                </span>
                <span class="action-btn text-danger delete-btn" title="Delete" onclick="event.stopPropagation();window.handleDelete('${msg._id}')">
                    <i class="fa-solid fa-trash"></i>
                </span>
            </div>
        `;
    }

    bubble.innerHTML = `
        ${actionsHtml}
        <div class="msg-content">${msg.content}</div>
        <span class="message-time">${timeStr}</span>
        ${isMe ? '<div class="message-status">Delivered</div>' : ''}
    `;

    if (isMe) {
        bubble.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.msg-actions.show').forEach(el => el.classList.remove('show'));
            const actions = bubble.querySelector('.msg-actions');
            if (actions) actions.classList.toggle('show');
        });
    }
    historyContainer.appendChild(bubble);
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.message-bubble')) {
        document.querySelectorAll('.msg-actions.show').forEach(el => el.classList.remove('show'));
    }
});

window.handleDelete = function (id) {
    if (!id || id === 'undefined') return alert("Error: Missing Message ID");
    deleteMessage(id);
};

window.handleEdit = function (id, btnElement) {
    const bubble = document.getElementById(`msg-${id}`);
    const content = bubble ? bubble.querySelector('.msg-content').textContent : "";
    openEditModal(id, content);
    if (btnElement) btnElement.closest('.msg-actions').classList.remove('show');
};

function scrollToBottom() {
    const historyContainer = document.getElementById('chatHistory');
    historyContainer.scrollTop = historyContainer.scrollHeight;
}

document.getElementById('messageForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    if (!content || !currentChatUserId) return;

    socket.emit('stop_typing', { senderId: user._id, recipientId: currentChatUserId });

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
            appendMessage(newMessage);
            scrollToBottom();
            input.value = '';
            socket.emit('send_message', { ...newMessage, recipientId: currentChatUserId });
            loadConversations();
        }
    } catch (err) { console.error(err); }
});

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

let editMsgId = null;
const editModal = document.getElementById('editModal');
const editInput = document.getElementById('editMessageContent');

window.openEditModal = function (id, content) {
    editMsgId = id;
    editInput.value = content;
    editModal.classList.add('open');
};

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
        }
    } catch (err) { console.error(err); }
};

window.deleteMessage = async function (id) {
    if (!confirm("Delete this message?")) return;
    try {
        // Delete logic
        const res = await fetch(`${API_URL}/chat/delete/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const bubble = document.getElementById(`msg-${id}`);
            if (bubble) bubble.remove();
            
            //  Socket emit so the other person's screen updates instantly
            socket.emit('delete_message', { messageId: id, recipientId: currentChatUserId });
            loadConversations();
        } else {
            const d = await res.json();
            alert(`Delete Failed: ${d.message}`);
        }
    } catch (err) { console.error(err); }
};

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}
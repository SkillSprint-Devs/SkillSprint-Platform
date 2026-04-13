(function () {
    'use strict';

    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const API_URL = window.API_BASE_URL;

    if (!token || !user) {
        window.location.href = 'login.html';
        return;
    }

    // Setup User Info
    document.getElementById('myName').textContent = user.name;
    const myAvatar = document.getElementById('myAvatar');
    if (myAvatar) {
        myAvatar.src = user.profile_image || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`;
    }

    // Global State
    let currentChatUserId = null;
    let debounceTimer;
    const SOCKET_URL = window.API_SOCKET_URL;

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
            appendMessage(data);
            scrollToBottom();
        } else {
            loadConversations();
        }
    });

    socket.on('message_deleted', (messageId) => {
        const bubble = document.getElementById(`msg-${messageId}`);
        if (bubble) bubble.remove();
        loadConversations();
    });

    socket.on('message_edited', ({ _id, content }) => {
        const bubble = document.getElementById(`msg-${_id}`);
        if (bubble) {
            const contentEl = bubble.querySelector('.msg-content');
            if (contentEl) contentEl.innerHTML = linkify(escapeHtml(content));
            if (!bubble.querySelector('.edited-label')) {
                const label = document.createElement('small');
                label.className = 'edited-label text-muted';
                label.style.fontSize = '0.65rem';
                label.style.marginLeft = '5px';
                label.textContent = '(Edited)';
                bubble.querySelector('.message-time').after(label);
            }
        }
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

    socket.on('messages_read', ({ readerId }) => {
        if (currentChatUserId === readerId) {
            markMessagesAsRead();
        }
    });

    function markMessagesAsRead() {
        const bubbles = document.querySelectorAll('.message-bubble.message-sent .message-status');
        bubbles.forEach(el => {
            el.innerHTML = `
                <span class="status-tick double-tick">
                    <i class="fa-solid fa-check-double"></i>
                </span>
            `;
            el.title = "Seen";
        });
    }

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

    async function loadConversations() {
        try {
            const res = await fetch(`${API_URL}/chat/conversations/recent`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            let data = await res.json();
            data.sort((a, b) => {
                const dateA = a.lastMessage ? new Date(a.lastMessage.createdAt) : 0;
                const dateB = b.lastMessage ? new Date(b.lastMessage.createdAt) : 0;
                return dateB - dateA;
            });

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
                    <div class="user-avatar-container">
                        <img src="${userDetails.profile_image || 'https://ui-avatars.com/api/?name=' + userDetails.name}" class="user-avatar">
                        <span class="online-indicator ${onlineUsers.has(userDetails._id) ? 'online' : ''}"></span>
                    </div>
                    <div class="flex-grow-1">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="mb-0 text-truncate chat-name">${userDetails.name}</h6>
                            <small class="text-muted" style="font-size: 0.7rem;">
                                ${conv.lastMessage ? new Date(conv.lastMessage.createdAt).toLocaleDateString() : ''}
                            </small>
                        </div>
                        <small class="text-muted text-truncate d-block">${lastMsg}</small>
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
        document.getElementById('chatHeaderAvatar').src = otherUser.profile_image || 'https://ui-avatars.com/api/?name=' + otherUser.name;
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

    function escapeHtml(s) {
        if (!s) return "";
        return s.replace(/[&<>"'`]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' })[m]);
    }

    function linkify(text) {
        if (!text) return "";
        const urlPattern = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
        return text.replace(urlPattern, (url) => {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link">${url}</a>`;
        });
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
        const msgId = msg._id || msg.id;
        if (msgId) bubble.id = `msg-${msgId}`;

        let actionsHtml = '';
        if (isMe && msgId) {
            actionsHtml = `
                <div class="message-actions">
                    <button class="msg-action-btn edit-msg" title="Edit message"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="msg-action-btn delete-msg" title="Delete message"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
        }

        const isRead = msg.read === true;
        const statusHtml = isMe ? `
            <div class="message-status" title="${isRead ? 'Seen' : 'Sent'}">
                <span class="status-tick ${isRead ? 'double-tick' : 'single-tick'}">
                    <i class="fa-solid ${isRead ? 'fa-check-double' : 'fa-check'}"></i>
                </span>
            </div>
        ` : '';

        bubble.innerHTML = `
            <div class="message-header">${actionsHtml}</div>
            <div class="msg-content">${linkify(escapeHtml(msg.content))}</div>
            <div class="message-info">
                <span class="message-time">${timeStr}</span>
                ${msg.isEdited ? '<small class="edited-label">(Edited)</small>' : ''}
                ${statusHtml}
            </div>
        `;

        if (isMe && msgId) {
            bubble.querySelector('.edit-msg').onclick = () => {
                const newContent = prompt("Edit message:", msg.content);
                if (newContent && newContent.trim() !== msg.content) {
                    submitChatEdit(msgId, newContent.trim());
                }
            };
            bubble.querySelector('.delete-msg').onclick = () => {
                if (confirm("Delete message?")) {
                    submitChatDelete(msgId);
                }
            };
        }

        historyContainer.appendChild(bubble);
    }

    async function submitChatEdit(id, content) {
        try {
            const res = await fetch(`${API_URL}/chat/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content })
            });
            if (res.ok) {
                socket.emit('edit_message', { _id: id, content, recipientId: currentChatUserId });
                loadConversations();
                // Local UI update
                const bubble = document.getElementById(`msg-${id}`);
                if (bubble) {
                    bubble.querySelector('.msg-content').innerHTML = linkify(escapeHtml(content));
                    if (!bubble.querySelector('.edited-label')) {
                        bubble.querySelector('.message-time').insertAdjacentHTML('afterend', '<small class="edited-label">(Edited)</small>');
                    }
                }
            }
        } catch (err) { console.error(err); }
    }

    async function submitChatDelete(id) {
        try {
            const res = await fetch(`${API_URL}/chat/delete/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const bubble = document.getElementById(`msg-${id}`);
                if (bubble) bubble.remove();
                socket.emit('delete_message', { messageId: id, recipientId: currentChatUserId });
                loadConversations();
            }
        } catch (err) { console.error(err); }
    }

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

    // Mobile Back Button
    const backBtn = document.getElementById('mobileBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            document.body.classList.remove('chat-open');
            currentChatUserId = null;
        });
    }

    // Initial Load
    loadConversations();

    // Deep-link handling
    const deepUserId = new URLSearchParams(window.location.search).get('user');
    if (deepUserId) {
        fetch(`${API_URL}/users/${deepUserId}/public`, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(res => res.json()).then(userData => {
            openChat({ _id: deepUserId, name: userData.name, profile_image: userData.profile_image });
        }).catch(e => console.warn('[Chat] Deep-link failed:', e));
    }

    // Expose necessary globals
    window.goToMyProfile = function() {
        window.location.href = `public-profile.html?user=${user._id || user.id}`;
    };

    window.handleChatSearch = (query) => {
        query = query.trim();
        clearTimeout(debounceTimer);
        if (query.length < 2) {
            const resContainer = document.getElementById('searchResults');
            if (resContainer) resContainer.style.display = 'none';
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
    };

    function renderSearchResults(users) {
        const container = document.getElementById('searchResults');
        if (!container) return;
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

})();

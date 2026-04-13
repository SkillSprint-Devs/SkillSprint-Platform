const API_BASE = window.API_BASE_URL;

document.addEventListener("DOMContentLoaded", () => {
    loadWalletData();
});

async function loadWalletData() {
    const token = localStorage.getItem("token");
    if (!token) {
        window.location.href = "login.html";
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/wallet/overview`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) throw new Error("Failed to load wallet data.");
        const data = await res.json();

        renderOverview(data);
        renderHistory(data.history);
        setupFilters(data.history);
        setupRequestAction();
        setupClearAction();


        // Update User info
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        if (user.profile_image && document.getElementById("profileAvatar")) {
            document.getElementById("profileAvatar").src = user.profile_image;
        }

    } catch (err) {
        console.error(err);
        if (typeof showToast === 'function') showToast("Error loading wallet", "error");
    }
}

function renderOverview(data) {
    const { wallet, summary } = data;

    document.getElementById("availableCredits").textContent = formatMinutes(wallet.available_credits);
    document.getElementById("weeklyLimit").textContent = formatMinutes(wallet.weekly_limit);
    document.getElementById("lastReset").textContent = new Date(wallet.last_reset_date).toLocaleDateString();
    document.getElementById("nextReset").textContent = new Date(wallet.next_reset_date).toLocaleDateString();

    const creditStatus = document.getElementById("creditStatus");
    if (wallet.available_credits < 60) {
        creditStatus.textContent = "Low Balance";
        creditStatus.className = "status-badge danger";
    } else if (wallet.available_credits === 0) {
        creditStatus.textContent = "Empty";
        creditStatus.className = "status-badge empty";
    } else {
        creditStatus.textContent = "Sufficient";
        creditStatus.className = "status-badge success";
    }

    // Countdown
    const diff = new Date(wallet.next_reset_date) - new Date();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    document.getElementById("resetCountdown").textContent = `Resets in ${days} day${days !== 1 ? 's' : ''}`;
}

function renderHistory(transactions) {
    const tbody = document.getElementById("transactionHistory");
    const emptyState = document.getElementById("emptyHistory");
    tbody.innerHTML = "";

    if (!transactions || transactions.length === 0) {
        emptyState.style.display = "block";
        return;
    }
    emptyState.style.display = "none";

    transactions.forEach(t => {
        const tr = document.createElement("tr");

        const typeClass = t.type;
        const amountPrefix = t.type === "session-earn" || t.type === "weekly-reset" ? "+" : "-";
        const amountClass = t.type === "session-earn" ? "amount-earn" : t.type === "session-spend" ? "amount-spend" : "amount-reset";

        const sessionIdVal = t.sessionId ? (typeof t.sessionId === 'string' ? t.sessionId.substring(0, 8) : (t.sessionId._id ? t.sessionId._id.substring(0, 8) : '---')) : '---';
        const sessionNameVal = t.sessionName || (t.sessionId?.sessionName) || "N/A";
        const menteesInfo = (t.role === 'mentor' && t.sessionId?.invitedUserIds && Array.isArray(t.sessionId.invitedUserIds))
            ? `<small>Mentees: ${t.sessionId.invitedUserIds.filter(u => u && u.name).map(u => u.name).join(', ') || '0'}</small>`
            : (t.mentorName ? `<small>Mentor: ${t.mentorName}</small>` : '');

        tr.innerHTML = `
            <td><span class="type-badge ${typeClass}">${formatType(t.type)}</span></td>
            <td>
                <div class="session-info">
                    <strong>${sessionNameVal}</strong>
                    <span class="session-id">ID: ${sessionIdVal}</span>
                </div>
            </td>
            <td><span class="role-text">${t.role || 'System'}</span></td>
            <td><span class="${amountClass}">${amountPrefix}${t.amount} min</span></td>
            <td>
                <div class="date-info">
                    <span>${new Date(t.timestamp).toLocaleDateString()}</span>
                    <small>${new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                </div>
            </td>
            <td>
                <div class="detail-info">
                    ${t.durationMinutes ? `<span>Dur: ${t.durationMinutes}m</span>` : ''}
                    ${menteesInfo}
                </div>
            </td>
            <td>
                <button class="delete-trans-btn" onclick="deleteTransaction('${t._id}')" title="Delete record">
                   <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function setupFilters(allTransactions) {
    const buttons = document.querySelectorAll(".filter-btn");
    buttons.forEach(btn => {
        btn.addEventListener("click", () => {
            buttons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const filter = btn.dataset.filter;
            if (filter === "all") {
                renderHistory(allTransactions);
            } else {
                renderHistory(allTransactions.filter(t => t.type === filter));
            }
        });
    });
}

function setupRequestAction() {
    const card = document.getElementById("requestCreditsCard");
    if (card) {
        card.addEventListener("click", () => {
            if (typeof showToast === 'function') {
                showToast("Request feature is coming soon! For now, please contact admin directly.", "info");
            }
        });
    }
}

function setupClearAction() {
    const btn = document.getElementById("clearHistoryBtn");
    if (btn) {
        btn.onclick = async () => {
            const confirmed = await showConfirm(
                "Clear Wallet History?",
                "This will permanently remove all logs from your transaction history. Your current credit balance will not be affected.",
                "Yes, Clear All",
                true // isDanger
            );
            
            if (confirmed) {
                clearWalletHistory();
            }
        };
    }
}

async function deleteTransaction(id) {
    const confirmed = await showConfirm(
        "Delete Transaction?",
        "Are you sure you want to remove this record from your history?",
        "Delete",
        false 
    );

    if (confirmed) {
        executeDeletion(id);
    }
}

async function executeDeletion(id) {
    const token = localStorage.getItem("token");
    try {
        const res = await fetch(`${API_BASE}/wallet/history/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
            if (typeof showToast === 'function') showToast("Record removed", "success");
            loadWalletData(); // Refresh
        } else {
            throw new Error("Delete failed");
        }
    } catch (err) {
        if (typeof showToast === 'function') showToast("Failed to delete record", "error");
    }
}

async function clearWalletHistory() {
    const token = localStorage.getItem("token");
    try {
        const res = await fetch(`${API_BASE}/wallet/history/clear`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
            if (typeof showToast === 'function') showToast("History cleared", "success");
            loadWalletData(); // Refresh
        } else {
            throw new Error("Clear failed");
        }
    } catch (err) {
        if (typeof showToast === 'function') showToast("Failed to clear history", "error");
    }
}

function formatMinutes(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
}

function formatType(type) {
    if (!type) return "N/A";
    return type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}


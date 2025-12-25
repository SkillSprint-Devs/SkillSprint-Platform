const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
    ? 'http://localhost:5000/api'
    : '/api';

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

        tr.innerHTML = `
            <td><span class="type-badge ${typeClass}">${formatType(t.type)}</span></td>
            <td>
                <div class="session-info">
                    <strong>${t.sessionName || "N/A"}</strong>
                    <span class="session-id">ID: ${t.sessionId ? t.sessionId.substring(0, 8) : '---'}</span>
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
                    ${t.role === 'mentor' && t.sessionId?.invitedUserIds
                ? `<small>Mentees: ${t.sessionId.invitedUserIds.map(u => u.name).join(', ') || '0'}</small>`
                : t.mentorName ? `<small>Mentor: ${t.mentorName}</small>` : ''}
                </div>
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

function formatMinutes(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
}

function formatType(type) {
    return type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}


let allAchievements = [];

document.addEventListener("DOMContentLoaded", () => {
    fetchAchievements();
});

async function fetchAchievements() {
    try {
        const token = localStorage.getItem("token");
        if (!token) {
            window.location.href = "login.html";
            return;
        }

        const response = await fetch("/api/certificates/achievements", {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error("Failed to fetch achievements");
        }

        const data = await response.json();
        allAchievements = data.achievements;
        renderAchievements(allAchievements);
    } catch (error) {
        console.error("Error fetching achievements:", error);
        showToast("Error loading achievements", "error");
    }
}

function renderAchievements(achievements) {
    const badgesGrid = document.getElementById("badges-grid");
    const certificatesGrid = document.getElementById("certificates-grid");

    badgesGrid.innerHTML = "";
    certificatesGrid.innerHTML = "";

    const badges = achievements.filter(a => a.type === "badge");
    const certificates = achievements.filter(a => a.type === "certificate");

    if (badges.length === 0) {
        badgesGrid.innerHTML = `<div class="empty-msg">No badges earned yet. Complete Basic and Intermediate levels to earn badges!</div>`;
    } else {
        badges.forEach(badge => {
            badgesGrid.appendChild(createAchievementCard(badge));
        });
    }

    if (certificates.length === 0) {
        certificatesGrid.innerHTML = `<div class="empty-msg">No certificates earned yet. Pass all levels of a course to receive your certificate!</div>`;
    } else {
        certificates.forEach(cert => {
            certificatesGrid.appendChild(createAchievementCard(cert));
        });
    }
}

function createAchievementCard(ach) {
    const card = document.createElement("div");
    card.className = `achievement-card ${ach.tier || "certificate"}`;

    const date = new Date(ach.awardedAt).toLocaleDateString("en-US", {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    const isCertificate = ach.type === "certificate";
    const icon = isCertificate ? "fa-certificate" : "fa-medal";

    card.innerHTML = `
        <div class="card-header">
            <i class="fa-solid ${icon} achievement-icon"></i>
            <span class="achievement-title">${ach.title}</span>
        </div>
        <div class="course-name">${ach.courseName}</div>
        <p class="achievement-desc">${ach.description}</p>
        ${ach.reason ? `<p class="achievement-reason"><strong>Reason:</strong> ${ach.reason}</p>` : ""}
        ${isCertificate && ach.verificationId ? `
            <div class="cert-meta">
                <p><strong>Score:</strong> ${ach.overallScore}%</p>
                <p><strong>ID:</strong> ${ach.verificationId.substring(0, 8)}...</p>
                <a href="/api/certificates/verify/${ach.verificationId}" target="_blank" class="verify-link">Verify Certificate</a>
            </div>
        ` : ""}
        <div class="card-footer">
            <span>Awarded on:</span>
            <span>${date}</span>
        </div>
    `;

    return card;
}

function showToast(message, type = "info") {
    if (window.showToast) {
        window.showToast(message, type);
    } else {
        console.log(`Toast (${type}): ${message}`);
    }
}
// ============================================================
// SEARCH FILTERING
// ============================================================
window.handleAchievementsSearch = function (term) {
    const query = (term || "").toLowerCase().trim();
    if (!query) {
        renderAchievements(allAchievements);
        return;
    }

    const filtered = allAchievements.filter(ach =>
        (ach.title || "").toLowerCase().includes(query) ||
        (ach.courseName || "").toLowerCase().includes(query) ||
        (ach.description || "").toLowerCase().includes(query)
    );

    renderAchievements(filtered);
};

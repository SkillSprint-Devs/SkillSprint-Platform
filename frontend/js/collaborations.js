
// js/collaborations.js

document.addEventListener("DOMContentLoaded", async () => {
    window.API_BASE = window.API_BASE_URL;

    const token = localStorage.getItem("token");
    if (!token) return;

    await loadPendingInvites(token);
    // Re-run the existing loaders if we were imported into the main file, 
    // but better to keep this modular or merge. 
    // For now, let's assume collaborations.html includes this script.
});

async function loadPendingInvites(token) {
    const container = document.getElementById("invitationList");
    // Only proceed if the container exists (we need to add it to HTML first)
    if (!container) return;

    container.innerHTML = "<div class='empty-msg'>Checking invitations...</div>";

    try {
        const res = await fetch(`${window.API_BASE}/invitations/pending`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const invites = await res.json();

        container.innerHTML = "";

        if (!Array.isArray(invites) || invites.length === 0) {
            document.getElementById("invitationHeading").style.display = "none";
            return;
        }

        document.getElementById("invitationHeading").style.display = "block";

        invites.forEach(invite => {
            container.appendChild(createInviteCard(invite, token));
        });

    } catch (err) {
        console.error("Error loading invites", err);
        container.innerHTML = "<div class='empty-msg text-error'>Failed to load invitations</div>";
    }
}

function createInviteCard(invite, token) {
    const card = document.createElement("div");
    card.className = "collab-card invite-card";
    // Add a border left or specific style for invites?
    card.style.borderLeft = "4px solid var(--accent, #DCEF62)";

    const senderName = invite.sender?.name || "Unknown";
    const senderImg = invite.sender?.profile_image || "assets/images/user-avatar.png";
    const dateStr = new Date(invite.createdAt).toLocaleDateString();

    card.innerHTML = `
    <div class="card-header">
       <div style="display:flex; align-items:center; gap:12px;">
          <img src="${senderImg}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">
          <div>
            <h3 class="card-title" style="font-size:1.1rem;">${invite.projectName}</h3>
            <span style="font-size:0.8rem; color:#666;">Invited by ${senderName}</span>
          </div>
       </div>
    </div>
    
    <div class="card-body">
        <div class="meta-row">
            <span class="role-badge" style="background:#eee; color:#333;">${invite.permission}</span>
            <span>${invite.projectType} Project</span>
        </div>
        <div class="meta-row">
            <span style="font-size:0.8rem; color:#888;">Invited on ${dateStr}</span>
        </div>
    </div>

    <div class="card-footer" style="justify-content: flex-end; gap: 12px;">
       <button class="btn-decline" style="padding: 8px 16px; border-radius: 8px; border: 1px solid #ff4d4d; color: #ff4d4d; background: transparent; cursor: pointer; transition: all 0.2s;">Decline</button>
       <button class="btn-accept" style="padding: 8px 16px; border-radius: 8px; border: none; background: var(--accent, #DCEF62); color: #1a1a1a; font-weight: 600; cursor: pointer; transition: all 0.2s;">Accept</button>
    </div>
  `;

    // Actions
    const acceptBtn = card.querySelector(".btn-accept");
    const declineBtn = card.querySelector(".btn-decline");

    acceptBtn.onclick = async () => {
        acceptBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        acceptBtn.disabled = true;
        try {
            const res = await fetch(`${window.API_BASE}/invitations/${invite._id}/accept`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                showToast("Invitation Accepted!", "success");
                // Add without reload:
                // Ideally fetch that single project and append to the list
                // For simplicity, verify reload works or just trigger re-fetch of lists
                if (typeof window.loadWhiteboards === 'function' && invite.projectType === 'Board') {
                    await window.loadWhiteboards(token);
                } else if (typeof window.loadPairProgramming === 'function' && invite.projectType === 'PairProgramming') {
                    await window.loadPairProgramming(token);
                }
                card.remove();
                // Hide section if empty
                const list = document.getElementById("invitationList");
                if (!list.hasChildNodes()) {
                    document.getElementById("invitationHeading").style.display = "none";
                }
            } else {
                showToast(data.message || "Failed to accept", "error");
                acceptBtn.innerHTML = "Accept";
                acceptBtn.disabled = false;
            }
        } catch (err) {
            showToast(err.message, "error");
            acceptBtn.innerHTML = "Accept";
        }
    };

    declineBtn.onclick = async () => {
        if (!confirm("Decline this invitation?")) return;
        declineBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        try {
            const res = await fetch(`${window.API_BASE}/invitations/${invite._id}/decline`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                showToast("Invitation Declined", "info");
                card.remove();
                const list = document.getElementById("invitationList");
                if (!list.hasChildNodes()) {
                    document.getElementById("invitationHeading").style.display = "none";
                }
            }
        } catch (err) {
            showToast("Error declining", "error");
        }
    };

    return card;
}

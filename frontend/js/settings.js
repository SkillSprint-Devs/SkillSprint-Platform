document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // --- State ---
    let currentUser = null;
    let selectedPace = 'Normal';
    let selectedDepth = 'Balanced';

    // --- Elements ---
    const passwordForm = document.getElementById('passwordForm');
    const emailForm = document.getElementById('emailForm');

    // Privacy Toggles
    const toggleSkills = document.getElementById('toggleSkills');
    const toggleStreaks = document.getElementById('toggleStreaks');
    const toggleAchievements = document.getElementById('toggleAchievements');

    // Prefs
    const paceOptions = document.getElementById('paceOptions');
    const depthOptions = document.getElementById('depthOptions');
    const toggleNotifications = document.getElementById('toggleNotifications');
    const savePreferencesBtn = document.getElementById('savePreferencesBtn');

    // Danger
    const deactivateBtn = document.getElementById('deactivateBtn');
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');


    // --- Init ---
    await loadSettings();


    // --- Functions ---

    async function loadSettings() {
        try {
            const res = await fetch(`${window.API_BASE_URL}/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to load user");
            currentUser = await res.json();

            // Populate Privacy
            if (currentUser.privacy) {
                toggleSkills.checked = currentUser.privacy.showSkills !== false;
                toggleStreaks.checked = currentUser.privacy.showStreaks !== false;
                toggleAchievements.checked = currentUser.privacy.showAchievements !== false;
            }

            // Populate Prefs
            if (currentUser.learning_preferences) {
                selectedPace = currentUser.learning_preferences.pace || 'Normal';
                selectedDepth = currentUser.learning_preferences.depth || 'Balanced';

                updateOptionUI(paceOptions, selectedPace);
                updateOptionUI(depthOptions, selectedDepth);
            }

            // Notifications
            toggleNotifications.checked = currentUser.notifications !== false;

        } catch (err) {
            console.error(err);
            showToast("Failed to load settings", "error");
        }
    }

    function updateOptionUI(container, value) {
        Array.from(container.children).forEach(card => {
            if (card.dataset.value === value) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });
    }

    function attachOptionListeners(container, type) {
        Array.from(container.children).forEach(card => {
            card.addEventListener('click', () => {
                const val = card.dataset.value;
                if (type === 'pace') selectedPace = val;
                if (type === 'depth') selectedDepth = val;
                updateOptionUI(container, val);
            });
        });
    }

    attachOptionListeners(paceOptions, 'pace');
    attachOptionListeners(depthOptions, 'depth');


    // --- Toggle Handlers (Auto Save for Privacy) ---
    // Helper to auto-save privacy settings when toggled
    async function savePrivacy() {
        if (!currentUser) return;
        const privacy = {
            showSkills: toggleSkills.checked,
            showStreaks: toggleStreaks.checked,
            showAchievements: toggleAchievements.checked
        };
        // Also save text preferences/depth? No, backend route structure:
        // /update-profile accepts privacy: JSON string.

        // We only want to update privacy here, but route updates everything found.
        // It's safer to use the bulk update for Preferences button, 
        // but for single toggles user expects instant save?
        // Let's implement instant save.

        try {
            const formData = new FormData();
            formData.append('privacy', JSON.stringify(privacy));

            const res = await fetch(`${window.API_BASE_URL}/auth/update-profile`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!res.ok) throw new Error("Failed to update");
            showToast("Privacy settings updated", "success");
        } catch (err) {
            console.error(err);
            showToast("Error updating privacy", "error");
        }
    }

    toggleSkills.addEventListener('change', savePrivacy);
    toggleStreaks.addEventListener('change', savePrivacy);
    toggleAchievements.addEventListener('change', savePrivacy);


    // --- Save Preferences ---
    savePreferencesBtn.addEventListener('click', async () => {
        if (!currentUser) {
            showToast("User data not loaded. Cannot save.", "error");
            return;
        }
        try {
            const formData = new FormData();

            const learning_preferences = {
                style: currentUser.learning_preferences?.style || 'Practice-first', // preserve existing if possible, or default
                depth: selectedDepth,
                pace: selectedPace
            };
            formData.append('learning_preferences', JSON.stringify(learning_preferences));
            formData.append('notifications', toggleNotifications.checked);

            const res = await fetch(`${window.API_BASE_URL}/auth/update-profile`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!res.ok) throw new Error("Failed to update preferences");
            showToast("Preferences saved!", "success");
        } catch (err) {
            console.error(err);
            showToast("Error saving preferences", "error");
        }
    });


    // --- Change Password ---
    passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;

        try {
            const res = await fetch(`${window.API_BASE_URL}/auth/change-password`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            showToast("Password updated successfully", "success");
            passwordForm.reset();
        } catch (err) {
            showToast(err.message, "error");
        }
    });

    // --- Change Email ---
    emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newEmail = document.getElementById('newEmail').value;
        const password = document.getElementById('emailPasswordConfirm').value;

        try {
            const res = await fetch(`${window.API_BASE_URL}/auth/change-email`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ newEmail, password })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            showToast("Email updated. Please log in again.", "success");
            setTimeout(() => {
                localStorage.removeItem('token');
                window.location.href = 'login.html';
            }, 1000);
        } catch (err) {
            showToast(err.message, "error");
        }
    });


    // --- Danger Zone ---
    deactivateBtn.addEventListener('click', async () => {
        if (!await showConfirm("Deactivate Account?", "Are you sure you want to deactivate your account? You will be logged out.", "Deactivate", true)) return;

        try {
            const res = await fetch(`${window.API_BASE_URL}/auth/deactivate-account`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed");

            localStorage.removeItem('token');
            window.location.href = 'login.html';
        } catch (err) {
            showToast("Error deactivating account", "error");
        }
    });

    deleteAccountBtn.addEventListener('click', async () => {
        if (!await showConfirm(
            "Delete Account Permanently?",
            "WARNING: This will PERMANENTLY delete your account and all data. This action cannot be undone. Are you absolutely sure?",
            "Yes, Delete",
            true
        )) return;

        // Double confirmation
        const confirmation = prompt("Type 'DELETE' to confirm.");
        if (confirmation !== 'DELETE') return;

        try {
            const res = await fetch(`${window.API_BASE_URL}/auth/delete-account`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed");

            localStorage.removeItem('token');
            alert("Your account has been deleted.");
            window.location.href = 'signup.html';
        } catch (err) {
            showToast("Error deleting account", "error");
            console.error(err);
        }
    });

    // Toast helper if not globally available, though included in HTML
    function showToast(message, type = 'info') {
        if (window.Toast) {
            window.Toast[type](message);
        } else {
            alert(message);
        }
    }

});

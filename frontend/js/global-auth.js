/**
 * global-auth.js
 * Handles global user state synchronization across tabs and updates common UI elements.
 */

(function () {
    // Prevent multiple executions
    if (window.GlobalAuthInitialized) return;
    window.GlobalAuthInitialized = true;

    const IDS = {
        avatar: ["profileAvatar", "userAvatar", "creatorAvatar", "creatorAvatarSmall", "navbarProfileImage"],
        name: ["username", "usernameTop", "profileName"],
        role: ["profileRole", "profilePosition"],
        stats: {
            followers: "connectionsCount",
            following: "followingCount"
        }
    };

    /**
     * Updates UI elements based on user data
     * @param {Object} user 
     */
    function updateUI(user) {
        if (!user) return;

        const profileImgUrl = user.profile_image
            ? (user.profile_image.startsWith("http") ? user.profile_image : `/${user.profile_image}`)
            : "assets/images/user-avatar.png";

        // Update Avatars
        IDS.avatar.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                // Prevent unnecessary reload (flicker)
                if (el.src && !el.src.endsWith(profileImgUrl) && !profileImgUrl.startsWith("/")) {
                    el.src = profileImgUrl;
                } else if (el.getAttribute("src") !== profileImgUrl) {
                    el.src = profileImgUrl;
                }
            }
        });

        // Update Names
        IDS.name.forEach(id => {
            const el = document.getElementById(id);
            if (el && user.name) el.textContent = user.name;
        });

        // Update Roles
        IDS.role.forEach(id => {
            const el = document.getElementById(id);
            if (el && user.role) el.textContent = user.role;
        });

        // Update Stats
        if (user.followers_count !== undefined) {
            const el = document.getElementById(IDS.stats.followers);
            if (el) el.textContent = user.followers_count;
        }
        if (user.following_count !== undefined) {
            const el = document.getElementById(IDS.stats.following);
            if (el) el.textContent = user.following_count;
        }
    }

    /**
     * Load user from LocalStorage and update UI
     */
    function loadFromStorage() {
        try {
            const userStr = localStorage.getItem("user");
            if (userStr) {
                const user = JSON.parse(userStr);
                updateUI(user);
            }
        } catch (e) {
            console.error("GlobalAuth: Failed to load user", e);
        }
    }

    // Initial Load
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", loadFromStorage);
    } else {
        loadFromStorage();
    }

    // Listen for updates from other tabs
    window.addEventListener("storage", (e) => {
        if (e.key === "user" && e.newValue) {
            console.log("[GlobalAuth] User updated from another tab");
            updateUI(JSON.parse(e.newValue));
        }
    });

    // Expose global function for current tab updates
    window.updateGlobalUserUI = function (user) {
        if (!user) return;
        localStorage.setItem("user", JSON.stringify(user));
        updateUI(user);
        // Dispatch storage event manually for current tab listeners (if any exist)
        // Note: window.addEventListener('storage') only triggers for OTHER tabs.
        // We can dispatch a custom event if needed, but direct UI update handles it.
    };

    console.log("[GlobalAuth] Initialized");
})();

// --- HELPER CONFIG ---
function getApiConfig() {
    const API_BASE = window.API_BASE_URL;
    const token = localStorage.getItem("token");
    return { API_BASE, token };
}

// DELETE FUNCTION (Exposed globally for inline onclick)
window.deleteLibraryItem = async function (id) {
    // Direct delete - No confirmation to avoid browser dialog issues
    const { API_BASE, token } = getApiConfig();

    if (!token) {
        showToast("Authentication error: Please login again", "error");
        return;
    }

    if (!id) {
        showToast("Error: Invalid item ID", "error");
        return;
    }

    // Custom confirmation
    if (!await showConfirm("Delete Item?", "Are you sure you want to delete this file? This action cannot be undone.", "Delete", true)) return;

    const card = document.querySelector(`[data-item-id="${id}"]`);
    if (card) {
        card.style.opacity = "0.5";
        card.style.pointerEvents = "none";
    }

    try {
        const res = await fetch(`${API_BASE}/library/${id}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (res.ok || res.status === 204) {
            showToast("Item deleted", "success");

            // Animate and remove
            if (card) {
                card.remove();
            }

            // We need to access libraryItems to update it, but it's inside the DOMContentLoaded scope.
            // This is a tradeoff. We can trigger a custom event or just accept the list might be slightly out of sync until refersh.
            // Or simpler: Just re-fetch if we really want to be sure, calling a global fetch if available, or just reloading page.

            // Minimal approach: remove from DOM is enough for user feedback.
            // Ideally we'd call window.refreshLibrary() if we exposed it.
            // Verify libraryItems exists before filtering
            if (typeof libraryItems !== 'undefined' && Array.isArray(libraryItems)) {
                libraryItems = libraryItems.filter(item => item._id !== id);
                renderLibrary(); // Re-render to update counts/view
            } else if (window.fetchLibraryItems) {
                window.fetchLibraryItems(); // Fallback if internal array not accessible
            }

        } else {
            const data = await res.json();
            showToast(data.message || "Failed to delete", "error");
            if (card) {
                card.style.opacity = "1";
                card.style.pointerEvents = "auto";
            }
        }
    } catch (err) {
        console.error(err);
        // showToast("Network error during delete", "error");
        alert("Error: " + err.message);
        if (card) {
            card.style.opacity = "1";
            card.style.pointerEvents = "auto";
        }
    }
};

document.addEventListener("DOMContentLoaded", () => {
    // Expose fetch for external use
    window.fetchLibraryItems = fetchLibraryItems;

    const { API_BASE, token } = getApiConfig();
    // ... (rest of the file uses these consts safely)
    let currentCategory = "All";
    let currentVisibility = "All";
    let currentView = "grid";

    // --- STREAK TRACKING ---
    let scrollTime = 0;
    let isTracking = false;
    let streakLogged = false;

    // --- ELEMENTS ---
    const libraryGrid = document.getElementById("libraryGrid");
    const emptyState = document.getElementById("emptyState");
    const categoryItems = document.querySelectorAll(".category-list li[data-category]");
    const visibilityItems = document.querySelectorAll(".category-list li[data-visibility]");
    const searchInput = document.getElementById("librarySearch");
    const currentCategoryTitle = document.getElementById("currentCategoryTitle");

    const uploadModal = document.getElementById("uploadModal");
    const openUploadBtn = document.getElementById("openUploadModal");
    const closeUploadBtn = document.getElementById("closeUploadModal");
    const uploadForm = document.getElementById("uploadForm");
    const dropZone = document.getElementById("dropZone");
    const fileInput = document.getElementById("fileInput");
    const filePreview = document.getElementById("filePreview");

    // --- GLOBAL EVENT DELEGATION ---
    // --- GLOBAL EVENT DELEGATION ---
    libraryGrid.addEventListener("click", (e) => {

        // DOWNLOAD
        const downloadBtn = e.target.closest(".download-btn");
        if (downloadBtn) {
            e.preventDefault();
            e.stopPropagation();
            const url = downloadBtn.getAttribute("data-url");
            if (url) window.open(url, '_blank');
            return;
        }

        // VISIBILITY TOGGLE (handled via change event usually, but click is safer for custom inputs sometimes)
        // Note: Checkbox clicks might be handled better by 'change' event to avoid preventing default state change
        // But if we use click, we must be careful. Let's rely on the 'change' or specifically target the label/input click.
        // The structure is <label class="switch"><input ...> ... </label>
    });

    // Handle Toggle Change separately for robustness
    libraryGrid.addEventListener("change", (e) => {
        if (e.target.classList.contains("visibility-toggle")) {
            const toggleInput = e.target;
            const itemId = toggleInput.getAttribute("data-id");
            const newVisibility = toggleInput.checked ? "Public" : "Private";
            console.log("Visibility Change:", itemId, newVisibility);
            handleVisibilityChange(itemId, newVisibility, toggleInput);
        }
    });

    // --- SEARCH WIRING ---
    window.handleLibrarySearch = (val) => {
        if (searchInput) {
            searchInput.value = val;
            renderLibrary();
        } else {
            // Fallback for when the physical input is gone from sidebar but we have the term
            renderLibraryWithTerm(val);
        }
    };

    // --- INITIALIZATION ---
    if (libraryGrid) {
        fetchLibraryItems();
    }

    // --- FETCHING ---
    async function fetchLibraryItems() {
        try {
            console.log("Fetching library items...");
            const res = await fetch(`${API_BASE}/library`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }

            const result = await res.json();
            console.log("Fetch result:", result);

            if (result.success) {
                libraryItems = result.data;
                console.log(`Loaded ${libraryItems.length} items`);
                renderLibrary();
            } else {
                console.error("Failed to fetch library items:", result.message);
                showToast("Failed to load library items", "error");
            }
        } catch (err) {
            console.error("Error fetching library items:", err);
            showToast("Failed to load library items", "error");
        }
    }

    // --- RENDERING ---
    function renderLibrary() {
        renderLibraryWithTerm(searchInput ? searchInput.value : "");
    }

    function renderLibraryWithTerm(searchTerm = "") {
        // Expose for global delete function
        window.renderLibrary = renderLibrary;

        const term = (searchTerm || "").toLowerCase();

        let filtered = libraryItems.filter(item => {
            const matchesCategory = currentCategory === "All" || item.type === currentCategory;
            const matchesVisibility = currentVisibility === "All" || item.visibility === currentVisibility;
            const matchesSearch = item.title.toLowerCase().includes(term) ||
                (item.description && item.description.toLowerCase().includes(term));
            return matchesCategory && matchesVisibility && matchesSearch;
        });

        console.log(`Rendering ${filtered.length} filtered items (term: "${term}")`);
        if (!libraryGrid) return;

        libraryGrid.innerHTML = "";

        if (filtered.length === 0) {
            if (emptyState) emptyState.style.display = "block";
            libraryGrid.style.display = "none";
        } else {
            if (emptyState) emptyState.style.display = "none";
            libraryGrid.style.display = currentView === "grid" ? "grid" : "flex";

            filtered.forEach(item => {
                const card = createLibraryCard(item);
                libraryGrid.appendChild(card);
            });
        }
    }

    function createLibraryCard(item) {
        const div = document.createElement("div");
        div.className = "lib-card";
        div.setAttribute("data-item-id", item._id);

        const iconClass = getIconByFileType(item.type, item.file_ext);

        div.innerHTML = `
            <div class="lib-card-preview">
                <i class="${iconClass}"></i>
                <label class="switch" title="Toggle Visibility">
                    <input type="checkbox" class="visibility-toggle" data-id="${item._id}" ${item.visibility === 'Public' ? 'checked' : ''}>
                    <span class="slider round"></span>
                </label>
            </div>
            <div class="lib-card-content">
                <h4>${escapeHtml(item.title)}</h4>
                <p>${escapeHtml(item.description || 'No description provided.')}</p>
                <div class="lib-card-footer">
                    <div class="lib-owner">
                        <i class="fa-solid fa-user-circle"></i> ${escapeHtml(item.owner_name || 'Unknown')}
                    </div>
                    <div class="lib-actions">
                        ${item.file_url ? `<button title="Download / Play" class="download-btn" data-url="${escapeHtml(item.file_url)}" data-type="${item.type}"><i class="fa-solid ${item.type === 'Recording' ? 'fa-play' : 'fa-download'}"></i></button>` : ''}
                        <button class="delete-btn" title="Delete" onclick="window.deleteLibraryItem('${item._id}')"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                </div>
            </div>
        `;

        // NO EVENT LISTENERS HERE - Using event delegation on libraryGrid instead
        return div;
    }

    function getIconByFileType(type, ext) {
        if (type === "Note") return "fa-solid fa-note-sticky";
        if (type === "Recording") return "fa-solid fa-video";

        if (ext) {
            const extension = ext.toLowerCase();
            if (extension === ".pdf") return "fa-solid fa-file-pdf";
            if ([".doc", ".docx"].includes(extension)) return "fa-solid fa-file-word";
            if ([".png", ".jpg", ".jpeg", ".gif", ".svg"].includes(extension)) return "fa-solid fa-file-image";
            if ([".xls", ".xlsx"].includes(extension)) return "fa-solid fa-file-excel";
            if ([".zip", ".rar", ".7z"].includes(extension)) return "fa-solid fa-file-zipper";
        }

        return "fa-solid fa-file-lines";
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Old delete implementation removed in favor of global window.deleteLibraryItem defined above


    // Internal handleDelete wrapper for backward compatibility if needed, 
    // but we will mainly use window.deleteLibraryItem
    function handleDelete(id) {
        window.deleteLibraryItem(id);
    }

    // VISIBILITY TOGGLE FUNCTION
    async function handleVisibilityChange(id, newVisibility, toggleElement) {
        try {
            const res = await fetch(`${API_BASE}/library/${id}`, {
                method: "PATCH",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ visibility: newVisibility })
            });

            if (res.ok) {
                const itemIndex = libraryItems.findIndex(i => i._id === id);
                if (itemIndex > -1) {
                    libraryItems[itemIndex].visibility = newVisibility;
                }
                showToast(`Item is now ${newVisibility}`, "success");

                // If filtering by specific visibility, we might need to remove it from view
                // But for smooth UX, maybe keep it until refresh or view change?
                // The requirements say: "when i make it public it will be shown in the public section..."
                // So if we are in "Private" view and make it Public, it should disappear from list.
                if (currentVisibility !== "All" && currentVisibility !== newVisibility) {
                    renderLibrary(); // Re-render to enforce filter
                }
            } else {
                toggleElement.checked = !toggleElement.checked; // Revert
                showToast("Failed to update visibility", "error");
            }
        } catch (err) {
            console.error("Visibility toggle error:", err);
            toggleElement.checked = !toggleElement.checked; // Revert
            showToast("Error updating visibility", "error");
        }
    }

    // --- EVENTS ---

    // Category Filtering
    categoryItems.forEach(li => {
        li.addEventListener("click", () => {
            categoryItems.forEach(i => i.classList.remove("active"));
            li.classList.add("active");
            currentCategory = li.getAttribute("data-category");
            currentCategoryTitle.textContent = li.textContent.trim();
            renderLibrary();
        });
    });

    // Visibility Filtering
    visibilityItems.forEach(li => {
        li.addEventListener("click", () => {
            visibilityItems.forEach(i => i.classList.remove("active"));
            li.classList.add("active");
            currentVisibility = li.getAttribute("data-visibility");
            renderLibrary();
        });
    });

    // Search
    if (searchInput) {
        searchInput.addEventListener("input", renderLibrary);
    }

    // View Toggles
    document.getElementById("gridViewBtn").addEventListener("click", () => {
        currentView = "grid";
        document.getElementById("gridViewBtn").classList.add("active");
        document.getElementById("listViewBtn").classList.remove("active");
        libraryGrid.classList.remove("list-view");
        renderLibrary();
    });

    document.getElementById("listViewBtn").addEventListener("click", () => {
        currentView = "list";
        document.getElementById("listViewBtn").classList.add("active");
        document.getElementById("gridViewBtn").classList.remove("active");
        libraryGrid.classList.add("list-view");
        renderLibrary();
    });

    // Modal Logic
    openUploadBtn.onclick = () => uploadModal.classList.add("active");
    closeUploadBtn.onclick = () => uploadModal.classList.remove("active");
    window.onclick = (e) => {
        if (e.target === uploadModal) uploadModal.classList.remove("active");
    };

    // Drag & Drop
    dropZone.onclick = () => fileInput.click();

    fileInput.onchange = () => {
        if (fileInput.files.length > 0) {
            filePreview.textContent = `Selected: ${fileInput.files[0].name}`;
        }
    };

    dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.classList.add("drag-over");
    };

    dropZone.ondragleave = () => dropZone.classList.remove("drag-over");

    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
        if (e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            filePreview.textContent = `Selected: ${fileInput.files[0].name}`;
        }
    };

    // Form Submit
    uploadForm.onsubmit = async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById("submitUpload");

        // --- VALIDATION START ---
        const title = document.getElementById("uploadTitle").value.trim();
        const file = fileInput.files[0];

        // 1. Mandatory File Check
        if (!file) {
            showToast("Please attach a file", "error");
            return;
        }

        // 2. File Size Check (50MB)
        const MAX_SIZE = 50 * 1024 * 1024; // 50MB
        if (file.size > MAX_SIZE) {
            showToast("File size exceeds 50MB", "error");
            return;
        }

        // 3. File Extension Check & Auto-Categorization
        const allowedExtensions = [
            // Documents
            "docx", "pdf", "pptx", "txt",
            // Recordings
            "mp4",
            // Others (Excel)
            "xlsx", "xls"
        ];

        // Get extension (remove dot and lowercase)
        const fileExt = file.name.split('.').pop().toLowerCase();

        if (!allowedExtensions.includes(fileExt)) {
            showToast("file format not supported please uplaod in this format (docx, pdf, pptx, xl, mp4, xlx, txt)", "error");
            return;
        }

        // DETERMINE CATEGORY
        const type = document.getElementById("uploadCategory").value;

        // --- VALIDATION END ---

        submitBtn.disabled = true;
        submitBtn.textContent = "Uploading...";

        const formData = new FormData();
        formData.append("title", title);
        formData.append("description", document.getElementById("uploadDesc").value);
        formData.append("type", type);
        formData.append("visibility", document.getElementById("uploadVisibility").value);
        formData.append("file", file);

        try {
            const res = await fetch(`${API_BASE}/library/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });

            const result = await res.json();

            if (result.success || res.ok) {
                showToast("Asset uploaded successfully", "success");
                uploadModal.classList.remove("active");
                uploadForm.reset();
                filePreview.textContent = "";
                fetchLibraryItems();
            } else {
                showToast(result.message || "Failed to upload asset", "error");
            }
        } catch (err) {
            console.error("Upload error:", err);
            showToast("Failed to upload asset", "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Upload to Library";
        }
    };

    // Activity tracking: 30 seconds of scroll/presence
    let lastScrollTime = Date.now();
    window.addEventListener("scroll", () => {
        if (streakLogged) return;

        const now = Date.now();
        if (now - lastScrollTime > 1000) {
            // Significant gap, reset or just count 1 second
            scrollTime += 1000;
        } else {
            scrollTime += (now - lastScrollTime);
        }
        lastScrollTime = now;

        if (scrollTime >= 30000 && !streakLogged) {
            logStreakActivity();
        }
    });

    async function logStreakActivity() {
        if (streakLogged) return;
        streakLogged = true;

        try {
            await fetch(`${API_BASE}/auth/log-activity`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });
            console.log("Streak activity logged via Library scroll");
        } catch (err) {
            console.error("Failed to log streak activity:", err);
            streakLogged = false; // Retry later
        }
    }
});

document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
        ? 'http://localhost:5000/api'
        : '/api';
    const token = localStorage.getItem("token");

    if (!token) {
        window.location.href = "login.html";
        return;
    }

    // --- STATE ---
    let libraryItems = [];
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

    // --- GLOBAL EVENT DELEGATION FOR DELETE BUTTONS ---
    // This handles all delete button clicks using event delegation
    libraryGrid.addEventListener("click", (e) => {
        const deleteBtn = e.target.closest(".delete-btn");
        if (deleteBtn) {
            e.preventDefault();
            e.stopPropagation();
            const itemId = deleteBtn.getAttribute("data-id");
            console.log("=== DELETE BUTTON CLICKED ===");
            console.log("Item ID:", itemId);
            handleDelete(itemId);
        }

        const downloadBtn = e.target.closest(".download-btn");
        if (downloadBtn) {
            e.preventDefault();
            e.stopPropagation();
            const url = downloadBtn.getAttribute("data-url");
            console.log("Opening URL:", url);
            window.open(url, '_blank');
        }
    });

    // --- INITIALIZATION ---
    fetchLibraryItems();

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
        const searchTerm = searchInput.value.toLowerCase();

        let filtered = libraryItems.filter(item => {
            const matchesCategory = currentCategory === "All" || item.type === currentCategory;
            const matchesVisibility = currentVisibility === "All" || item.visibility === currentVisibility;
            const matchesSearch = item.title.toLowerCase().includes(searchTerm) ||
                (item.description && item.description.toLowerCase().includes(searchTerm));
            return matchesCategory && matchesVisibility && matchesSearch;
        });

        console.log(`Rendering ${filtered.length} filtered items`);
        libraryGrid.innerHTML = "";

        if (filtered.length === 0) {
            emptyState.style.display = "block";
            libraryGrid.style.display = "none";
        } else {
            emptyState.style.display = "none";
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
                <span class="visibility-badge ${item.visibility.toLowerCase()}">
                    <i class="fa-solid ${item.visibility === 'Public' ? 'fa-globe' : 'fa-eye-slash'}"></i>
                    ${item.visibility}
                </span>
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
                        <button class="delete-btn" title="Delete" data-id="${item._id}"><i class="fa-solid fa-trash-can"></i></button>
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

    // DELETE FUNCTION
    async function handleDelete(id) {
        console.log("=== STARTING DELETE PROCESS ===");
        console.log("ID to delete:", id);
        console.log("ID type:", typeof id);

        if (!id) {
            console.error("ERROR: No ID provided!");
            showToast("Error: Invalid item ID", "error");
            return;
        }

        const confirmed = confirm("⚠️ Delete this item?\n\nThis action cannot be undone.");
        console.log("User confirmed:", confirmed);

        if (!confirmed) {
            console.log("User cancelled deletion");
            return;
        }

        const card = document.querySelector(`[data-item-id="${id}"]`);
        if (card) {
            card.style.opacity = "0.5";
            card.style.pointerEvents = "none";
            console.log("✓ Card found and disabled");
        } else {
            console.warn("⚠ Card not found in DOM");
        }

        const deleteUrl = `${API_BASE}/library/${id}`;
        console.log("DELETE URL:", deleteUrl);
        console.log("Token exists:", !!token);

        try {
            console.log("Sending DELETE request...");

            const res = await fetch(deleteUrl, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });

            console.log("Response received:");
            console.log("- Status:", res.status);
            console.log("- Status Text:", res.statusText);
            console.log("- OK:", res.ok);
            console.log("- Headers:", Object.fromEntries(res.headers.entries()));

            // Success: status 200-299 or 204 No Content
            if (res.ok || res.status === 204) {
                console.log("✓ DELETE SUCCESSFUL");

                // Try to get response body (may not exist for 204)
                let responseData = null;
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    try {
                        responseData = await res.json();
                        console.log("Response data:", responseData);
                    } catch (e) {
                        console.log("No JSON body (likely 204 No Content)");
                    }
                }

                // Update local state
                const beforeCount = libraryItems.length;
                libraryItems = libraryItems.filter(item => item._id !== id);
                const afterCount = libraryItems.length;
                console.log(`Items removed: ${beforeCount - afterCount}`);

                // Animate removal
                if (card) {
                    card.style.transition = "all 0.3s ease";
                    card.style.transform = "scale(0.8)";
                    card.style.opacity = "0";
                    setTimeout(() => renderLibrary(), 300);
                } else {
                    renderLibrary();
                }

                showToast("✓ Item deleted successfully", "success");

                // Refresh after delay
                setTimeout(() => {
                    console.log("Refreshing library data...");
                    fetchLibraryItems();
                }, 800);

            } else {
                // Error response
                console.error("❌ DELETE FAILED");
                let errorMessage = `Server error: ${res.status}`;

                try {
                    const errorData = await res.json();
                    console.error("Error response:", errorData);
                    errorMessage = errorData.message || errorData.error || errorMessage;
                } catch (e) {
                    const textError = await res.text();
                    console.error("Error text:", textError);
                    errorMessage = textError || errorMessage;
                }

                showToast(errorMessage, "error");

                // Restore card
                if (card) {
                    card.style.opacity = "1";
                    card.style.pointerEvents = "auto";
                }
            }
        } catch (err) {
            console.error("❌ EXCEPTION DURING DELETE:");
            console.error("Name:", err.name);
            console.error("Message:", err.message);
            console.error("Stack:", err.stack);

            showToast("Network error: Could not delete item", "error");

            // Restore card
            if (card) {
                card.style.opacity = "1";
                card.style.pointerEvents = "auto";
            }
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
    searchInput.addEventListener("input", renderLibrary);

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
        submitBtn.disabled = true;
        submitBtn.textContent = "Uploading...";

        const formData = new FormData();
        formData.append("title", document.getElementById("uploadTitle").value);
        formData.append("description", document.getElementById("uploadDesc").value);
        formData.append("type", document.getElementById("uploadType").value);
        formData.append("visibility", document.getElementById("uploadVisibility").value);

        if (fileInput.files[0]) {
            formData.append("file", fileInput.files[0]);
        }

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

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
    ? 'http://localhost:5000/api'
    : '/api';
let currentPage = 1;
let totalPages = 1;
let limit = 20;
let socket;
let sortBy = 'timestamp';
let sortOrder = 'desc';
let currentView = 'list';

document.addEventListener("DOMContentLoaded", () => {
    // Access Rule: Any logged in user can view error logs (no specific role check required)

    // 0. Priority: Check adminUser first (from Admin Portal)
    const adminUserStr = localStorage.getItem("adminUser");
    const userStr = localStorage.getItem("user");
    const token = localStorage.getItem("token");

    // If adminUser exists, we use that as the primary session
    const user = adminUserStr ? JSON.parse(adminUserStr) : (userStr ? JSON.parse(userStr) : {});

    console.log("=== ERROR LOGS DEBUG ===");
    console.log("User email:", user.email);
    console.log("Token exists:", !!token);

    // 1. Session Repair: If token exists but user is missing/empty, try to fetch user profile
    if (token && (!user || !user.email)) {
        console.warn("[SESSION REPAIR] Token found but user data missing. Attempting to repair session...");

        // Fetch user profile from API to repair session
        fetch(`${API_BASE}/auth/profile`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => {
                if (!res.ok) throw new Error("Session expired");
                return res.json();
            })
            .then(userData => {
                console.log("[SESSION REPAIR] Session repaired successfully!", userData);
                localStorage.setItem("user", JSON.stringify(userData));
                window.location.reload();
            })
            .catch(err => {
                console.error("Failed to restore session:", err);
                // Fallback to manual login suggestion if repair fails
                document.body.innerHTML = `
                    <div style="font-family:sans-serif; padding:2rem; text-align:center;">
                        <h1 style="color:red">Session Repair Failed</h1>
                        <p style="font-size:1.2rem">${err.message}</p>
                        <p><strong>Possible reasons:</strong></p>
                        <ul style="text-align:left; display:inline-block;">
                            <li>Server not restarted (Endpoint 404)</li>
                            <li>Token expired (401)</li>
                            <li>Database connection issue</li>
                        </ul>
                        <br><br>
                        <button onclick="localStorage.clear(); window.location.href='admin-login.html'" style="padding:10px 20px;">Clear Session & Login</button>
                    </div>
                `;
                // localStorage.removeItem("token");
                // localStorage.removeItem("user");
                // window.location.href = "login.html";
            });
        return;
    }

    // 2. Authentication Check: If not logged in (and strict mode is enabled)
    /*
    if (!token || !user.email) {
        document.body.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; background-color:#f8d7da; color:#721c24;">
                <h1 style="margin-bottom:20px;"><i class="fa-solid fa-triangle-exclamation" style="color:#f57c00;"></i> Access Denied: Not Logged In</h1>
                <p style="font-size:1.2rem; margin-bottom:20px;">We could not find your session data in this browser.</p>
                <div style="background:white; padding:20px; border-radius:8px; margin-bottom:20px; border:1px solid #f5c6cb; max-width:500px;">
                    <strong>Debug Info:</strong>
                    <ul style="text-align:left; margin-top:10px;">
                        <li>User Object: <code>${JSON.stringify(user)}</code></li>
                        <li>Token Present: <strong>${!!token}</strong></li>
                    </ul>
                    <p style="margin-top:10px; font-size:0.9rem;">The "User Object" is empty, which means you are not logged in.</p>
                </div>
                <a href="login.html" style="padding:12px 24px; background:#dc3545; color:white; text-decoration:none; border-radius:6px; font-weight:bold; font-size:1rem;">Go to Login Page</a>
            </div>
        `;
        return;
    }
    */

    // 3. Authorization Check: Check if user email is in admin list
    // 3. Authorization Check: Check if user has admin role from token/user object instead of hardcoded list
    if (user.role !== 'admin' && user.role !== 'owner') {
        // Optional: Allow viewing errors if debugging
        // console.warn("User is not explicitly admin");
    }

    // 4. Access Granted
    loadErrors();
    setupFilters();
    setupRealTimeUpdates();
    fetchStats();
    setupQuickFilters();
});

async function fetchStats() {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
        const res = await fetch(`${API_BASE}/errors/stats`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) return;

        const data = await res.json();

        document.getElementById("statsToday").textContent = data.totalToday || 0;
        document.getElementById("statsCritical").textContent = data.criticalCount || 0;
        document.getElementById("statsHigh").textContent = data.highCount || 0;
        document.getElementById("statsResolved").textContent = data.resolvedToday || 0;
        document.getElementById("statsRate").textContent = `${data.resolutionRate || 0}%`;
    } catch (err) {
        console.error("Failed to fetch stats:", err);
    }
}

function loadErrors() {
    if (currentView === 'grouped') {
        fetchGroupedErrors();
    } else {
        fetchAllErrors();
    }
}

async function fetchAllErrors() {
    const tableContainer = document.querySelector(".error-table");
    if (tableContainer) tableContainer.style.opacity = "0.6";

    const token = localStorage.getItem("token");
    if (!token) {
        window.location.href = "admin-login.html";
        return;
    }

    const filters = getFilters();

    try {
        const queryParams = new URLSearchParams({
            page: currentPage,
            limit: limit,
            ...filters
        });

        const res = await fetch(`${API_BASE}/errors?${queryParams}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                localStorage.clear();
                window.location.href = "admin-login.html";
                return;
            }
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        renderErrors(data.errors || []);
        updatePagination(data.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
        console.error(err);
        if (typeof showToast === 'function') showToast("Failed to load error logs", "error");
        renderErrors([]);
    }
}

function getFilters() {
    const filters = {};

    const type = document.getElementById("filterType").value;
    const severity = document.getElementById("filterSeverity").value;
    const status = document.getElementById("filterResolved").value; // Reusing this ID for now, might rename later
    const startDate = document.getElementById("filterStartDate").value;
    const endDate = document.getElementById("filterEndDate").value;
    const search = document.getElementById("searchInput").value;

    if (type) filters.errorType = type;
    if (severity) filters.severity = severity;

    // Handle status mapping
    if (status === 'true') filters.status = 'RESOLVED';
    else if (status === 'false') filters.status = 'NEW';
    else if (status) filters.status = status;

    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (search) filters.search = search;

    // Sorting
    filters.sortBy = sortBy;
    filters.sortOrder = sortOrder;

    return filters;
}

function renderErrors(errors) {
    const tbody = document.getElementById("errorTableBody");
    tbody.innerHTML = "";

    if (!errors || errors.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:#999;">No errors found</td></tr>`;
        return;
    }

    errors.forEach(error => {
        const row = document.createElement("tr");
        row.dataset.id = error._id;

        // Handle User info to avoid "N/A"
        let userInfo = 'Guest';
        if (error.userId && error.userId.email) {
            userInfo = error.userId.email;
        } else if (error.userEmail) {
            userInfo = error.userEmail;
        } else if (error.ipAddress) {
            userInfo = `IP: ${error.ipAddress}`;
        }

        // Handle Screen info
        const screenInfo = error.screenName || error.requestUrl || 'Unknown';

        // Status Badge class
        const statusClass = `status-${(error.status || 'NEW').toLowerCase().replace('_', '-')}`;

        // Determine if error is resolved
        const isResolved = error.status === 'RESOLVED' || error.resolved === true;

        row.innerHTML = `
            <td><input type="checkbox" class="error-checkbox" value="${error._id}"></td>
            <td><span class="severity-badge severity-${error.severity.toLowerCase()}">${error.severity}</span></td>
            <td><span class="status-badge ${statusClass}">${error.status || 'NEW'}</span></td>
            <td><span class="type-badge">${error.errorType}</span></td>
            <td class="error-message" data-full-message="${escapeHtml(error.errorMessage)}" title="Hover for full message">${error.errorMessage}</td>
            <td title="${error.userAgent || ''}">${userInfo}</td>
            <td title="${screenInfo}">${screenInfo.length > 30 ? screenInfo.substring(0, 27) + '...' : screenInfo}</td>
            <td>${new Date(error.timestamp).toLocaleString()}</td>
            <td style="min-width: 120px;">
                <button class="action-btn view-btn" onclick="viewDetails('${error._id}')" title="View Details"><i class="fa-solid fa-eye"></i></button>
                ${!isResolved ? `<button class="action-btn resolve-btn" onclick="resolveError('${error._id}')" title="Mark Resolved"><i class="fa-solid fa-check"></i></button>` : ''}
                <button class="action-btn delete-btn" onclick="deleteError('${error._id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });

    setupCheckboxListeners();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updatePagination(pagination) {
    currentPage = pagination.page;
    totalPages = pagination.pages;
    const total = pagination.total || 0;

    const start = total === 0 ? 0 : (currentPage - 1) * limit + 1;
    const end = Math.min(currentPage * limit, total);

    document.getElementById("pageInfo").textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById("paginationDetails").textContent = `Showing ${start}-${end} of ${total} errors`;
    document.getElementById("prevPage").disabled = currentPage === 1;
    document.getElementById("nextPage").disabled = currentPage === totalPages || totalPages === 0;
}

function setupFilters() {
    const filterElements = [
        "filterType", "filterSeverity", "filterResolved",
        "filterStartDate", "filterEndDate", "searchInput"
    ];

    filterElements.forEach(id => {
        document.getElementById(id).addEventListener("change", () => {
            // We can still auto-apply, or wait for the button.
            // Let's keep auto-apply but also have the button for manual trigger.
            currentPage = 1;
            loadErrors();
        });
    });

    document.getElementById("applyFiltersBtn").addEventListener("click", () => {
        currentPage = 1;
        loadErrors();
    });

    let searchTimeout;
    document.getElementById("searchInput").addEventListener("input", () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadErrors();
        }, 500);
    });

    document.getElementById("nextPage").addEventListener("click", () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadErrors();
        }
    });

    document.getElementById("pageSizeSelect").addEventListener("change", (e) => {
        limit = parseInt(e.target.value);
        currentPage = 1;
        loadErrors();
    });

    document.getElementById("exportCsvBtn").addEventListener("click", exportToCsv);

    // View Toggle
    document.querySelectorAll(".view-btn-toggle").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".view-btn-toggle").forEach(b => {
                b.classList.remove("active");
                b.style.background = "transparent";
            });
            btn.classList.add("active");
            btn.style.background = "#fff";
            currentView = btn.dataset.view;

            // Hide/Show pagination and selection for grouped view
            document.querySelector(".pagination").style.display = currentView === 'list' ? 'flex' : 'none';
            document.getElementById("bulkActionsBar").style.display = "none";
            document.getElementById("selectAllErrors").closest("th").style.display = currentView === 'list' ? 'table-cell' : 'none';

            currentPage = 1;
            loadErrors();
        });
    });

    // Sorting listeners
    document.querySelectorAll(".sortable").forEach(th => {
        th.addEventListener("click", () => {
            const field = th.dataset.sort;
            if (sortBy === field) {
                sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                sortBy = field;
                sortOrder = 'desc';
            }

            // Update icons
            document.querySelectorAll(".sortable i").forEach(i => {
                i.className = 'fa-solid fa-sort';
                i.style.opacity = '0.5';
            });
            const icon = th.querySelector("i");
            icon.className = sortOrder === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
            icon.style.opacity = '1';

            currentPage = 1;
            loadErrors();
        });
    });
}

function setupRealTimeUpdates() {
    const token = localStorage.getItem("token");
    if (!token) {
        console.warn("No token available for Socket.IO connection");
        return;
    }
    const SOCKET_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
        ? 'http://localhost:5000'
        : '';
    socket = io(SOCKET_URL, {
        auth: { token: token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5
    });

    socket.on("connect", () => {
        console.log("Real-time error monitoring connected");
        if (typeof showToast === 'function') {
            showToast("Connected to error monitoring", "success");
        }
    });

    socket.on("disconnect", (reason) => {
        console.warn("Socket disconnected:", reason);
    });

    socket.on("connect_error", (error) => {
        console.error("Socket connection error:", error);
        if (typeof showToast === 'function') {
            showToast("Connection error: " + error.message, "error");
        }
    });

    socket.on("error", (error) => {
        console.error("Socket error:", error);
    });

    socket.on("error:new", (data) => {
        if (typeof showToast === 'function') {
            showToast(`New ${data.severity} error: ${data.message}`, "warning");
        }
        loadErrors(); // Refresh list
    });
}

async function viewDetails(errorId) {
    const token = localStorage.getItem("token");

    try {
        const res = await fetch(`${API_BASE}/errors/${errorId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) throw new Error("Failed to fetch error details");

        const error = await res.json();
        showDetailModal(error);
    } catch (err) {
        console.error(err);
        if (typeof showToast === 'function') showToast("Failed to load error details", "error");
    }
}

function showDetailModal(error) {
    const modal = document.getElementById("detailModal");
    const modalBody = document.getElementById("modalBody");

    modalBody.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
            <div class="modal-left">
                <div class="detail-row">
                    <label>Error Message</label>
                    <p style="font-size: 1.1rem; font-weight: 500; color: #c62828;">${error.errorMessage}</p>
                </div>
                <div class="detail-row">
                    <label>Type & Severity</label>
                    <p>
                        <span class="type-badge">${error.errorType}</span> 
                        <span class="severity-badge severity-${error.severity.toLowerCase()}">${error.severity}</span>
                        <span class="status-badge status-${(error.status || 'NEW').toLowerCase()}">${error.status || 'NEW'}</span>
                    </p>
                </div>
                <div class="detail-row">
                    <label>User Context</label>
                    <p><strong>Name:</strong> ${error.userId?.name || 'N/A'}<br>
                       <strong>Email:</strong> ${error.userId?.email || error.userEmail || 'N/A'}<br>
                       <strong>ID:</strong> ${error.userId?._id || 'N/A'}</p>
                </div>
                <div class="detail-row">
                    <label>Request Info</label>
                    <p><strong>Method:</strong> ${error.requestMethod || 'N/A'}<br>
                       <strong>URL:</strong> <span style="word-break: break-all;">${error.requestUrl || error.screenName || 'N/A'}</span><br>
                       <strong>IP Address:</strong> ${error.ipAddress || 'N/A'}<br>
                       <strong>Status Code:</strong> ${error.httpStatusCode || 'N/A'}</p>
                </div>
            </div>
            
            <div class="modal-right">
                <div class="detail-row">
                    <label>System Info</label>
                    <p><strong>Environment:</strong> ${error.environment || 'N/A'}<br>
                       <strong>Timestamp:</strong> ${new Date(error.timestamp).toLocaleString()}<br>
                       <strong>Session ID:</strong> <code>${error.sessionId || 'N/A'}</code></p>
                </div>
                <div class="detail-row">
                    <label>File & Line</label>
                    <p>${error.fileName || 'N/A'} ${error.lineNumber ? `(Line ${error.lineNumber}${error.columnNumber ? `, Col ${error.columnNumber}` : ''})` : ''}</p>
                </div>
                <div class="detail-row">
                    <label>Browser / OS</label>
                    <p style="font-size: 0.85rem; color: #666;">${error.userAgent || 'N/A'}</p>
                </div>
            </div>
        </div>

        ${error.stackTrace ? `
        <div class="detail-row">
            <label>Stack Trace <button class="action-btn view-btn" style="padding: 2px 8px;" onclick="copyToClipboard(\`${error.stackTrace.replace(/`/g, '\\`')}\`)">Copy</button></label>
            <div class="stack-trace">${error.stackTrace}</div>
        </div>
        ` : ''}

        ${error.status === 'RESOLVED' || error.resolved ? `
        <div class="detail-row" style="background: #f1f8e9; padding: 1rem; border-radius: 8px; border: 1px solid #c8e6c9;">
            <label style="color: #2e7d32;">Resolution Details</label>
            <p>Resolved by <strong>${error.resolvedBy?.name || 'Admin'}</strong> on ${new Date(error.resolvedAt).toLocaleString()}</p>
        </div>
        ` : ''}
    `;

    modal.classList.add("active");
}

function closeModal() {
    document.getElementById("detailModal").classList.remove("active");
}

async function resolveError(errorId) {
    if (!confirm("Mark this error as resolved?")) return;

    const token = localStorage.getItem("token");

    try {
        const res = await fetch(`${API_BASE}/errors/${errorId}/resolve`, {
            method: "PATCH",
            headers: { 
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.message || "Failed to resolve error");
        }

        if (typeof showToast === 'function') showToast("Error marked as resolved", "success");
        
        // Close modal if open
        const modal = document.getElementById("detailModal");
        if (modal && modal.classList.contains("active")) {
            closeModal();
        }
        
        loadErrors();
    } catch (err) {
        console.error("Resolve error:", err);
        if (typeof showToast === 'function') showToast(err.message || "Failed to resolve error", "error");
    }
}

async function deleteError(errorId) {
    if (!confirm("Permanently delete this error log?")) return;

    const token = localStorage.getItem("token");

    try {
        const res = await fetch(`${API_BASE}/errors/${errorId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.message || "Failed to delete error");
        }

        if (typeof showToast === 'function') showToast("Error log deleted", "success");
        
        // Close modal if open
        const modal = document.getElementById("detailModal");
        if (modal && modal.classList.contains("active")) {
            closeModal();
        }
        
        loadErrors();
    } catch (err) {
        console.error("Delete error:", err);
        if (typeof showToast === 'function') showToast(err.message || "Failed to delete error", "error");
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        if (typeof showToast === 'function') showToast("Copied to clipboard", "success");
    });
}

async function fetchGroupedErrors() {
    const tbody = document.getElementById("errorTableBody");
    const filters = getFilters();
    const token = localStorage.getItem("token");

    try {
        const queryParams = new URLSearchParams({
            severity: filters.severity || '',
            errorType: filters.errorType || '',
            status: filters.status || ''
        });

        const res = await fetch(`${API_BASE}/errors/grouped?${queryParams}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) throw new Error("Failed to fetch grouped errors");

        const groupedData = await res.json();
        renderGroupedErrors(groupedData);
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:red;">Error loading grouped data</td></tr>`;
    } finally {
        document.querySelector(".error-table").style.opacity = "1";
    }
}

function renderGroupedErrors(groups) {
    const tbody = document.getElementById("errorTableBody");
    tbody.innerHTML = "";

    if (!groups || groups.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:#999;">No errors found</td></tr>`;
        return;
    }

    groups.forEach(group => {
        const row = document.createElement("tr");
        const lastOccur = new Date(group.lastOccurrence).toLocaleString();

        row.innerHTML = `
            <td><span class="severity-badge severity-${group.severity.toLowerCase()}">${group.severity}</span></td>
            <td style="font-weight: 700; color: #1976d2;"><span style="background: #e3f2fd; padding: 4px 10px; border-radius: 12px;">${group.count}x</span></td>
            <td><span class="type-badge">${group.errorType}</span></td>
            <td class="error-message" data-full-message="${escapeHtml(group.message)}" title="Hover for full message">${group.message}</td>
            <td>---</td>
            <td title="${group.source}">${group.source.length > 30 ? group.source.substring(0, 27) + '...' : group.source}</td>
            <td>${lastOccur}</td>
            <td>
                <button class="action-btn view-btn" onclick="viewDetails('${group.ids[0]}')"><i class="fa-solid fa-eye"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function exportToCsv() {
    if (typeof showToast === 'function') showToast("Preparing export...", "info");

    const token = localStorage.getItem("token");
    const filters = getFilters();

    try {
        // Fetch all filtered data (limit 10000)
        const queryParams = new URLSearchParams({
            ...filters,
            limit: 10000,
            page: 1
        });

        const res = await fetch(`${API_BASE}/errors?${queryParams}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) throw new Error("Export failed");

        const data = await res.json();
        const errors = data.errors || [];

        if (errors.length === 0) {
            if (typeof showToast === 'function') showToast("No errors to export", "warning");
            return;
        }

        // CSV Creation
        const headers = ["Timestamp", "Severity", "Status", "Type", "Message", "User Email", "URL", "File", "Line", "Environment", "IP"];
        const rows = errors.map(e => [
            new Date(e.timestamp).toISOString(),
            e.severity,
            e.status || (e.resolved ? 'RESOLVED' : 'NEW'),
            e.errorType,
            `"${e.errorMessage.replace(/"/g, '""')}"`,
            e.userId?.email || e.userEmail || 'Guest',
            e.requestUrl || e.screenName || 'N/A',
            e.fileName || 'N/A',
            e.lineNumber || 'N/A',
            e.environment,
            e.ipAddress || 'N/A'
        ]);

        const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `SkillSprint_Errors_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (typeof showToast === 'function') showToast(`Exported ${errors.length} errors`, "success");
    } catch (err) {
        console.error(err);
        if (typeof showToast === 'function') showToast("Export failed", "error");
    }
}

// Bulk Selection & Actions
function setupCheckboxListeners() {
    const selectAll = document.getElementById("selectAllErrors");
    const checkboxes = document.querySelectorAll(".error-checkbox");
    const bulkBar = document.getElementById("bulkActionsBar");
    const selectedCount = document.getElementById("selectedCount");

    if (!selectAll) return;

    selectAll.checked = false;
    selectAll.addEventListener("change", (e) => {
        checkboxes.forEach(cb => cb.checked = e.target.checked);
        updateBulkActionsBar();
    });

    checkboxes.forEach(cb => {
        cb.addEventListener("change", () => {
            const allChecked = Array.from(checkboxes).every(c => c.checked);
            selectAll.checked = allChecked;
            updateBulkActionsBar();
        });
    });

    document.getElementById("bulkResolveBtn").onclick = () => handleBulkAction('resolve');
    document.getElementById("bulkDeleteBtn").onclick = () => handleBulkAction('delete');
    document.getElementById("cancelSelectionBtn").onclick = () => {
        checkboxes.forEach(cb => cb.checked = false);
        selectAll.checked = false;
        updateBulkActionsBar();
    };
}

function updateBulkActionsBar() {
    const checkboxes = document.querySelectorAll(".error-checkbox:checked");
    const bulkBar = document.getElementById("bulkActionsBar");
    const selectedCountSpan = document.getElementById("selectedCount");

    if (checkboxes.length > 0) {
        bulkBar.style.display = "flex";
        selectedCountSpan.textContent = `${checkboxes.length} items selected`;
    } else {
        bulkBar.style.display = "none";
    }
}

async function handleBulkAction(action) {
    const selected = Array.from(document.querySelectorAll(".error-checkbox:checked")).map(cb => cb.value);
    if (selected.length === 0) {
        if (typeof showToast === 'function') showToast("Please select at least one error", "info");
        return;
    }

    const confirmMsg = action === 'delete'
        ? `Are you sure you want to delete ${selected.length} logs?`
        : `Mark ${selected.length} errors as resolved?`;

    if (!confirm(confirmMsg)) return;

    const token = localStorage.getItem("token");
    try {
        const res = await fetch(`${API_BASE}/errors/bulk-action`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ action, errorIds: selected })
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.message || "Bulk action failed");
        }

        const data = await res.json();
        if (typeof showToast === 'function') showToast(data.message, "success");

        // Clear selections and refresh
        document.getElementById("selectAllErrors").checked = false;
        document.querySelectorAll(".error-checkbox").forEach(cb => cb.checked = false);
        loadErrors();
    } catch (err) {
        console.error("Bulk action error:", err);
        if (typeof showToast === 'function') showToast(err.message || "Bulk action failed", "error");
    }
}

// Socket.io Real-time Updates
function setupRealTimeUpdates() {
    const socket = io();

    socket.on("connect", () => {
        console.log("Connected to Socket.io for Real-time Error Monitoring");
    });

    socket.on("error:new", (newError) => {
        if (typeof showToast === 'function') {
            showToast(`New ${newError.severity} Error: ${newError.message.substring(0, 50)}...`, "warning");
        }

        // Refresh stats and errors if in list view
        fetchStats();
        if (currentView === 'list' && currentPage === 1) {
            loadErrors();
        }
    });

    socket.on("disconnect", () => {
        console.log("Disconnected from Socket.io");
    });
}

// Close modal on outside click
document.getElementById("detailModal").addEventListener("click", (e) => {
    if (e.target.id === "detailModal") {
        closeModal();
    }
});

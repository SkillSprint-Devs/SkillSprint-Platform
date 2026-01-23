const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
    ? 'http://localhost:5000/api'
    : '/api';
let currentPage = 1;
let totalPages = 1;
let socket;

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
        console.warn("⚠️ Token found but user data missing. FORCEFULLY REPAIRING SESSION...");

        // Fetch user profile from API to repair session
        fetch(`${API_BASE}/auth/profile`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => {
                if (!res.ok) throw new Error("Session expired");
                return res.json();
            })
            .then(userData => {
                console.log("✅ Session repaired!", userData);
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
                <h1 style="margin-bottom:20px;">⚠️ Access Denied: Not Logged In</h1>
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
});

async function loadErrors() {
    const token = localStorage.getItem("token");
    if (!token) {
        window.location.href = "admin-login.html";
        return;
    }

    const filters = getFilters();

    try {
        const queryParams = new URLSearchParams({
            page: currentPage,
            limit: 20,
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
    const resolved = document.getElementById("filterResolved").value;
    const startDate = document.getElementById("filterStartDate").value;
    const endDate = document.getElementById("filterEndDate").value;
    const search = document.getElementById("searchInput").value;

    if (type) filters.errorType = type;
    if (severity) filters.severity = severity;
    if (resolved) filters.resolved = resolved;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (search) filters.search = search;

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
        row.innerHTML = `
            <td><span class="severity-badge severity-${error.severity.toLowerCase()}">${error.severity}</span></td>
            <td><span class="type-badge">${error.errorType}</span></td>
            <td class="error-message" title="${error.errorMessage}">${error.errorMessage}</td>
            <td>${error.userId?.email || 'N/A'}</td>
            <td>${error.screenName || 'N/A'}</td>
            <td>${new Date(error.timestamp).toLocaleString()}</td>
            <td>
                <button class="action-btn view-btn" onclick="viewDetails('${error._id}')">View</button>
                ${!error.resolved ? `<button class="action-btn resolve-btn" onclick="resolveError('${error._id}')">Resolve</button>` : ''}
                <button class="action-btn delete-btn" onclick="deleteError('${error._id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function updatePagination(pagination) {
    currentPage = pagination.page;
    totalPages = pagination.pages;

    document.getElementById("pageInfo").textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById("prevPage").disabled = currentPage === 1;
    document.getElementById("nextPage").disabled = currentPage === totalPages;
}

function setupFilters() {
    const filterElements = [
        "filterType", "filterSeverity", "filterResolved",
        "filterStartDate", "filterEndDate", "searchInput"
    ];

    filterElements.forEach(id => {
        document.getElementById(id).addEventListener("change", () => {
            currentPage = 1;
            loadErrors();
        });
    });

    let searchTimeout;
    document.getElementById("searchInput").addEventListener("input", () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadErrors();
        }, 500);
    });

    document.getElementById("prevPage").addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            loadErrors();
        }
    });

    document.getElementById("nextPage").addEventListener("click", () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadErrors();
        }
    });
}

function setupRealTimeUpdates() {
    const token = localStorage.getItem("token");
    const SOCKET_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
        ? 'http://localhost:5000'
        : '';
    socket = io(SOCKET_URL, {
        auth: { token }
    });

    socket.on("connect", () => console.log("Real-time error monitoring connected"));

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
        <div class="detail-row">
            <label>Error Message</label>
            <p>${error.errorMessage}</p>
        </div>
        <div class="detail-row">
            <label>Type & Severity</label>
            <p><span class="type-badge">${error.errorType}</span> <span class="severity-badge severity-${error.severity.toLowerCase()}">${error.severity}</span></p>
        </div>
        <div class="detail-row">
            <label>User</label>
            <p>${error.userId?.name || 'N/A'} (${error.userId?.email || 'N/A'})</p>
        </div>
        <div class="detail-row">
            <label>Screen / Page</label>
            <p>${error.screenName || 'N/A'}</p>
        </div>
        <div class="detail-row">
            <label>File & Line</label>
            <p>${error.fileName || 'N/A'} ${error.lineNumber ? `(Line ${error.lineNumber}${error.columnNumber ? `, Col ${error.columnNumber}` : ''})` : ''}</p>
        </div>
        <div class="detail-row">
            <label>API Endpoint</label>
            <p>${error.apiEndpoint || 'N/A'} ${error.httpStatusCode ? `(Status: ${error.httpStatusCode})` : ''}</p>
        </div>
        <div class="detail-row">
            <label>Timestamp</label>
            <p>${new Date(error.timestamp).toLocaleString()}</p>
        </div>
        <div class="detail-row">
            <label>Environment</label>
            <p>${error.environment}</p>
        </div>
        <div class="detail-row">
            <label>User Agent</label>
            <p style="font-size: 0.85rem; color: #666;">${error.userAgent || 'N/A'}</p>
        </div>
        ${error.stackTrace ? `
        <div class="detail-row">
            <label>Stack Trace <button class="action-btn view-btn" onclick="copyToClipboard(\`${error.stackTrace.replace(/`/g, '\\`')}\`)">Copy</button></label>
            <div class="stack-trace">${error.stackTrace}</div>
        </div>
        ` : ''}
        ${error.resolved ? `
        <div class="detail-row">
            <label>Resolved</label>
            <p>Yes, by ${error.resolvedBy?.name || 'Admin'} on ${new Date(error.resolvedAt).toLocaleString()}</p>
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
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) throw new Error("Failed to resolve error");

        if (typeof showToast === 'function') showToast("Error marked as resolved", "success");
        loadErrors();
    } catch (err) {
        console.error(err);
        if (typeof showToast === 'function') showToast("Failed to resolve error", "error");
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

        if (!res.ok) throw new Error("Failed to delete error");

        if (typeof showToast === 'function') showToast("Error log deleted", "success");
        loadErrors();
    } catch (err) {
        console.error(err);
        if (typeof showToast === 'function') showToast("Failed to delete error", "error");
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        if (typeof showToast === 'function') showToast("Copied to clipboard", "success");
    });
}

// Close modal on outside click
document.getElementById("detailModal").addEventListener("click", (e) => {
    if (e.target.id === "detailModal") {
        closeModal();
    }
});

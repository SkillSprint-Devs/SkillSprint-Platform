/**
 * Users Management Dashboard Logic
 */

const API_BASE = window.API_BASE_URL + '/admin';

// DOM Elements
const els = {
    // Header
    adminName: document.getElementById('headerAdminName'),
    refreshBtn: document.getElementById('refreshPageBtn'),
    
    // Stats
    stats: {
        total: document.getElementById('statTotalUsers'),
        students: document.getElementById('statStudents'),
        mentors: document.getElementById('statMentors'),
        admins: document.getElementById('statAdmins')
    },
    
    // Filters
    filters: {
        search: document.getElementById('filterSearch'),
        role: document.getElementById('filterRole'),
        status: document.getElementById('filterStatus')
    },
    
    // Table & Pagination
    tableBody: document.getElementById('usersTableBody'),
    paginationInfo: document.getElementById('paginationInfo'),
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    
    // Modal
    modal: {
        overlay: document.getElementById('editModal'),
        closeBtn: document.getElementById('closeModalBtn'),
        cancelBtn: document.getElementById('cancelModalBtn'),
        saveBtn: document.getElementById('saveModalBtn'),
        
        avatar: document.getElementById('modalUserAvatar'),
        name: document.getElementById('modalUserName'),
        email: document.getElementById('modalUserEmail'),
        
        idInput: document.getElementById('editUserId'),
        roleSelect: document.getElementById('editUserRole'),
        statusSelect: document.getElementById('editUserStatus')
    }
};

// State
let state = {
    users: [],
    page: 1,
    limit: 20,
    totalPages: 1,
    totalUsers: 0,
    adminUser: null
};

let searchTimeout = null;

/**
 * Authenticated Fetch Helper
 */
async function adminFetch(endpoint, options = {}) {
    const token = localStorage.getItem("token");
    if (!token) {
        window.location.href = "admin-login.html";
        return null;
    }

    const headers = {
        ...options.headers,
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
    };

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
        
        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem("token");
            window.location.href = "admin-login.html";
            return null;
        }

        return await res.json();
    } catch (err) {
        console.error(`[Admin] Fetch error for ${endpoint}:`, err);
        return { success: false, message: err.message };
    }
}

/**
 * Initialization
 */
function init() {
    state.adminUser = JSON.parse(localStorage.getItem("adminUser"));
    if (!state.adminUser || state.adminUser.role !== 'admin') {
        window.location.href = "admin-login.html";
        return;
    }

    // Set header admin name
    if (els.adminName && state.adminUser.name) {
        els.adminName.textContent = state.adminUser.name;
    }

    setupEventListeners();
    fetchUsers();
    fetchStats();
}

/**
 * Event Listeners
 */
function setupEventListeners() {
    // Filters
    els.filters.role.addEventListener('change', () => { state.page = 1; fetchUsers(); });
    els.filters.status.addEventListener('change', () => { state.page = 1; fetchUsers(); });
    
    els.filters.search.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            state.page = 1;
            fetchUsers();
        }, 400);
    });

    // Pagination
    els.btnPrev.addEventListener('click', () => {
        if (state.page > 1) {
            state.page--;
            fetchUsers();
        }
    });
    
    els.btnNext.addEventListener('click', () => {
        if (state.page < state.totalPages) {
            state.page++;
            fetchUsers();
        }
    });

    // Refresh
    els.refreshBtn.addEventListener('click', async () => {
        const icon = els.refreshBtn.querySelector('i');
        icon.classList.add('fa-spin');
        await Promise.all([fetchUsers(), fetchStats()]);
        icon.classList.remove('fa-spin');
    });

    // Modal
    els.modal.closeBtn.addEventListener('click', closeModal);
    els.modal.cancelBtn.addEventListener('click', closeModal);
    els.modal.saveBtn.addEventListener('click', saveUserEdit);
    
    // Close modal on click outside
    els.modal.overlay.addEventListener('click', (e) => {
        if (e.target === els.modal.overlay) closeModal();
    });
}

/**
 * Data Fetching
 */
async function fetchUsers() {
    // Loading state
    els.tableBody.innerHTML = `
        <tr class="table-loading">
            <td colspan="5">
                <i class="fa-solid fa-spinner fa-spin" style="color: var(--admin-accent); font-size: 1.5rem;"></i>
                <p style="margin-top: 0.5rem; color: var(--text-muted);">Loading users...</p>
            </td>
        </tr>
    `;

    // Build query params
    const params = new URLSearchParams({
        page: state.page,
        limit: state.limit,
        role: els.filters.role.value,
        status: els.filters.status.value,
        search: els.filters.search.value
    });

    const data = await adminFetch(`/users?${params.toString()}`);
    
    if (data && data.success) {
        state.users = data.users;
        state.totalPages = data.pagination.pages;
        state.totalUsers = data.pagination.total;
        state.page = data.pagination.page;
        
        renderTable();
        updatePaginationUI();
    } else {
        els.tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="users-empty-state">
                    <i class="fa-solid fa-triangle-exclamation" style="color: var(--danger);"></i>
                    <p>Failed to load users.</p>
                </td>
            </tr>
        `;
    }
}

async function fetchStats() {
    // Use the existing stats endpoint
    const data = await adminFetch("/stats");
    if (data && data.success) {
        els.stats.total.textContent = data.stats.totalUsers.toLocaleString();
    }
    
    // For specific role counts, we need to do separate lightweight queries 
    // or rely on a new dedicated stats endpoint. Since the backend doesn't have 
    // breakdown by role in /stats yet, we'll fetch them manually via the users endpoint
    // by requesting limit=1 for each role just to get the total count.
    
    Promise.all([
        adminFetch("/users?role=student&limit=1"),
        adminFetch("/users?role=mentor&limit=1"),
        adminFetch("/users?role=admin&limit=1")
    ]).then(results => {
        if (results[0] && results[0].success) els.stats.students.textContent = results[0].pagination.total.toLocaleString();
        if (results[1] && results[1].success) els.stats.mentors.textContent = results[1].pagination.total.toLocaleString();
        if (results[2] && results[2].success) els.stats.admins.textContent = results[2].pagination.total.toLocaleString();
    });
}

/**
 * UI Rendering
 */
function renderTable() {
    if (!state.users || state.users.length === 0) {
        els.tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="users-empty-state">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <p>No users found matching your criteria.</p>
                </td>
            </tr>
        `;
        return;
    }

    els.tableBody.innerHTML = '';
    
    state.users.forEach(user => {
        const tr = document.createElement('tr');
        
        // Avatar Initial
        const initial = user.name ? user.name.charAt(0).toUpperCase() : 'U';
        
        // Role Badge
        let roleClass = 'role-student';
        if (user.role === 'admin') roleClass = 'role-admin';
        if (user.role === 'mentor') roleClass = 'role-mentor';
        
        // Status Pill
        const isActive = user.isActive !== false; // Default to true if undefined
        const statusHtml = isActive 
            ? `<span class="status-pill status-active"><i class="fa-solid fa-check"></i> Active</span>`
            : `<span class="status-pill status-inactive"><i class="fa-solid fa-ban"></i> Inactive</span>`;
            
        // Date formatting
        const joinDate = new Date(user.created_at || user.createdAt).toLocaleDateString(undefined, { 
            year: 'numeric', month: 'short', day: 'numeric' 
        });

        tr.innerHTML = `
            <td>
                <div class="user-info-cell">
                    <div class="user-avatar">${initial}</div>
                    <div class="user-details">
                        <span class="user-name">${user.name}</span>
                        <span class="user-email">${user.email}</span>
                    </div>
                </div>
            </td>
            <td><span class="role-badge ${roleClass}">${user.role}</span></td>
            <td>${statusHtml}</td>
            <td style="color: var(--text-muted); font-size: 0.85rem;">${joinDate}</td>
            <td style="text-align: center;">
                <div class="users-actions" style="justify-content: center;">
                    <button class="users-action-btn edit" onclick="openEditModal('${user._id}')" title="Edit User">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="users-action-btn delete" onclick="deleteUser('${user._id}')" title="Delete User">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        
        els.tableBody.appendChild(tr);
    });
}

function updatePaginationUI() {
    const start = ((state.page - 1) * state.limit) + 1;
    const end = Math.min(state.page * state.limit, state.totalUsers);
    
    if (state.totalUsers === 0) {
        els.paginationInfo.textContent = "Showing 0 of 0 users";
    } else {
        els.paginationInfo.textContent = `Showing ${start} to ${end} of ${state.totalUsers.toLocaleString()} users`;
    }
    
    els.btnPrev.disabled = state.page <= 1;
    els.btnNext.disabled = state.page >= state.totalPages;
}

/**
 * Modal Logic
 */
window.openEditModal = function(id) {
    const user = state.users.find(u => u._id === id);
    if (!user) return;
    
    // Populate
    els.modal.idInput.value = user._id;
    els.modal.name.textContent = user.name;
    els.modal.email.textContent = user.email;
    els.modal.avatar.textContent = user.name.charAt(0).toUpperCase();
    
    els.modal.roleSelect.value = user.role;
    els.modal.statusSelect.value = user.isActive !== false ? "true" : "false";
    
    // Show
    els.modal.overlay.classList.add('active');
};

function closeModal() {
    els.modal.overlay.classList.remove('active');
}

async function saveUserEdit() {
    const id = els.modal.idInput.value;
    const role = els.modal.roleSelect.value;
    const isActive = els.modal.statusSelect.value === "true";
    
    // Simple protection logic
    if (id === state.adminUser.id && !isActive) {
        alert("You cannot deactivate your own admin account.");
        return;
    }
    
    els.modal.saveBtn.disabled = true;
    els.modal.saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    
    const data = await adminFetch(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ role, isActive })
    });
    
    els.modal.saveBtn.disabled = false;
    els.modal.saveBtn.innerHTML = 'Save Changes';
    
    if (data && data.success) {
        closeModal();
        fetchUsers(); // Refresh table to show changes
        
        // If role changed, refresh stats
        if (data.user && state.users.find(u => u._id === id)?.role !== role) {
            fetchStats();
        }
    } else {
        alert(data?.message || "Failed to update user");
    }
}

/**
 * Delete User
 */
window.deleteUser = async function(id) {
    const user = state.users.find(u => u._id === id);
    if (!user) return;
    
    if (id === state.adminUser.id) {
        alert("You cannot delete your own admin account.");
        return;
    }
    
    const confirmed = confirm(`Are you sure you want to permanently delete the user ${user.name} (${user.email})? This action cannot be undone.`);
    if (!confirmed) return;
    
    const data = await adminFetch(`/users/${id}`, {
        method: 'DELETE'
    });
    
    if (data && data.success) {
        fetchUsers();
        fetchStats();
    } else {
        alert(data?.message || "Failed to delete user");
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);

/**
 * AI Training Review Dashboard Logic
 */

const API_BASE = window.API_BASE_URL + '/admin/ai';

// DOM Elements
const els = {
    stats: {
        pending: document.getElementById('statPending'),
        reviewed: document.getElementById('statReviewed'),
        avgConf: document.getElementById('statAvgConf'),
        total: document.getElementById('statTotal')
    },
    filters: {
        status: document.getElementById('filterStatus'),
        confidence: document.getElementById('filterConfidence'),
        search: document.getElementById('filterSearch')
    },
    table: {
        body: document.getElementById('queryTableBody'),
        count: document.getElementById('tableCount')
    },
    retrain: {
        panel: document.getElementById('retrainPanel'),
        btn: document.getElementById('retrainBtn'),
        newCount: document.getElementById('retrainNewCount')
    },
    toastContainer: document.getElementById('toastContainer'),
    refreshBtn: document.getElementById('refreshPageBtn')
};

// State
let queries = [];
let intentsList = [];
let groupedIntents = {};
let addedSinceRetrain = 0;

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
        console.error(`[Admin AI] Fetch error for ${endpoint}:`, err);
        return { success: false, message: err.message };
    }
}

/**
 * Initialization
 */
async function init() {
    const adminUser = JSON.parse(localStorage.getItem("adminUser"));
    if (!adminUser || adminUser.role !== 'admin') {
        window.location.href = "admin-login.html";
        return;
    }
    
    const headerAdminName = document.getElementById("headerAdminName");
    if (headerAdminName && adminUser.name) {
        headerAdminName.textContent = adminUser.name;
    }

    setupEventListeners();
    
    // Load intents first so the dropdown is ready
    await fetchIntents();
    
    // Load the queries
    await fetchQueries();
}

/**
 * Event Listeners
 */
function setupEventListeners() {
    els.filters.status.addEventListener('change', renderTable);
    els.filters.confidence.addEventListener('change', renderTable);
    els.filters.search.addEventListener('input', () => {
        // Debounce search
        clearTimeout(window.searchTimeout);
        window.searchTimeout = setTimeout(renderTable, 300);
    });

    els.refreshBtn.addEventListener('click', async () => {
        const icon = els.refreshBtn.querySelector('i');
        icon.classList.add('fa-spin');
        await fetchQueries();
        icon.classList.remove('fa-spin');
        showToast("Data refreshed", "info");
    });

    els.retrain.btn.addEventListener('click', handleRetrain);
}

/**
 * Data Fetching
 */
async function fetchIntents() {
    const data = await adminFetch('/intents');
    if (data && data.success && data.intents) {
        intentsList = data.intents;
        
        // Group intents by category prefix (e.g. platform.session, js)
        groupedIntents = intentsList.reduce((acc, intent) => {
            const parts = intent.split('.');
            let group = parts[0];
            if (parts.length > 2) {
                group = `${parts[0]}.${parts[1]}`;
            }
            if (!acc[group]) acc[group] = [];
            acc[group].push(intent);
            return acc;
        }, {});
    }
}

async function fetchQueries() {
    els.table.body.innerHTML = `
        <tr class="table-loading">
            <td colspan="6" style="text-align: center; padding: 3rem;">
                <i class="fa-solid fa-spinner fa-spin" style="color: var(--admin-accent); font-size: 1.5rem;"></i>
                <p style="margin-top: 0.5rem; color: var(--text-muted);">Loading queries...</p>
            </td>
        </tr>
    `;

    const data = await adminFetch('/failed-queries');
    
    if (data && data.success && data.failed_queries) {
        queries = data.failed_queries;
        
        // Calculate newly added samples that need retraining
        addedSinceRetrain = queries.filter(q => q.added_to_dataset && q.resolved).length;
        
        updateStats();
        renderTable();
        updateRetrainPanel();
    } else {
        els.table.body.innerHTML = `
            <tr>
                <td colspan="6" class="ai-empty-state">
                    <i class="fa-solid fa-triangle-exclamation" style="color: var(--danger);"></i>
                    <p>Failed to load queries. AI Engine may be unreachable.</p>
                </td>
            </tr>
        `;
    }
}

/**
 * UI Rendering
 */
function updateStats() {
    const pending = queries.filter(q => !q.resolved);
    const reviewed = queries.filter(q => q.resolved);
    
    let totalConf = 0;
    pending.forEach(q => totalConf += q.confidence);
    const avgConf = pending.length > 0 ? (totalConf / pending.length).toFixed(2) : '0.00';

    els.stats.pending.textContent = pending.length;
    els.stats.reviewed.textContent = reviewed.length;
    els.stats.avgConf.textContent = avgConf;
    els.stats.total.textContent = queries.length;
}

function updateRetrainPanel() {
    els.retrain.newCount.textContent = addedSinceRetrain;
    
    if (addedSinceRetrain > 0) {
        els.retrain.btn.disabled = false;
        els.retrain.panel.style.borderLeft = "4px solid var(--warning)";
    } else {
        els.retrain.btn.disabled = true;
        els.retrain.panel.style.borderLeft = "1px solid var(--border-color)";
    }
}

function renderTable() {
    const statusFilter = els.filters.status.value;
    const confFilter = els.filters.confidence.value;
    const searchFilter = els.filters.search.value.toLowerCase();

    // Filter queries
    let filtered = queries.filter(q => {
        // Status
        if (statusFilter === 'pending' && q.resolved) return false;
        if (statusFilter === 'reviewed' && !q.resolved) return false;

        // Confidence
        if (confFilter === 'low' && q.confidence >= 0.45) return false;
        if (confFilter === 'mid' && (q.confidence < 0.45 || q.confidence > 0.65)) return false;

        // Search
        if (searchFilter && !q.query.toLowerCase().includes(searchFilter) && 
            !q.predicted_intent.toLowerCase().includes(searchFilter) &&
            !(q.assigned_intent && q.assigned_intent.toLowerCase().includes(searchFilter))) {
            return false;
        }

        return true;
    });

    // Sort: Pending first, then by confidence (lowest first)
    filtered.sort((a, b) => {
        if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
        return a.confidence - b.confidence;
    });

    els.table.count.textContent = `Showing ${filtered.length} queries`;

    if (filtered.length === 0) {
        els.table.body.innerHTML = `
            <tr>
                <td colspan="6" class="ai-empty-state">
                    <i class="fa-solid fa-check-circle" style="color: var(--success);"></i>
                    <p>No queries match the current filters.</p>
                </td>
            </tr>
        `;
        return;
    }

    els.table.body.innerHTML = '';
    
    filtered.forEach(q => {
        const tr = document.createElement('tr');
        if (q.resolved) tr.classList.add('reviewed-row');

        // Confidence formatting
        let confClass = 'confidence-high';
        if (q.confidence < 0.45) confClass = 'confidence-low';
        else if (q.confidence < 0.65) confClass = 'confidence-mid';

        // Status formatting
        let statusHtml = '';
        if (!q.resolved) {
            statusHtml = `<span class="status-pill status-pending"><i class="fa-solid fa-clock"></i> Pending</span>`;
        } else if (q.added_to_dataset) {
            statusHtml = `<span class="status-pill status-reviewed"><i class="fa-solid fa-check"></i> Added</span>`;
        } else {
            statusHtml = `<span class="status-pill status-dismissed"><i class="fa-solid fa-times"></i> Dismissed</span>`;
        }

        // Actions / Select formatting
        let actionsHtml = '';
        if (!q.resolved) {
            // Generate select options
            let optionsHtml = `<option value="" disabled selected>Select correct intent...</option>`;
            
            // Add predicted intent at the top as a suggestion
            optionsHtml += `<optgroup label="Predicted">
                <option value="${q.predicted_intent}">★ ${q.predicted_intent}</option>
            </optgroup>`;
            
            // Add all grouped intents
            Object.keys(groupedIntents).sort().forEach(group => {
                optionsHtml += `<optgroup label="${group.toUpperCase()}">`;
                groupedIntents[group].sort().forEach(intent => {
                    // Don't duplicate the predicted one
                    if (intent !== q.predicted_intent) {
                        optionsHtml += `<option value="${intent}">${intent}</option>`;
                    }
                });
                optionsHtml += `</optgroup>`;
            });

            actionsHtml = `
                <div class="ai-actions">
                    <select class="intent-select-inline" id="select-${q.id}" onchange="handleSelectChange('${q.id}')">
                        ${optionsHtml}
                    </select>
                    <button class="ai-action-btn label-btn" id="btn-label-${q.id}" onclick="labelAndAdd('${q.id}')" disabled>
                        <i class="fa-solid fa-plus"></i> Add
                    </button>
                    <button class="ai-action-btn accept-btn" onclick="acceptPrediction('${q.id}', '${q.predicted_intent}')" title="Accept predicted intent">
                        <i class="fa-solid fa-check-double"></i> Accept
                    </button>
                    <button class="ai-action-btn dismiss-btn" onclick="dismissQuery('${q.id}')" title="Dismiss without adding">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
            `;
        } else {
            if (q.added_to_dataset) {
                actionsHtml = `<span class="text-sm text-muted">Labeled as: <strong>${q.assigned_intent}</strong></span>`;
            } else {
                actionsHtml = `<span class="text-sm text-muted">Dismissed by admin</span>`;
            }
        }

        tr.innerHTML = `
            <td><div class="query-text">${q.query}</div></td>
            <td><span class="intent-label">${q.predicted_intent}</span></td>
            <td><span class="confidence-badge ${confClass}">${(q.confidence).toFixed(2)}</span></td>
            <td>${statusHtml}</td>
            <td class="text-sm text-muted">${new Date(q.timestamp).toLocaleString()}</td>
            <td>${actionsHtml}</td>
        `;
        
        els.table.body.appendChild(tr);
    });
}

/**
 * Actions
 */
window.handleSelectChange = function(id) {
    const select = document.getElementById(`select-${id}`);
    const btn = document.getElementById(`btn-label-${id}`);
    if (select && btn) {
        btn.disabled = select.value === "";
    }
};

window.labelAndAdd = async function(id) {
    const select = document.getElementById(`select-${id}`);
    if (!select || !select.value) return;
    
    await processQueryUpdate(id, select.value, true);
};

window.acceptPrediction = async function(id, predictedIntent) {
    await processQueryUpdate(id, predictedIntent, true);
};

window.dismissQuery = async function(id) {
    // In a real implementation, we might want an endpoint to just mark as resolved without adding to dataset.
    // Since the backend only exposes add_to_dataset right now, we'll simulate a dismiss locally 
    // or we'd need to add a new proxy route. For this demo, let's update the local state.
    
    const query = queries.find(q => q.id === id);
    if (query) {
        query.resolved = true;
        query.added_to_dataset = false;
        query.reviewed_by = "admin";
        
        updateStats();
        renderTable();
        showToast("Query dismissed", "info");
    }
};

async function processQueryUpdate(id, intent, addToDataset) {
    const btn = document.getElementById(`btn-label-${id}`);
    const acceptBtn = document.querySelector(`button[onclick="acceptPrediction('${id}', '${intent}')"]`);
    
    if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    if (acceptBtn) acceptBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    const data = await adminFetch('/add-to-dataset', {
        method: 'POST',
        body: JSON.stringify({ id, intent })
    });

    if (data && data.success) {
        // Update local state
        const queryIndex = queries.findIndex(q => q.id === id);
        if (queryIndex !== -1) {
            queries[queryIndex].resolved = true;
            queries[queryIndex].added_to_dataset = true;
            queries[queryIndex].assigned_intent = intent;
            queries[queryIndex].reviewed_by = "admin";
            
            addedSinceRetrain++;
            
            updateStats();
            renderTable();
            updateRetrainPanel();
            showToast(`Added to training dataset`, "success");
        }
    } else {
        if (btn) btn.innerHTML = '<i class="fa-solid fa-plus"></i> Add';
        if (acceptBtn) acceptBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> Accept';
        showToast(data.message || "Failed to update query", "error");
    }
}

async function handleRetrain() {
    els.retrain.btn.classList.add('loading');
    els.retrain.btn.disabled = true;
    els.retrain.btn.innerHTML = '<i class="fa-solid fa-spinner"></i> Retraining...';

    const data = await adminFetch('/retrain', { method: 'POST' });

    els.retrain.btn.classList.remove('loading');
    
    if (data && data.success) {
        els.retrain.btn.innerHTML = '<i class="fa-solid fa-check"></i> Model Updated';
        els.retrain.btn.classList.replace('btn-primary', 'btn-success');
        
        addedSinceRetrain = 0;
        updateRetrainPanel();
        
        showToast("Model retrained successfully!", "success");
        
        setTimeout(() => {
            els.retrain.btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Retrain Model';
            els.retrain.btn.disabled = addedSinceRetrain === 0;
        }, 3000);
    } else {
        els.retrain.btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Retry Retrain';
        els.retrain.btn.disabled = false;
        showToast(data.message || "Failed to retrain model", "error");
    }
}

/**
 * Toast Notifications
 */
function showToast(message, type = 'info') {
    if (!els.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `ai-toast ${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    
    els.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);

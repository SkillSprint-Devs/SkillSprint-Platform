// ============================================
// task.js - Main Application Logic
// ============================================

// CONFIG
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
  ? 'http://localhost:5000/api/tasks'
  : '/api/tasks';
const TOKEN = localStorage.getItem('token') || '';

if (!TOKEN) {
  showToast('Please log in to manage tasks', 'warning');
  console.warn('No auth token found');
}

// STATE
let current = new Date();
let tasks = [];
let allTasks = [];
let selectedDate = null;
let currentFilter = 'all';
let currentSubtasks = [];
let editingId = null;

// DOM REFS
const monthLabel = document.getElementById('monthLabel');
const calendarGrid = document.getElementById('calendarGrid');
const prevBtn = document.getElementById('prevMonth');
const nextBtn = document.getElementById('nextMonth');
const taskListContainer = document.getElementById('taskListContainer');
const createBtn = document.getElementById('createBtn');
const resetBtn = document.getElementById('resetBtn');
const titleInput = document.getElementById('taskTitle');
const descInput = document.getElementById('taskDesc');
const priorityInput = document.getElementById('taskPriority');
const priorityOptions = document.getElementById('priorityOptions');
const dueInput = document.getElementById('taskDue');
const subTaskInput = document.getElementById('subTaskInput');
const addSubTaskBtn = document.getElementById('addSubTaskBtn');
const newSubTaskList = document.getElementById('newSubTaskList');
const statTotal = document.getElementById('statTotal');
const statCompleted = document.getElementById('statCompleted');
const statInProgress = document.getElementById('statInProgress');
const statWaiting = document.getElementById('statWaiting');
const searchInput = document.getElementById('searchInput');
const allTasksList = document.getElementById('allTasksList');

// UTILITIES
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(TOKEN ? { 'Authorization': 'Bearer ' + TOKEN } : {})
  };
}

function fmtDateISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function firstWeekday(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
}

function escapeHtml(str = '') {
  return ('' + str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// PRIORITY BUTTONS
if (priorityOptions) {
  priorityOptions.addEventListener('click', (e) => {
    if (e.target.classList.contains('p-btn')) {
      priorityOptions.querySelectorAll('.p-btn').forEach(b => b.classList.remove('selected'));
      e.target.classList.add('selected');
      priorityInput.value = e.target.dataset.value;
    }
  });
}

// SUBTASKS
addSubTaskBtn.addEventListener('click', () => {
  const val = subTaskInput.value.trim();
  if (!val) return;
  currentSubtasks.push({ title: val, completed: false });
  subTaskInput.value = '';
  renderSubtaskListUI();
});

subTaskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addSubTaskBtn.click();
  }
});

function renderSubtaskListUI() {
  newSubTaskList.innerHTML = '';
  currentSubtasks.forEach((st, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(st.title)}</span> <button onclick="removeSubTask(${idx})">&times;</button>`;
    newSubTaskList.appendChild(li);
  });
}

window.removeSubTask = function (idx) {
  currentSubtasks.splice(idx, 1);
  renderSubtaskListUI();
};

// RENDER CALENDAR
function renderCalendar() {
  const monthName = current.toLocaleString(undefined, { month: 'long' });
  const year = current.getFullYear();
  monthLabel.textContent = `${monthName} ${year}`;

  calendarGrid.innerHTML = '';

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  dayNames.forEach(d => {
    const el = document.createElement('div');
    el.className = 'day-header';
    el.textContent = d;
    calendarGrid.appendChild(el);
  });

  const firstDay = firstWeekday(current);
  const offset = (firstDay === 0) ? 6 : (firstDay - 1);
  const totalDays = daysInMonth(current);

  for (let i = 0; i < offset; i++) {
    const placeholder = document.createElement('div');
    calendarGrid.appendChild(placeholder);
  }

  for (let d = 1; d <= totalDays; d++) {
    const dateCell = document.createElement('div');
    dateCell.className = 'date-cell';

    const thisDate = new Date(current.getFullYear(), current.getMonth(), d);
    const iso = fmtDateISO(thisDate);
    const todayIso = new Date().toISOString().slice(0, 10);
    if (iso === todayIso) dateCell.classList.add('today');

    const num = document.createElement('div');
    num.className = 'date-num';
    num.textContent = d;
    dateCell.appendChild(num);

    const tasksForDate = allTasks.filter(t => {
      if (!t.dueDate) return false;
      const ds = (new Date(t.dueDate)).toISOString().slice(0, 10);
      return ds === iso;
    });

    if (tasksForDate.length > 0) {
      const dotsCont = document.createElement('div');
      dotsCont.className = 'task-dots';
      tasksForDate.slice(0, 3).forEach(t => {
        const dot = document.createElement('div');
        dot.className = `dot p-${t.priority || 'medium'}`;
        dotsCont.appendChild(dot);
      });
      dateCell.appendChild(dotsCont);
    }

    dateCell.addEventListener('click', () => {
      document.querySelectorAll('.date-cell').forEach(c => c.classList.remove('active'));
      dateCell.classList.add('active');
      selectedDate = iso;
      renderTaskListForDate(iso);
    });

    calendarGrid.appendChild(dateCell);
  }
}

function renderTaskListForDate(isoDate) {
  taskListContainer.innerHTML = `<h5>${isoDate}</h5>`;

  const list = allTasks.filter(t => {
    if (!t.dueDate) return false;
    return (new Date(t.dueDate)).toISOString().slice(0, 10) === isoDate;
  });

  if (!list.length) {
    taskListContainer.innerHTML += `<div style="font-size:0.8rem; color:#bfbfbf; font-style:italic; margin-top:0.5rem;">No tasks due.</div>`;
    return;
  }

  list.forEach(task => {
    const item = document.createElement('div');
    item.style.cssText = 'padding:0.5rem 0; border-bottom:1px solid rgba(26,26,26,0.1); font-size:0.85rem; display:flex; justify-content:space-between; align-items:center;';
    item.innerHTML = `
      <span style="font-weight:600; color:#1A1A1A;">${escapeHtml(task.title)}</span>
      <span class="dot p-${task.priority || 'medium'}"></span>
    `;
    taskListContainer.appendChild(item);
  });
}

// RENDER ALL TASKS WITH SUBTASKS
function renderAllTasks(filterType = 'all') {
  currentFilter = filterType;
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.filter === filterType) tab.classList.add('active');
  });

  let filtered = allTasks;
  if (filterType !== 'all') {
    filtered = allTasks.filter(t => (t.status === filterType) || (filterType === 'open' && !t.status));
  }
  filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  allTasksList.innerHTML = '';

  if (!filtered.length) {
    allTasksList.innerHTML = `<div class='empty-state'>
      <i class="fa-solid fa-inbox"></i>
      <p>No tasks found</p>
    </div>`;
    return;
  }

  filtered.forEach(task => {
    allTasksList.appendChild(createTaskCardElement(task));
  });
}

// TOGGLE SUBTASK - REAL-TIME PROGRESS UPDATE
window.toggleSubtask = async function (taskId, subIdx) {
  const task = allTasks.find(t => t._id === taskId);
  if (!task || !task.subTasks[subIdx]) return;

  // Toggle state
  task.subTasks[subIdx].completed = !task.subTasks[subIdx].completed;

  // Re-render immediately for instant visual feedback
  renderAllTasks(currentFilter);
  updateStats();

  // Persist to backend
  try {
    await fetch(`${API_BASE}/${taskId}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ subTasks: task.subTasks })
    });
  } catch (e) {
    console.error("Failed to save subtask state", e);
    showToast("Failed to save progress", "error");
  }
};

window.toggleTaskCompletion = async function (id, currentStatus) {
  const newStatus = currentStatus === 'completed' ? 'open' : 'completed';
  try {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error("Status update failed");

    // Update local state and re-render
    const updated = await res.json();
    allTasks = allTasks.map(t => t._id === id ? updated : t);
    tasks = tasks.map(t => t._id === id ? updated : t);
    updateStats();
    renderAllTasks(currentFilter);
    showToast(`Task marked as ${newStatus}`, "success");
  } catch (e) {
    console.error(e);
    showToast("Failed to update status", "error");
  }
};

// CRUD OPERATIONS
async function fetchTasks() {
  try {
    const res = await fetch(API_BASE, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch tasks');
    tasks = await res.json();

    const completedRes = await fetch(API_BASE + '?status=completed', { headers: authHeaders() });
    let completedTasks = [];
    if (completedRes.ok) completedTasks = await completedRes.json();

    allTasks = [...tasks, ...completedTasks];
    updateStats();
    renderCalendar();
    renderAllTasks(currentFilter);
    if (selectedDate) renderTaskListForDate(selectedDate);
  } catch (err) {
    console.error(err);
    showToast('Failed to load tasks', 'error');
  }
}

async function createTask(payload) {
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Create failed');
    const newTask = await res.json();

    allTasks.unshift(newTask);
    tasks.unshift(newTask);
    updateStats();
    renderCalendar();
    renderAllTasks(currentFilter);
    showToast('Task created successfully!', 'success');
    return newTask;
  } catch (err) {
    console.error(err);
    showToast('Create task failed', 'error');
  }
}

async function updateTask(id, updates) {
  try {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error('Update failed');
    const updated = await res.json();

    allTasks = allTasks.map(t => t._id === updated._id ? updated : t);
    tasks = tasks.map(t => t._id === updated._id ? updated : t);
    updateStats();
    renderCalendar();
    renderAllTasks(currentFilter);
    showToast('Task updated successfully!', 'success');
    return updated;
  } catch (err) {
    console.error(err);
    showToast('Update failed', 'error');
  }
}

window.deleteTask = async function (id) {
  if (!await showConfirm('Delete Task?', 'Are you sure you want to delete this task?', 'Delete', true)) return;

  try {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Delete failed');

    allTasks = allTasks.filter(t => t._id !== id);
    tasks = tasks.filter(t => t._id !== id);
    updateStats();
    renderCalendar();
    renderAllTasks(currentFilter);
    showToast('Task deleted successfully', 'success');
  } catch (err) {
    console.error(err);
    showToast('Delete failed', 'error');
  }
};

// FORM HANDLERS
async function onCreateClick() {
  const title = titleInput.value.trim();
  const description = descInput.value.trim();
  const priority = priorityInput.value;
  const dueDate = dueInput.value ? new Date(dueInput.value).toISOString() : null;

  if (!title) {
    showToast('Title is required', 'warning');
    return;
  }

  const payload = {
    title,
    description,
    priority,
    dueDate,
    subTasks: currentSubtasks
  };

  if (editingId) {
    await updateTask(editingId, payload);
    editingId = null;
    createBtn.innerHTML = '<i class="fa-solid fa-list-check"></i> Create Task';
  } else {
    await createTask(payload);
  }
  resetForm();
}

function populateFormForEdit(task) {
  editingId = task._id;
  titleInput.value = task.title || '';
  descInput.value = task.description || '';
  dueInput.value = task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '';
  priorityInput.value = task.priority || 'medium';

  priorityOptions.querySelectorAll('.p-btn').forEach(b => {
    b.classList.remove('selected');
    if (b.dataset.value === priorityInput.value) b.classList.add('selected');
  });

  currentSubtasks = task.subTasks ? [...task.subTasks] : [];
  renderSubtaskListUI();
  createBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.populateFormForEditWrapper = function (id) {
  const t = allTasks.find(x => x._id === id);
  if (t) populateFormForEdit(t);
};

function resetForm() {
  editingId = null;
  titleInput.value = '';
  descInput.value = '';
  priorityInput.value = 'low';
  dueInput.value = '';
  currentSubtasks = [];
  renderSubtaskListUI();

  priorityOptions.querySelectorAll('.p-btn').forEach(b => {
    b.classList.remove('selected');
    if (b.classList.contains('p-low')) b.classList.add('selected');
  });

  createBtn.innerHTML = '<i class="fa-solid fa-list-check"></i> Create Task';
}

function updateStats() {
  const total = allTasks.length;
  const completed = allTasks.filter(t => t.status === 'completed').length;
  const inProgress = allTasks.filter(t => t.status === 'in_progress').length;
  const waiting = allTasks.filter(t => !t.status || t.status === 'open').length;

  statTotal.textContent = total;
  statCompleted.textContent = completed;
  statInProgress.textContent = inProgress;
  statWaiting.textContent = waiting;
}

// EVENT LISTENERS
prevBtn.addEventListener('click', () => {
  current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
  renderCalendar();
});

nextBtn.addEventListener('click', () => {
  current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  renderCalendar();
});

createBtn.addEventListener('click', onCreateClick);
resetBtn.addEventListener('click', resetForm);

document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => renderAllTasks(tab.dataset.filter));
});

// GLOBAL EXPOSE FOR NAVBAR
window.filterTasksGlobal = function (query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    renderAllTasks(currentFilter);
    return;
  }

  const filtered = allTasks.filter(t =>
    (t.title || '').toLowerCase().includes(q) ||
    (t.description || '').toLowerCase().includes(q)
  );

  renderFilteredTasksList(filtered);
};

function renderFilteredTasksList(filtered) {
  allTasksList.innerHTML = '';
  if (!filtered.length) {
    allTasksList.innerHTML = `<div class='empty-state'>
          <i class="fa-solid fa-inbox"></i>
          <p>No results found</p>
        </div>`;
    return;
  }

  filtered.forEach(task => {
    // Reuse the logic from renderAllTasks but for the filtered list
    // (Better to refactor renderAllTasks to take a list, but for now I'll implement to ensure fix)
    allTasksList.appendChild(createTaskCardElement(task));
  });
}

// HELPER TO CREATE CARD (Refactoring for consistency)
function createTaskCardElement(task) {
  const el = document.createElement('div');
  const priorityClass = `task-${(task.priority || 'medium').toLowerCase()}`;
  el.className = `task-card ${priorityClass}`;

  if (!task.subTasks) task.subTasks = [];
  const totalSub = task.subTasks.length;
  const doneSub = task.subTasks.filter(s => s.completed).length;
  const pct = totalSub === 0 ? 0 : Math.round((doneSub / totalSub) * 100);

  let cardHTML = `
      <div class="task-card-header">
        <div style="display:flex;align-items:center;gap:12px;flex:1;">
          <div class="task-checkbox ${task.status === 'completed' ? 'checked' : ''}" onclick="event.stopPropagation(); toggleTaskCompletion('${task._id}', '${task.status}')">
             ${task.status === 'completed' ? '<i class="fa-solid fa-check" style="font-size:12px;color:white;"></i>' : ''}
          </div>
          <div class="task-title ${task.status === 'completed' ? 'completed-text' : ''}">${escapeHtml(task.title)}</div>
        </div>
        <button class="icon-action" onclick="event.stopPropagation(); deleteTask('${task._id}')" title="Delete">
           <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `;

  if (task.description) {
    cardHTML += `<div class="task-desc">${escapeHtml(task.description)}</div>`;
  }

  // Always show Progress Bar if subtasks exist
  if (totalSub > 0) {
    cardHTML += `
        <div class="task-progress-wrapper">
          <div class="progress-track">
            <div class="progress-fill" style="width: ${pct}%"></div>
          </div>
          <div class="progress-text">${pct}%</div>
        </div>
        <div class="subtasks-container">
           ${task.subTasks.map((st, i) => `
             <div class="st-chip ${st.completed ? 'done' : ''}" onclick="event.stopPropagation(); toggleSubtask('${task._id}', ${i})">
               <div class="st-check"></div>
               <span class="st-label">${escapeHtml(st.title)}</span>
             </div>
           `).join('')}
        </div>
      `;
  }

  cardHTML += `
      <div class="task-footer">
        <div class="task-meta">
          <div class="meta-item"><i class="fa-solid fa-flag"></i> ${(task.priority || 'medium').toUpperCase()}</div>
          <div class="meta-item"><i class="fa-solid fa-calendar"></i> ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No Date'}</div>
          ${totalSub > 0 ? `<div class="meta-item"><i class="fa-solid fa-list-check"></i> ${doneSub}/${totalSub}</div>` : ''}
        </div>
        <button class="icon-action" onclick="event.stopPropagation(); populateFormForEditWrapper('${task._id}')" title="Edit">
           <i class="fa-solid fa-pen-to-square"></i>
        </button>
      </div>
    `;

  el.innerHTML = cardHTML;
  return el;
}

if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    window.filterTasksGlobal(e.target.value);
  });
}

// INIT
async function init() {
  current = new Date(current.getFullYear(), current.getMonth(), 1);
  await fetchTasks();
  renderCalendar();
  renderAllTasks('all');
}

if (allTasksList) {
  init();
}

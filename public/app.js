let workouts        = [];
let schedule        = {};
let currentWeekStart = getMonday(new Date());
let deleteTarget    = null;
let skipFormReset   = false;

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

//Connects frontend to backend for API
async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login.html';
    throw new Error('You must be logged in.');
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`
  };
  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
    throw new Error('Your login has expired.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// Loads the signed-in user into the header
async function loadCurrentUser() {
  const user = await apiFetch('/api/auth/me');
  document.getElementById('account-name').textContent = user.name;
  document.getElementById('account-email').textContent = user.email;
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login.html';
}

function openDeleteAccountModal() {
  document.getElementById('delete-account-modal').style.display = 'flex';
}

function closeDeleteAccountModal() {
  document.getElementById('delete-account-modal').style.display = 'none';
}

async function deleteAccount() {
  const button = document.getElementById('confirm-account-delete');
  button.disabled = true;
  button.textContent = 'Deleting...';

  try {
    await apiFetch('/api/auth/account', { method: 'DELETE' });
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html?deleted=1';
  } catch (err) {
    showToast(err.message, 'error');
    button.disabled = false;
    button.textContent = 'Delete Account';
  }
}

//Load all data on startup
async function loadAll() {
  try {
    [workouts, schedule] = await Promise.all([
      apiFetch('/api/workouts'),
      apiFetch('/api/schedule')
    ]);
    updateNavStat();
  } catch (err) {
    console.error('Error loading data:', err);
    showToast('Failed to load data', 'error');
  }
}

/*  Workout API  */
async function apiCreateWorkout(data) {
  const w = await apiFetch('/api/workouts', { method: 'POST', body: JSON.stringify(data) });
  workouts.push(w);
  updateNavStat();
  return w;
}

async function apiUpdateWorkout(id, data) {
  const w = await apiFetch(`/api/workouts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  const idx = workouts.findIndex(x => x.id === id);
  if (idx > -1) workouts[idx] = w;
  return w;
}

async function apiDeleteWorkout(id) {
  await apiFetch(`/api/workouts/${id}`, { method: 'DELETE' });
  workouts = workouts.filter(w => w.id !== id);
  Object.keys(schedule).forEach(d => {
    schedule[d] = (schedule[d] || []).filter(wid => wid !== id);
  });
  updateNavStat();
}

/*  Schedule API  */
async function apiSetSchedule(date, workoutIds) {
  const r = await apiFetch(`/api/schedule/${date}`, {
    method: 'PUT',
    body: JSON.stringify({ workoutIds })
  });
  schedule[date] = r.workoutIds;
}

async function apiRemoveFromSchedule(date, index) {
  await apiFetch(`/api/schedule/${date}/${index}`, { method: 'DELETE' });
  if (schedule[date]) schedule[date].splice(index, 1);
}

//Starts on monday
function getMonday(d) {
  const date = new Date(d);
  const day  = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0);
  return date;
}

//moves forward/backward in time
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

//changes date format 
function toKey(d)       { return d.toISOString().slice(0, 10); }
function getWorkout(id) { return workouts.find(w => w.id === id); }

function formatDate(d) {
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
}

function isToday(d) {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() &&
         d.getMonth()    === t.getMonth()    &&
         d.getDate()     === t.getDate();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Notification */
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.className = 'toast'), 2800);
}

/* Total workouts */
function updateNavStat() {
  document.getElementById('nav-total-workouts').textContent = workouts.length;
}

//Shows page 
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + id).classList.add('active');
  document.querySelector(`[data-view="${id}"]`).classList.add('active');

  if (id === 'planner')  renderPlanner();
  if (id === 'workouts') renderWorkoutList();
  if (id === 'create') {
    if (skipFormReset) {
      skipFormReset = false; 
    } else {
      resetForm();
      document.getElementById('form-view-title').textContent = 'Create Workout';
    }
  }
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    showView(btn.dataset.view);
  });
});


document.getElementById('goto-create-from-list').addEventListener('click', () => showView('create'));
document.getElementById('goto-home-from-list').addEventListener('click', () => showView('planner'));

document.getElementById('btn-goto-create').addEventListener('click', () => showView('create'));
document.getElementById('btn-goto-workouts').addEventListener('click', () => showView('workouts'));

/*  Builds weekly planner */
function renderPlanner() {
const table = document.getElementById('planner-table');
table.innerHTML = '';

const headerRow = document.createElement('tr');
const bodyRow   = document.createElement('tr');

for (let i = 0; i < 7; i++) {
const day = addDays(currentWeekStart, i);
const key = toKey(day);
const items = schedule[key] || [];


/*  Creates table Header  */
const th = document.createElement('th');
th.innerHTML = `
  ${DAYS[i]}<br>
  <small>${formatDate(day)}</small>
`;
headerRow.appendChild(th);

/*  Creates cell column for each day  */
const td = document.createElement('td');

/* Displays workouts in that day */
items.forEach((wid, idx) => {
  const w = getWorkout(wid);
  if (!w) return;

  const div = document.createElement('div');
  div.className = 'table-pill';
  div.innerHTML = `
    ${escHtml(w.name)}
    ${escHtml(w.reps)}
    <button style="margin-left:5px;">✕</button>
  `;

  div.querySelector('button').onclick = () => {
    removeFromSchedule(key, idx);
  };

  td.appendChild(div);
});

/* add button */
const addBtn = document.createElement('button');
addBtn.textContent = '+ Add';
addBtn.onclick = () => openAssignModal(key, DAYS[i]);

td.appendChild(addBtn);
bodyRow.appendChild(td);

}

table.appendChild(headerRow);
table.appendChild(bodyRow);
}

//Add to schedule
async function addToSchedule(dateKey, wid) {
const updated = [...(schedule[dateKey] || []), wid];

await apiSetSchedule(dateKey, updated);

await loadAll();      
renderPlanner();
}

//Remove from schedule
async function removeFromSchedule(dateKey, idx) {
await apiRemoveFromSchedule(dateKey, idx);

await loadAll();       
renderPlanner();
}

/*  Week navigation  */
document.getElementById('prev-week').addEventListener('click', () => {
  currentWeekStart = addDays(currentWeekStart, -7);
  renderPlanner();
});
document.getElementById('next-week').addEventListener('click', () => {
  currentWeekStart = addDays(currentWeekStart, 7);
  renderPlanner();
});

/* ASSIGN MODAL */
function openAssignModal(dateKey, dayName) {
  document.getElementById('modal-day-label').textContent = dayName;

  const list = document.getElementById('modal-workout-list');
  list.innerHTML = '';

  if (workouts.length === 0) {
    list.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; color: var(--text-muted);">
          No workouts yet — create some first!
        </td>
      </tr>
    `;
  } else {
    workouts.forEach(w => {
      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td>${escHtml(w.name)}</td>
        <td>${escHtml(w.target)}</td>
        <td>${escHtml(w.reps)}</td>
        <td>${escHtml(w.equipment || '—')}</td>
        <td>
          <button class="btn-primary modal-add-btn">Add</button>
        </td>
      `;

      tr.querySelector('button').addEventListener('click', async () => {
        closeAssignModal();
        await addToSchedule(dateKey, w.id);
      });

      list.appendChild(tr);
    });
  }

  document.getElementById('assign-modal').style.display = 'flex';
}

function closeAssignModal() {
  document.getElementById('assign-modal').style.display = 'none';
}

document.getElementById('close-assign-modal').addEventListener('click', closeAssignModal);
document.getElementById('assign-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('assign-modal')) closeAssignModal();
});

/* ALL WORKOUTS VIEW */
function renderWorkoutList(filter = '') {
  const tbody = document.getElementById('workout-tbody');
  const empty = document.getElementById('empty-workouts');

  tbody.innerHTML = '';

  const filtered = workouts.filter(w =>
    !filter ||
    w.name.toLowerCase().includes(filter) ||
    w.target.toLowerCase().includes(filter)
  );

  if (filtered.length === 0) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  filtered.forEach(w => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${escHtml(w.name)}</td>
      <td>${escHtml(w.target)}</td>
      <td>${escHtml(w.reps)}</td>
      <td>${escHtml(w.equipment || '—')}</td>
      <td>
        <button class="btn-secondary edit-btn">Edit</button>
        <button class="btn-danger delete-btn">Delete</button>
      </td>
    `;

    tr.querySelector('.edit-btn').addEventListener('click', () => openEditForm(w.id));
    tr.querySelector('.delete-btn').addEventListener('click', () => openDeleteModal(w.id));

    tbody.appendChild(tr);
  });
}

document.getElementById('workout-search').addEventListener('input', e => {
  renderWorkoutList(e.target.value.toLowerCase().trim());
});

/* ── Edit form ── */
function openEditForm(id) {
  const w = getWorkout(id);
  if (!w) return;
  document.getElementById('edit-id').value     = id;
  document.getElementById('f-name').value      = w.name;
  document.getElementById('f-target').value    = w.target;
  document.getElementById('f-reps').value      = w.reps;
  document.getElementById('f-equipment').value = w.equipment || '';
  document.getElementById('form-view-title').textContent = 'Edit Workout';
  skipFormReset = true;
  showView('create');
}

/* ── Delete modal ── */
function openDeleteModal(id) {
  deleteTarget = { id };
  document.getElementById('delete-modal-msg').textContent =
    'This will permanently remove the workout and unschedule it from all days.';
  document.getElementById('delete-modal').style.display = 'flex';
}

document.getElementById('cancel-delete').addEventListener('click', () => {
  document.getElementById('delete-modal').style.display = 'none';
  deleteTarget = null;
});

document.getElementById('confirm-delete').addEventListener('click', async () => {
  if (!deleteTarget) return;
  try {
    await apiDeleteWorkout(deleteTarget.id);
    renderWorkoutList(document.getElementById('workout-search').value.toLowerCase().trim());
    showToast('Workout deleted', 'error');
  } catch (e) {
    showToast(e.message, 'error');
  }
  document.getElementById('delete-modal').style.display = 'none';
  deleteTarget = null;
});

/* CREATE / EDIT FORM */
function resetForm() {
  ['f-name', 'f-reps', 'f-equipment', 'edit-id'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-target').value = '';
}

document.getElementById('save-workout').addEventListener('click', async () => {
  const name      = document.getElementById('f-name').value.trim();
  const target    = document.getElementById('f-target').value;
  const reps      = document.getElementById('f-reps').value.trim();
  const equipment = document.getElementById('f-equipment').value.trim();
  const editId    = document.getElementById('edit-id').value;

  if (!name)   { shakeInput('f-name');   return; }
  if (!target) { shakeInput('f-target'); return; }
  if (!reps)   { shakeInput('f-reps');   return; }

  try {
    if (editId) {
      await apiUpdateWorkout(editId, { name, target, reps, equipment});
      showToast('Workout updated ✓');
    } else {
      await apiCreateWorkout({ name, target, reps, equipment});
      showToast('Workout created ✓');
    }
    showView('workouts');
  } catch (e) {
    showToast(e.message, 'error');
  }
});

document.getElementById('cancel-form').addEventListener('click', () => showView('workouts'));

//shake if there is an error
function shakeInput(id) {
  const el = document.getElementById(id);
  el.style.borderColor = 'var(--red)';
  el.style.boxShadow   = '0 0 0 3px rgba(255,77,94,0.2)';
  el.focus();
  setTimeout(() => { el.style.borderColor = ''; el.style.boxShadow = ''; }, 1500);
}

/* INIT */
(async () => {
  if (!localStorage.getItem('token')) {
    window.location.href = '/login.html';
    return;
  }
  document.getElementById('logout-btn')?.addEventListener('click', logout);
  document.getElementById('delete-account-btn')?.addEventListener('click', openDeleteAccountModal);
  document.getElementById('cancel-account-delete')?.addEventListener('click', closeDeleteAccountModal);
  document.getElementById('confirm-account-delete')?.addEventListener('click', deleteAccount);
  document.getElementById('delete-account-modal')?.addEventListener('click', event => {
    if (event.target === document.getElementById('delete-account-modal')) closeDeleteAccountModal();
  });
  await loadCurrentUser();
  await loadAll();
  renderPlanner();
})();
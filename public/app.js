let workouts = [];
let groups = [];
let schedule = {};
let currentWeekStart = getMonday(new Date());
let deleteTarget = null;
let deleteGroupTarget = null;
let addToGroupWorkoutId = null;
let skipFormReset = false;

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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

async function loadAll() {
  try {
    [workouts, groups, schedule] = await Promise.all([
      apiFetch('/api/workouts'),
      apiFetch('/api/groups'),
      apiFetch('/api/schedule')
    ]);
    updateNavStat();
  } catch (err) {
    console.error('Error loading data:', err);
    showToast('Failed to load data', 'error');
  }
}

/* WORKOUT API */
async function apiCreateWorkout(data) {
  const workout = await apiFetch('/api/workouts', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  workouts.push(workout);
  updateNavStat();
  return workout;
}

async function apiUpdateWorkout(id, data) {
  const workout = await apiFetch(`/api/workouts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  const index = workouts.findIndex(item => item.id === id);
  if (index > -1) workouts[index] = workout;
  return workout;
}

async function apiDeleteWorkout(id) {
  await apiFetch(`/api/workouts/${id}`, { method: 'DELETE' });
  await loadAll();
}

/* GROUP API */
async function apiCreateGroup(data) {
  const group = await apiFetch('/api/groups', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  groups.push(group);
  return group;
}

async function apiAddWorkoutToGroup(groupId, workoutId) {
  const updated = await apiFetch(`/api/groups/${groupId}/workouts/${workoutId}`, {
    method: 'POST'
  });
  const index = groups.findIndex(group => group.id === groupId);
  if (index > -1) groups[index] = updated;
  return updated;
}

async function apiRemoveWorkoutFromGroup(groupId, workoutId) {
  const updated = await apiFetch(`/api/groups/${groupId}/workouts/${workoutId}`, {
    method: 'DELETE'
  });
  const index = groups.findIndex(group => group.id === groupId);
  if (index > -1) groups[index] = updated;
  return updated;
}

async function apiDeleteGroup(id) {
  await apiFetch(`/api/groups/${id}`, { method: 'DELETE' });
  await loadAll();
}

/* SCHEDULE API */
async function apiSetSchedule(date, items) {
  const response = await apiFetch(`/api/schedule/${date}`, {
    method: 'PUT',
    body: JSON.stringify({ items })
  });
  schedule[date] = response.items;
}

async function apiRemoveFromSchedule(date, index) {
  await apiFetch(`/api/schedule/${date}/${index}`, { method: 'DELETE' });
  if (schedule[date]) schedule[date].splice(index, 1);
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d, n) {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function toKey(d) { return d.toISOString().slice(0, 10); }
function getWorkout(id) { return workouts.find(workout => workout.id === id); }
function getGroup(id) { return groups.find(group => group.id === id); }

function formatDate(d) {
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => (toast.className = 'toast'), 2800);
}

function updateNavStat() {
  document.getElementById('nav-total-workouts').textContent = workouts.length;
}

function showView(id) {
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

  document.getElementById(`view-${id}`).classList.add('active');
  document.querySelector(`[data-view="${id}"]`)?.classList.add('active');

  if (id === 'planner') renderPlanner();
  if (id === 'workouts') renderWorkoutList();
  if (id === 'groups') renderGroups();
  if (id === 'create') {
    if (skipFormReset) {
      skipFormReset = false;
    } else {
      resetForm();
      document.getElementById('form-view-title').textContent = 'Create Workout';
    }
  }
}

/* NAVIGATION */
document.getElementById('goto-create-from-list').addEventListener('click', () => showView('create'));
document.getElementById('goto-home-from-list').addEventListener('click', () => showView('planner'));
document.getElementById('goto-groups-from-list').addEventListener('click', () => showView('groups'));
document.getElementById('goto-home-from-groups').addEventListener('click', () => showView('planner'));
document.getElementById('goto-workouts-from-groups').addEventListener('click', () => showView('workouts'));
document.getElementById('btn-goto-create').addEventListener('click', () => showView('create'));
document.getElementById('btn-goto-workouts').addEventListener('click', () => showView('workouts'));
document.getElementById('btn-goto-groups').addEventListener('click', () => showView('groups'));

/* WEEKLY PLANNER */
function renderPlanner() {
  const table = document.getElementById('planner-table');
  table.innerHTML = '';

  const headerRow = document.createElement('tr');
  const bodyRow = document.createElement('tr');

  for (let i = 0; i < 7; i++) {
    const day = addDays(currentWeekStart, i);
    const key = toKey(day);
    const items = schedule[key] || [];

    const th = document.createElement('th');
    th.innerHTML = `${DAYS[i]}<br><small>${formatDate(day)}</small>`;
    headerRow.appendChild(th);

    const td = document.createElement('td');

    items.forEach((item, index) => {
      const normalized = typeof item === 'string'
        ? { type: 'workout', id: item }
        : item;

      let label = '';
      let details = '';
      let extraClass = '';

      if (normalized.type === 'group') {
        const group = getGroup(normalized.id);
        if (!group) return;
        label = group.name;
        // Only the group name is shown in the calendar, as requested.
        extraClass = ' group-calendar-pill';
      } else {
        const workout = getWorkout(normalized.id);
        if (!workout) return;
        label = workout.name;
        details = workout.reps;
      }

      const pill = document.createElement('div');
      pill.className = `table-pill${extraClass}`;
      pill.innerHTML = `
        <span class="calendar-item-name">${escHtml(label)}</span>
        ${details ? `<span class="calendar-item-details">${escHtml(details)}</span>` : ''}
        <button class="calendar-remove-btn" type="button" aria-label="Remove">✕</button>
      `;

      pill.querySelector('button').addEventListener('click', () => removeFromSchedule(key, index));
      td.appendChild(pill);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'calendar-add-btn';
    addBtn.textContent = '+ Add';
    addBtn.addEventListener('click', () => openAssignModal(key, DAYS[i]));
    td.appendChild(addBtn);

    bodyRow.appendChild(td);
  }

  table.appendChild(headerRow);
  table.appendChild(bodyRow);

  const weekEnd = addDays(currentWeekStart, 6);
  document.getElementById('week-label').textContent =
    `${formatDate(currentWeekStart)} – ${formatDate(weekEnd)}`;
}

async function addScheduleItem(dateKey, type, id) {
  const updated = [...(schedule[dateKey] || []), { type, id }];
  await apiSetSchedule(dateKey, updated);
  await loadAll();
  renderPlanner();
}

async function removeFromSchedule(dateKey, index) {
  try {
    await apiRemoveFromSchedule(dateKey, index);
    await loadAll();
    renderPlanner();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

document.getElementById('prev-week').addEventListener('click', () => {
  currentWeekStart = addDays(currentWeekStart, -7);
  renderPlanner();
});

document.getElementById('next-week').addEventListener('click', () => {
  currentWeekStart = addDays(currentWeekStart, 7);
  renderPlanner();
});

/* ASSIGN TO CALENDAR MODAL */
function openAssignModal(dateKey, dayName) {
  document.getElementById('modal-day-label').textContent = dayName;

  const workoutList = document.getElementById('modal-workout-list');
  workoutList.innerHTML = '';

  if (workouts.length === 0) {
    workoutList.innerHTML = '<tr><td colspan="5" class="modal-empty-row">No workouts yet.</td></tr>';
  } else {
    workouts.forEach(workout => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escHtml(workout.name)}</td>
        <td>${escHtml(workout.target)}</td>
        <td>${escHtml(workout.reps)}</td>
        <td>${escHtml(workout.equipment || '—')}</td>
        <td><button class="btn-primary modal-add-btn" type="button">Add</button></td>
      `;
      row.querySelector('button').addEventListener('click', async () => {
        closeAssignModal();
        try {
          await addScheduleItem(dateKey, 'workout', workout.id);
          showToast('Workout added to planner');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
      workoutList.appendChild(row);
    });
  }

  const groupList = document.getElementById('modal-group-list');
  groupList.innerHTML = '';

  if (groups.length === 0) {
    groupList.innerHTML = '<div class="modal-empty-card">No groups yet. Create a group first.</div>';
  } else {
    groups.forEach(group => {
      const row = document.createElement('div');
      row.className = 'modal-group-item';
      row.innerHTML = `
        <div>
          <strong>${escHtml(group.name)}</strong>
          <span>${group.workoutIds?.length || 0} workout${(group.workoutIds?.length || 0) === 1 ? '' : 's'}</span>
        </div>
        <button class="btn-primary modal-add-btn" type="button">Add Group</button>
      `;
      row.querySelector('button').addEventListener('click', async () => {
        closeAssignModal();
        try {
          await addScheduleItem(dateKey, 'group', group.id);
          showToast('Group added to planner');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
      groupList.appendChild(row);
    });
  }

  document.getElementById('assign-modal').style.display = 'flex';
}

function closeAssignModal() {
  document.getElementById('assign-modal').style.display = 'none';
}

document.getElementById('close-assign-modal').addEventListener('click', closeAssignModal);
document.getElementById('assign-modal').addEventListener('click', event => {
  if (event.target === document.getElementById('assign-modal')) closeAssignModal();
});

/* ALL WORKOUTS */
function renderWorkoutList(filter = '') {
  const tbody = document.getElementById('workout-tbody');
  const empty = document.getElementById('empty-workouts');
  tbody.innerHTML = '';

  const filtered = workouts.filter(workout =>
    !filter ||
    workout.name.toLowerCase().includes(filter) ||
    workout.target.toLowerCase().includes(filter)
  );

  if (filtered.length === 0) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  filtered.forEach(workout => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escHtml(workout.name)}</td>
      <td>${escHtml(workout.target)}</td>
      <td>${escHtml(workout.reps)}</td>
      <td>${escHtml(workout.equipment || '—')}</td>
      <td class="workout-actions-cell">
        <button class="btn-primary add-group-btn" type="button">Add</button>
        <button class="btn-secondary edit-btn" type="button">Edit</button>
        <button class="btn-danger delete-btn" type="button">Delete</button>
      </td>
    `;

    row.querySelector('.add-group-btn').addEventListener('click', () => openAddToGroupModal(workout.id));
    row.querySelector('.edit-btn').addEventListener('click', () => openEditForm(workout.id));
    row.querySelector('.delete-btn').addEventListener('click', () => openDeleteModal(workout.id));
    tbody.appendChild(row);
  });
}

document.getElementById('workout-search').addEventListener('input', event => {
  renderWorkoutList(event.target.value.toLowerCase().trim());
});

/* ADD WORKOUT TO GROUP MODAL */
function openAddToGroupModal(workoutId) {
  addToGroupWorkoutId = workoutId;
  const workout = getWorkout(workoutId);
  document.getElementById('add-to-group-workout-name').textContent = workout?.name || 'Workout';

  const list = document.getElementById('group-choice-list');
  list.innerHTML = '';

  if (groups.length === 0) {
    list.innerHTML = `
      <div class="modal-empty-card">
        You have no groups yet.<br>
        <button class="btn-primary create-group-from-modal" type="button">Create a Group</button>
      </div>
    `;
    list.querySelector('button').addEventListener('click', () => {
      closeAddToGroupModal();
      showView('groups');
      document.getElementById('group-name').focus();
    });
  } else {
    groups.forEach(group => {
      const alreadyAdded = (group.workoutIds || []).includes(workoutId);
      const item = document.createElement('div');
      item.className = 'group-choice-item';
      item.innerHTML = `
        <div>
          <strong>${escHtml(group.name)}</strong>
          <span>${escHtml(group.description || 'No description')}</span>
        </div>
        <button class="${alreadyAdded ? 'btn-secondary' : 'btn-primary'}" type="button" ${alreadyAdded ? 'disabled' : ''}>
          ${alreadyAdded ? 'Added' : 'Add'}
        </button>
      `;

      if (!alreadyAdded) {
        item.querySelector('button').addEventListener('click', async () => {
          try {
            await apiAddWorkoutToGroup(group.id, workoutId);
            showToast(`${workout.name} added to ${group.name}`);
            openAddToGroupModal(workoutId);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }
      list.appendChild(item);
    });
  }

  document.getElementById('add-to-group-modal').style.display = 'flex';
}

function closeAddToGroupModal() {
  addToGroupWorkoutId = null;
  document.getElementById('add-to-group-modal').style.display = 'none';
}

document.getElementById('close-add-to-group-modal').addEventListener('click', closeAddToGroupModal);
document.getElementById('add-to-group-modal').addEventListener('click', event => {
  if (event.target === document.getElementById('add-to-group-modal')) closeAddToGroupModal();
});

/* GROUPS VIEW */
function renderGroups() {
  const list = document.getElementById('groups-list');
  const empty = document.getElementById('empty-groups');
  list.innerHTML = '';

  if (groups.length === 0) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  groups.forEach(group => {
    const card = document.createElement('article');
    card.className = 'group-card';

    const memberWorkouts = (group.workoutIds || [])
      .map(id => getWorkout(id))
      .filter(Boolean);

    card.innerHTML = `
      <div class="group-card-header">
        <div>
          <h2>${escHtml(group.name)}</h2>
          <p>${escHtml(group.description || 'No description')}</p>
        </div>
        <button class="btn-danger group-delete-btn" type="button">Delete Group</button>
      </div>
      <div class="group-count">${memberWorkouts.length} workout${memberWorkouts.length === 1 ? '' : 's'}</div>
      <div class="group-workouts"></div>
    `;

    const workoutList = card.querySelector('.group-workouts');
    if (memberWorkouts.length === 0) {
      workoutList.innerHTML = '<div class="group-empty">No workouts in this group yet. Go to All Workouts and press Add.</div>';
    } else {
      memberWorkouts.forEach(workout => {
        const row = document.createElement('div');
        row.className = 'group-workout-row';
        row.innerHTML = `
          <div class="group-workout-info">
            <strong>${escHtml(workout.name)}</strong>
            <span>${escHtml(workout.target)} • ${escHtml(workout.reps)} • ${escHtml(workout.equipment || 'No equipment')}</span>
          </div>
          <button class="btn-secondary remove-from-group-btn" type="button">Remove</button>
        `;
        row.querySelector('button').addEventListener('click', async () => {
          try {
            await apiRemoveWorkoutFromGroup(group.id, workout.id);
            renderGroups();
            showToast(`${workout.name} removed from ${group.name}`);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
        workoutList.appendChild(row);
      });
    }

    card.querySelector('.group-delete-btn').addEventListener('click', () => openDeleteGroupModal(group.id));
    list.appendChild(card);
  });
}

document.getElementById('create-group').addEventListener('click', async () => {
  const nameInput = document.getElementById('group-name');
  const descriptionInput = document.getElementById('group-description');
  const name = nameInput.value.trim();
  const description = descriptionInput.value.trim();

  if (!name) {
    shakeInput('group-name');
    return;
  }

  try {
    await apiCreateGroup({ name, description });
    nameInput.value = '';
    descriptionInput.value = '';
    renderGroups();
    showToast('Group created ✓');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

function openDeleteGroupModal(id) {
  deleteGroupTarget = id;
  const group = getGroup(id);
  document.getElementById('delete-group-msg').textContent =
    `Delete ${group?.name || 'this group'}? It will be removed from the planner, but its workouts will not be deleted.`;
  document.getElementById('delete-group-modal').style.display = 'flex';
}

function closeDeleteGroupModal() {
  deleteGroupTarget = null;
  document.getElementById('delete-group-modal').style.display = 'none';
}

document.getElementById('cancel-group-delete').addEventListener('click', closeDeleteGroupModal);
document.getElementById('confirm-group-delete').addEventListener('click', async () => {
  if (!deleteGroupTarget) return;
  try {
    await apiDeleteGroup(deleteGroupTarget);
    closeDeleteGroupModal();
    renderGroups();
    showToast('Group deleted', 'error');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('delete-group-modal').addEventListener('click', event => {
  if (event.target === document.getElementById('delete-group-modal')) closeDeleteGroupModal();
});

/* EDIT WORKOUT */
function openEditForm(id) {
  const workout = getWorkout(id);
  if (!workout) return;

  document.getElementById('edit-id').value = id;
  document.getElementById('f-name').value = workout.name;
  document.getElementById('f-target').value = workout.target;
  document.getElementById('f-reps').value = workout.reps;
  document.getElementById('f-equipment').value = workout.equipment || '';
  document.getElementById('form-view-title').textContent = 'Edit Workout';
  skipFormReset = true;
  showView('create');
}

/* DELETE WORKOUT */
function openDeleteModal(id) {
  deleteTarget = { id };
  document.getElementById('delete-modal-msg').textContent =
    'This permanently removes the workout, removes it from groups and unschedules direct calendar entries.';
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
  } catch (err) {
    showToast(err.message, 'error');
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
  const name = document.getElementById('f-name').value.trim();
  const target = document.getElementById('f-target').value;
  const reps = document.getElementById('f-reps').value.trim();
  const equipment = document.getElementById('f-equipment').value.trim();
  const editId = document.getElementById('edit-id').value;

  if (!name) { shakeInput('f-name'); return; }
  if (!target) { shakeInput('f-target'); return; }
  if (!reps) { shakeInput('f-reps'); return; }

  try {
    if (editId) {
      await apiUpdateWorkout(editId, { name, target, reps, equipment });
      showToast('Workout updated ✓');
    } else {
      await apiCreateWorkout({ name, target, reps, equipment });
      showToast('Workout created ✓');
    }
    showView('workouts');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('cancel-form').addEventListener('click', () => showView('workouts'));

function shakeInput(id) {
  const element = document.getElementById(id);
  element.style.borderColor = 'var(--red)';
  element.style.boxShadow = '0 0 0 3px rgba(255,77,94,0.2)';
  element.focus();
  setTimeout(() => {
    element.style.borderColor = '';
    element.style.boxShadow = '';
  }, 1500);
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

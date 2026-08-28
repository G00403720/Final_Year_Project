const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fitweek-fitness-planner';

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const WORKOUTS_FILE = path.join(DATA_DIR, 'workouts.json');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function ensureJsonFile(file, initialData) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(initialData, null, 2), 'utf8');
  }
}

ensureJsonFile(USERS_FILE, []);
ensureJsonFile(WORKOUTS_FILE, []);
ensureJsonFile(GROUPS_FILE, []);
ensureJsonFile(SCHEDULE_FILE, {});

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Could not read ${file}:`, err.message);
    return fallback;
  }
}

function writeJson(file, data) {
  const tempFile = `${file}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
  fs.copyFileSync(tempFile, file);
  fs.unlinkSync(tempFile);
}

function readUsers() {
  const data = readJson(USERS_FILE, []);
  return Array.isArray(data) ? data : [];
}
function writeUsers(data) { writeJson(USERS_FILE, data); }

function readWorkouts() {
  const data = readJson(WORKOUTS_FILE, []);
  return Array.isArray(data) ? data : [];
}
function writeWorkouts(data) { writeJson(WORKOUTS_FILE, data); }

function readGroups() {
  const data = readJson(GROUPS_FILE, []);
  return Array.isArray(data) ? data : [];
}
function writeGroups(data) { writeJson(GROUPS_FILE, data); }

function readSchedule() {
  const data = readJson(SCHEDULE_FILE, {});
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}
function writeSchedule(data) { writeJson(SCHEDULE_FILE, data); }

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function createToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'You must be logged in.' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Your login has expired. Please log in again.' });
  }
}

function normalizeScheduleItem(item) {
  // Backwards compatibility: older schedules stored workout IDs as strings.
  if (typeof item === 'string') return { type: 'workout', id: item };
  if (!item || typeof item !== 'object') return null;
  if (!['workout', 'group'].includes(item.type) || !item.id) return null;
  return { type: item.type, id: String(item.id) };
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* AUTH API */
app.post('/api/auth/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const users = readUsers();
    if (users.some(user => user.email === email)) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const user = {
      id: uid(),
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12)
    };

    users.push(user);
    writeUsers(users);

    res.status(201).json({
      token: createToken(user),
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = readUsers().find(item => item.email === email);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    res.json({
      token: createToken(user),
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not log in.' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = readUsers().find(item => item.id === req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ id: user.id, name: user.name, email: user.email });
});

app.delete('/api/auth/account', requireAuth, (req, res) => {
  const userId = req.user.userId;
  const users = readUsers();
  if (!users.some(item => item.id === userId)) {
    return res.status(404).json({ error: 'User not found.' });
  }

  writeUsers(users.filter(item => item.id !== userId));
  writeWorkouts(readWorkouts().filter(workout => workout.userId !== userId));
  writeGroups(readGroups().filter(group => group.userId !== userId));

  const schedule = readSchedule();
  delete schedule[userId];
  writeSchedule(schedule);

  res.json({ success: true });
});

/* WORKOUTS API */
app.get('/api/workouts', requireAuth, (req, res) => {
  res.json(readWorkouts().filter(workout => workout.userId === req.user.userId));
});

app.post('/api/workouts', requireAuth, (req, res) => {
  const { name, target, reps, equipment } = req.body;
  if (!name || !target || !reps) {
    return res.status(400).json({ error: 'Name, target and reps are required.' });
  }

  const workouts = readWorkouts();
  const workout = {
    id: uid(),
    userId: req.user.userId,
    name: String(name).trim(),
    target: String(target).trim(),
    reps: String(reps).trim(),
    equipment: String(equipment || '').trim()
  };

  workouts.push(workout);
  writeWorkouts(workouts);
  res.status(201).json(workout);
});

app.put('/api/workouts/:id', requireAuth, (req, res) => {
  const workouts = readWorkouts();
  const i = workouts.findIndex(
    workout => workout.id === req.params.id && workout.userId === req.user.userId
  );
  if (i === -1) return res.status(404).json({ error: 'Workout not found.' });

  const { id, userId, ...allowedUpdates } = req.body;
  workouts[i] = { ...workouts[i], ...allowedUpdates };
  writeWorkouts(workouts);
  res.json(workouts[i]);
});

app.delete('/api/workouts/:id', requireAuth, (req, res) => {
  const userId = req.user.userId;
  let workouts = readWorkouts();
  const workout = workouts.find(item => item.id === req.params.id && item.userId === userId);
  if (!workout) return res.status(404).json({ error: 'Workout not found.' });

  workouts = workouts.filter(item => item.id !== req.params.id);
  writeWorkouts(workouts);

  // Remove the deleted workout from every group owned by the user.
  const groups = readGroups();
  groups.forEach(group => {
    if (group.userId === userId) {
      group.workoutIds = (group.workoutIds || []).filter(id => id !== req.params.id);
    }
  });
  writeGroups(groups);

  // Remove directly scheduled copies of the workout.
  const schedule = readSchedule();
  const userSchedule = schedule[userId] || {};
  Object.keys(userSchedule).forEach(date => {
    userSchedule[date] = (userSchedule[date] || []).filter(item => {
      const normalized = normalizeScheduleItem(item);
      return !(normalized && normalized.type === 'workout' && normalized.id === req.params.id);
    });
  });
  schedule[userId] = userSchedule;
  writeSchedule(schedule);

  res.json({ success: true });
});

/* GROUPS API */
app.get('/api/groups', requireAuth, (req, res) => {
  res.json(readGroups().filter(group => group.userId === req.user.userId));
});

app.post('/api/groups', requireAuth, (req, res) => {
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();
  if (!name) return res.status(400).json({ error: 'Group name is required.' });

  const groups = readGroups();
  const group = {
    id: uid(),
    userId: req.user.userId,
    name,
    description,
    workoutIds: []
  };

  groups.push(group);
  writeGroups(groups);
  res.status(201).json(group);
});

app.post('/api/groups/:groupId/workouts/:workoutId', requireAuth, (req, res) => {
  const groups = readGroups();
  const group = groups.find(
    item => item.id === req.params.groupId && item.userId === req.user.userId
  );
  if (!group) return res.status(404).json({ error: 'Group not found.' });

  const workout = readWorkouts().find(
    item => item.id === req.params.workoutId && item.userId === req.user.userId
  );
  if (!workout) return res.status(404).json({ error: 'Workout not found.' });

  if (!Array.isArray(group.workoutIds)) group.workoutIds = [];
  if (!group.workoutIds.includes(workout.id)) group.workoutIds.push(workout.id);
  writeGroups(groups);
  res.json(group);
});

app.delete('/api/groups/:groupId/workouts/:workoutId', requireAuth, (req, res) => {
  const groups = readGroups();
  const group = groups.find(
    item => item.id === req.params.groupId && item.userId === req.user.userId
  );
  if (!group) return res.status(404).json({ error: 'Group not found.' });

  group.workoutIds = (group.workoutIds || []).filter(id => id !== req.params.workoutId);
  writeGroups(groups);
  res.json(group);
});

app.delete('/api/groups/:id', requireAuth, (req, res) => {
  const userId = req.user.userId;
  let groups = readGroups();
  const group = groups.find(item => item.id === req.params.id && item.userId === userId);
  if (!group) return res.status(404).json({ error: 'Group not found.' });

  groups = groups.filter(item => item.id !== req.params.id);
  writeGroups(groups);

  // Remove the deleted group from the planner wherever it was scheduled.
  const schedule = readSchedule();
  const userSchedule = schedule[userId] || {};
  Object.keys(userSchedule).forEach(date => {
    userSchedule[date] = (userSchedule[date] || []).filter(item => {
      const normalized = normalizeScheduleItem(item);
      return !(normalized && normalized.type === 'group' && normalized.id === req.params.id);
    });
  });
  schedule[userId] = userSchedule;
  writeSchedule(schedule);

  res.json({ success: true });
});

/* SCHEDULE API */
app.get('/api/schedule', requireAuth, (req, res) => {
  const schedule = readSchedule();
  const userSchedule = schedule[req.user.userId] || {};

  // Always send the new object format to the browser.
  const normalized = {};
  Object.entries(userSchedule).forEach(([date, items]) => {
    normalized[date] = Array.isArray(items)
      ? items.map(normalizeScheduleItem).filter(Boolean)
      : [];
  });
  res.json(normalized);
});

app.put('/api/schedule/:date', requireAuth, (req, res) => {
  const userId = req.user.userId;
  const schedule = readSchedule();
  if (!schedule[userId]) schedule[userId] = {};

  const ownedWorkoutIds = new Set(
    readWorkouts().filter(w => w.userId === userId).map(w => w.id)
  );
  const ownedGroupIds = new Set(
    readGroups().filter(g => g.userId === userId).map(g => g.id)
  );

  // New format: [{ type: 'workout'|'group', id: '...' }]
  // Old workoutIds format is also accepted for compatibility.
  const incoming = Array.isArray(req.body.items)
    ? req.body.items
    : (Array.isArray(req.body.workoutIds)
      ? req.body.workoutIds.map(id => ({ type: 'workout', id }))
      : []);

  const items = incoming
    .map(normalizeScheduleItem)
    .filter(item => item && (
      (item.type === 'workout' && ownedWorkoutIds.has(item.id)) ||
      (item.type === 'group' && ownedGroupIds.has(item.id))
    ));

  schedule[userId][req.params.date] = items;
  writeSchedule(schedule);
  res.json({ items });
});

app.delete('/api/schedule/:date/:index', requireAuth, (req, res) => {
  const schedule = readSchedule();
  const userSchedule = schedule[req.user.userId] || {};
  const day = userSchedule[req.params.date];

  if (!Array.isArray(day)) {
    return res.status(404).json({ error: 'Schedule date not found.' });
  }

  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= day.length) {
    return res.status(400).json({ error: 'Invalid schedule index.' });
  }

  day.splice(index, 1);
  schedule[req.user.userId] = userSchedule;
  writeSchedule(schedule);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`FitWeek running at http://localhost:${PORT}`);
  console.log(`Saved users: ${readUsers().length}`);
});

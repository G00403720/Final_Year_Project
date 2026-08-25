const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fitweek-fitness-planner';

// Where data is stored
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const WORKOUTS_FILE = path.join(DATA_DIR, 'workouts.json');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');

// Creates files if they do not exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function ensureJsonFile(file, initialData) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(initialData, null, 2), 'utf8');
  }
}

ensureJsonFile(USERS_FILE, []);
ensureJsonFile(WORKOUTS_FILE, []);
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
  // Write to a temporary file first, then replace the real file. 
  // Reduces the chance of losing account data if Node is stopped while saving.
  const tempFile = `${file}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
  fs.copyFileSync(tempFile, file);
  fs.unlinkSync(tempFile);
}


function readUsers() {
  const users = readJson(USERS_FILE, []);
  return Array.isArray(users) ? users : [];
}
function writeUsers(data) { writeJson(USERS_FILE, data); }
function readWorkouts() {
  const workouts = readJson(WORKOUTS_FILE, []);
  return Array.isArray(workouts) ? workouts : [];
}
function writeWorkouts(data) { writeJson(WORKOUTS_FILE, data); }
function readSchedule() {
  const schedule = readJson(SCHEDULE_FILE, {});
  return schedule && typeof schedule === 'object' && !Array.isArray(schedule) ? schedule : {};
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

  if (!token) {
    return res.status(401).json({ error: 'You must be logged in.' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Your login has expired. Please log in again.' });
  }
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

    const passwordHash = await bcrypt.hash(password, 12);
    const user = {
      id: uid(),
      name,
      email,
      passwordHash,
    };

    users.push(user);
    writeUsers(users);

    const token = createToken(user);
    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email}
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

    const token = createToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email}
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

// Delete the currently signed-in account and all data that belongs to it.
app.delete('/api/auth/account', requireAuth, (req, res) => {
  const users = readUsers();
  const user = users.find(item => item.id === req.user.userId);

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  writeUsers(users.filter(item => item.id !== req.user.userId));

  const workouts = readWorkouts();
  writeWorkouts(workouts.filter(workout => workout.userId !== req.user.userId));

  const schedule = readSchedule();
  delete schedule[req.user.userId];
  writeSchedule(schedule);

  res.json({ success: true });
});

/* WORKOUTS API */

app.get('/api/workouts', requireAuth, (req, res) => {
  const workouts = readWorkouts().filter(workout => workout.userId === req.user.userId);
  res.json(workouts);
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
    name,
    target,
    reps,
    equipment: equipment || ''
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
  let workouts = readWorkouts();
  const workout = workouts.find(
    item => item.id === req.params.id && item.userId === req.user.userId
  );

  if (!workout) return res.status(404).json({ error: 'Workout not found.' });

  workouts = workouts.filter(item => item.id !== req.params.id);
  writeWorkouts(workouts);

  const schedule = readSchedule();
  const userSchedule = schedule[req.user.userId] || {};
  Object.keys(userSchedule).forEach(date => {
    userSchedule[date] = userSchedule[date].filter(id => id !== req.params.id);
  });
  schedule[req.user.userId] = userSchedule;
  writeSchedule(schedule);

  res.json({ success: true });
});

/* SCHEDULE API  */

app.get('/api/schedule', requireAuth, (req, res) => {
  const schedule = readSchedule();
  res.json(schedule[req.user.userId] || {});
});

app.put('/api/schedule/:date', requireAuth, (req, res) => {
  const schedule = readSchedule();
  if (!schedule[req.user.userId]) schedule[req.user.userId] = {};

  const ownedWorkoutIds = new Set(
    readWorkouts()
      .filter(workout => workout.userId === req.user.userId)
      .map(workout => workout.id)
  );

  const workoutIds = Array.isArray(req.body.workoutIds)
    ? req.body.workoutIds.filter(id => ownedWorkoutIds.has(id))
    : [];

  schedule[req.user.userId][req.params.date] = workoutIds;
  writeSchedule(schedule);
  res.json({ workoutIds });
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

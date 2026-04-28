const express = require('express');
const path = require('path');
const fs = require('fs');

const app  = express();
const PORT = 3000;

const DATA_DIR      = path.join(__dirname, 'data');
const WORKOUTS_FILE = path.join(DATA_DIR, 'workouts.json');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(WORKOUTS_FILE)) fs.writeFileSync(WORKOUTS_FILE, '[]');
if (!fs.existsSync(SCHEDULE_FILE)) fs.writeFileSync(SCHEDULE_FILE, '{}');

function readWorkouts() {
  return JSON.parse(fs.readFileSync(WORKOUTS_FILE));
}
function writeWorkouts(data) {
  fs.writeFileSync(WORKOUTS_FILE, JSON.stringify(data, null, 2));
}
function readSchedule() {
  return JSON.parse(fs.readFileSync(SCHEDULE_FILE));
}
function writeSchedule(data) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* WORKOUTS */

app.get('/api/workouts', (req, res) => {
  res.json(readWorkouts());
});

app.post('/api/workouts', (req, res) => {
  const { name, target, reps, equipment, notes } = req.body;
  const workouts = readWorkouts();

  const workout = {
    id: uid(),
    name,
    target,
    reps,
    equipment: equipment || '',
    notes: notes || ''
  };

  workouts.push(workout);
  writeWorkouts(workouts);

  res.json(workout);
});

app.put('/api/workouts/:id', (req, res) => {
  const workouts = readWorkouts();
  const i = workouts.findIndex(w => w.id === req.params.id);

  workouts[i] = { ...workouts[i], ...req.body };
  writeWorkouts(workouts);

  res.json(workouts[i]);
});

app.delete('/api/workouts/:id', (req, res) => {
  let workouts = readWorkouts();
  workouts = workouts.filter(w => w.id !== req.params.id);
  writeWorkouts(workouts);

  const schedule = readSchedule();
  Object.keys(schedule).forEach(d => {
    schedule[d] = schedule[d].filter(id => id !== req.params.id);
  });
  writeSchedule(schedule);

  res.json({ success: true });
});

/* SCHEDULE */

app.get('/api/schedule', (req, res) => {
  res.json(readSchedule());
});

app.put('/api/schedule/:date', (req, res) => {
  const schedule = readSchedule();
  schedule[req.params.date] = req.body.workoutIds || [];
  writeSchedule(schedule);
  res.json(schedule[req.params.date]);
});

app.delete('/api/schedule/:date/:index', (req, res) => {
  const schedule = readSchedule();
  schedule[req.params.date].splice(req.params.index, 1);
  writeSchedule(schedule);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
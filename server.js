const express  = require('express');
const session  = require('express-session');
const bcrypt   = require('bcryptjs');
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const { init } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Photo upload setup ────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `user_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'so-checkin-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

let db;

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/signup', upload.single('photo'), (req, res) => {
  const { username, password, full_name } = req.body;
  if (!username || !password || !full_name)
    return res.status(400).json({ error: 'All fields are required' });
  if (username.length < 3)
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = db.get('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [username.trim()]);
  if (existing) return res.status(400).json({ error: 'Username already taken' });

  const hash    = bcrypt.hashSync(password, 10);
  const photo   = req.file ? req.file.filename : null;
  try {
    const result = db.run(
      'INSERT INTO users (username, password_hash, full_name, photo_filename) VALUES (?, ?, ?, ?)',
      [username.trim(), hash, full_name.trim(), photo]
    );
    req.session.userId   = result.lastInsertRowid;
    req.session.username = username.trim();
    req.session.fullName = full_name.trim();
    req.session.role     = 'participant';
    res.json({ ok: true, role: 'participant', fullName: full_name.trim() });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username.trim()]);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid username or password' });

  req.session.userId   = user.id;
  req.session.username = user.username;
  req.session.fullName = user.full_name;
  req.session.role     = user.role;
  res.json({ ok: true, role: user.role, fullName: user.full_name });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });
  res.json({
    loggedIn: true,
    userId:   req.session.userId,
    username: req.session.username,
    fullName: req.session.fullName,
    role:     req.session.role
  });
});

// ── Event types ───────────────────────────────────────────────────────────────

app.get('/api/event-types', requireAuth, (req, res) => {
  const types = db.all('SELECT id, name FROM event_types ORDER BY name ASC');
  res.json(types);
});

app.post('/api/event-types', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const exists = db.get('SELECT id FROM event_types WHERE name = ? COLLATE NOCASE', [name.trim()]);
  if (exists) return res.status(400).json({ error: 'Type already exists' });
  const result = db.run('INSERT INTO event_types (name) VALUES (?)', [name.trim()]);
  res.json({ ok: true, id: result.lastInsertRowid, name: name.trim() });
});

app.delete('/api/event-types/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM event_types WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ── Recurring instance generator ─────────────────────────────────────────────
function generateRecurringInstances(startTime, endTime, recurrence) {
  if (!recurrence) return [[startTime, endTime]];
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const startMs = new Date(startTime).getTime();
  const durMs   = new Date(endTime).getTime() - startMs;
  const instances = [];
  if (recurrence === 'monthly') {
    const base = new Date(startTime);
    for (let i = 0; i < 6; i++) {
      const s = new Date(base.getFullYear(), base.getMonth() + i, base.getDate(), base.getHours(), base.getMinutes());
      instances.push([fmt(s), fmt(new Date(s.getTime() + durMs))]);
    }
  } else {
    const days  = recurrence === 'weekly' ? 7 : 14;
    const count = recurrence === 'weekly' ? 12 : 6;
    for (let i = 0; i < count; i++) {
      const s = new Date(startMs + i * days * 86400000);
      instances.push([fmt(s), fmt(new Date(s.getTime() + durMs))]);
    }
  }
  return instances;
}

// ── Events ────────────────────────────────────────────────────────────────────

app.get('/api/events', requireAuth, (req, res) => {
  const events = db.all(`
    SELECT e.*,
      u.full_name AS created_by_name,
      r.id AS registration_id,
      r.checked_in,
      r.checked_in_at,
      (SELECT COUNT(*) FROM registrations WHERE event_id = e.id) AS registrant_count
    FROM events e
    JOIN users u ON e.created_by = u.id
    LEFT JOIN registrations r ON r.event_id = e.id AND r.user_id = ?
    ORDER BY e.start_time ASC
  `, [req.session.userId]);
  res.json(events);
});

app.post('/api/events', requireAdmin, (req, res) => {
  const { title, event_type, start_time, end_time, location, notes, recurrence } = req.body;
  if (!title || !event_type || !start_time || !end_time || !location)
    return res.status(400).json({ error: 'Title, type, start/end time and location are required' });
  try {
    const instances = generateRecurringInstances(start_time, end_time, recurrence || null);
    const groupId   = instances.length > 1 ? `grp_${Date.now()}` : null;
    let lastId;
    for (const [s, e] of instances) {
      const result = db.run(
        'INSERT INTO events (title, event_type, start_time, end_time, date_time, location, notes, created_by, recurrence, recurrence_group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [title.trim(), event_type.trim(), s, e, s, location.trim(), notes?.trim() || null, req.session.userId, recurrence || null, groupId]
      );
      lastId = result.lastInsertRowid;
    }
    res.json({ ok: true, id: lastId, count: instances.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/events/:id', requireAdmin, (req, res) => {
  const { title, event_type, start_time, end_time, location, notes } = req.body;
  if (!title || !event_type || !start_time || !end_time || !location)
    return res.status(400).json({ error: 'Title, type, start/end time and location are required' });
  try {
    db.run(
      'UPDATE events SET title=?, event_type=?, start_time=?, end_time=?, date_time=?, location=?, notes=? WHERE id=?',
      [title.trim(), event_type.trim(), start_time, end_time, start_time, location.trim(), notes?.trim() || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/events/group/:groupId', requireAdmin, (req, res) => {
  const events = db.all('SELECT id FROM events WHERE recurrence_group_id = ?', [req.params.groupId]);
  for (const ev of events) db.run('DELETE FROM registrations WHERE event_id = ?', [ev.id]);
  db.run('DELETE FROM events WHERE recurrence_group_id = ?', [req.params.groupId]);
  res.json({ ok: true });
});

app.delete('/api/events/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM registrations WHERE event_id = ?', [req.params.id]);
  db.run('DELETE FROM events WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ── Registrations ─────────────────────────────────────────────────────────────

app.post('/api/events/:id/register', requireAuth, (req, res) => {
  const exists = db.get('SELECT id FROM registrations WHERE user_id = ? AND event_id = ?',
    [req.session.userId, req.params.id]);
  if (exists) return res.status(400).json({ error: 'Already registered' });
  db.run('INSERT INTO registrations (user_id, event_id) VALUES (?, ?)',
    [req.session.userId, req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/events/:id/register', requireAuth, (req, res) => {
  db.run('DELETE FROM registrations WHERE user_id = ? AND event_id = ?',
    [req.session.userId, req.params.id]);
  res.json({ ok: true });
});

app.post('/api/events/:id/checkin', requireAuth, (req, res) => {
  const reg = db.get('SELECT * FROM registrations WHERE user_id = ? AND event_id = ?',
    [req.session.userId, req.params.id]);
  if (!reg) return res.status(400).json({ error: 'Not registered for this event' });
  if (reg.checked_in) return res.status(400).json({ error: 'Already checked in' });
  db.run("UPDATE registrations SET checked_in=1, checked_in_at=datetime('now') WHERE user_id=? AND event_id=?",
    [req.session.userId, req.params.id]);
  res.json({ ok: true });
});

// Admin: check in any participant
app.post('/api/admin/events/:id/checkin', requireAdmin, (req, res) => {
  const { user_id } = req.body;
  const reg = db.get('SELECT * FROM registrations WHERE user_id = ? AND event_id = ?',
    [user_id, req.params.id]);
  if (!reg) return res.status(400).json({ error: 'Participant not registered for this event' });
  db.run("UPDATE registrations SET checked_in=1, checked_in_at=datetime('now') WHERE user_id=? AND event_id=?",
    [user_id, req.params.id]);
  res.json({ ok: true });
});

// Admin: registrations for an event
app.get('/api/admin/events/:id/registrations', requireAdmin, (req, res) => {
  const regs = db.all(`
    SELECT r.*, u.full_name, u.username, u.photo_filename
    FROM registrations r
    JOIN users u ON r.user_id = u.id
    WHERE r.event_id = ?
    ORDER BY u.full_name ASC
  `, [req.params.id]);
  res.json(regs);
});

// Admin: list all users
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = db.all(
    'SELECT id, username, full_name, role, photo_filename, admin_notes, created_at FROM users ORDER BY full_name ASC'
  );
  res.json(users);
});

// Admin: update user role
app.put('/api/admin/users/:id/role', requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['admin', 'participant'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });
  db.run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
  res.json({ ok: true });
});

// Admin: update notes on a participant
app.put('/api/admin/users/:id/notes', requireAdmin, (req, res) => {
  const { notes } = req.body;
  db.run('UPDATE users SET admin_notes = ? WHERE id = ?', [notes?.trim() || null, req.params.id]);
  res.json({ ok: true });
});

// Admin: upload / replace participant photo
app.post('/api/admin/users/:id/photo', requireAdmin, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No photo provided' });
  const user = db.get('SELECT photo_filename FROM users WHERE id = ?', [req.params.id]);
  if (user?.photo_filename) {
    const old = path.join(uploadsDir, user.photo_filename);
    if (fs.existsSync(old)) fs.unlinkSync(old);
  }
  db.run('UPDATE users SET photo_filename = ? WHERE id = ?', [req.file.filename, req.params.id]);
  res.json({ ok: true, filename: req.file.filename });
});

// ── Start ─────────────────────────────────────────────────────────────────────

init().then(database => {
  db = database;
  app.listen(PORT, () => {
    console.log(`Special Olympics Check-in running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialise database:', err);
  process.exit(1);
});

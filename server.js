require('dotenv').config();
const express      = require('express');
const session      = require('express-session');
const PgSession    = require('connect-pg-simple')(session);
const bcrypt       = require('bcryptjs');
const path         = require('path');
const multer       = require('multer');
const { neon }     = require('@neondatabase/serverless');
const { init }     = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Photo upload (memory storage — saved to DB as base64) ──────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'user_sessions',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'so-checkin-secret-2024',
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

// ── Serve user photos from DB ─────────────────────────────────────────────────
app.get('/api/photos/:userId', async (req, res) => {
  const user = await db.one('SELECT photo_data, photo_mime FROM users WHERE id = $1', [req.params.userId]);
  if (!user || !user.photo_data) return res.status(404).end();
  const buf = Buffer.from(user.photo_data, 'base64');
  res.setHeader('Content-Type', user.photo_mime || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buf);
});

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/signup', upload.single('photo'), async (req, res) => {
  const { username, password, full_name } = req.body;
  if (!username || !password || !full_name)
    return res.status(400).json({ error: 'All fields are required' });
  if (username.length < 3)
    return res.status(400).json({ error: 'Username must be at least 3 characters' });

  const existing = await db.one('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username.trim()]);
  if (existing) return res.status(400).json({ error: 'Username already taken' });

  const hash      = bcrypt.hashSync(password, 10);
  const photoData = req.file ? req.file.buffer.toString('base64') : null;
  const photoMime = req.file ? req.file.mimetype : null;
  try {
    const rows = await db.all(
      'INSERT INTO users (username, password_hash, full_name, photo_data, photo_mime) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [username.trim(), hash, full_name.trim(), photoData, photoMime]
    );
    req.session.userId   = rows[0].id;
    req.session.username = username.trim();
    req.session.fullName = full_name.trim();
    req.session.role     = 'participant';
    res.json({ ok: true, role: 'participant', fullName: full_name.trim() });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const user = await db.one('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username.trim()]);
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

app.get('/api/event-types', requireAuth, async (req, res) => {
  const types = await db.all('SELECT id, name FROM event_types ORDER BY name ASC');
  res.json(types);
});

app.post('/api/event-types', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const exists = await db.one('SELECT id FROM event_types WHERE LOWER(name) = LOWER($1)', [name.trim()]);
  if (exists) return res.status(400).json({ error: 'Type already exists' });
  const rows = await db.all('INSERT INTO event_types (name) VALUES ($1) RETURNING id', [name.trim()]);
  res.json({ ok: true, id: rows[0].id, name: name.trim() });
});

app.delete('/api/event-types/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM event_types WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ── Recurring instance generator ──────────────────────────────────────────────
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

app.get('/api/events', requireAuth, async (req, res) => {
  const events = await db.all(`
    SELECT e.*,
      u.full_name AS created_by_name,
      r.id AS registration_id,
      r.checked_in,
      r.checked_in_at,
      (SELECT COUNT(*) FROM registrations WHERE event_id = e.id) AS registrant_count
    FROM events e
    JOIN users u ON e.created_by = u.id
    LEFT JOIN registrations r ON r.event_id = e.id AND r.user_id = $1
    ORDER BY e.start_time ASC
  `, [req.session.userId]);
  res.json(events);
});

app.post('/api/events', requireAdmin, async (req, res) => {
  const { title, event_type, start_time, end_time, location, notes, recurrence } = req.body;
  if (!title || !event_type || !start_time || !end_time || !location)
    return res.status(400).json({ error: 'Title, type, start/end time and location are required' });
  try {
    const instances = generateRecurringInstances(start_time, end_time, recurrence || null);
    const groupId   = instances.length > 1 ? `grp_${Date.now()}` : null;
    let lastId;
    for (const [s, e] of instances) {
      const rows = await db.all(
        'INSERT INTO events (title, event_type, start_time, end_time, location, notes, created_by, recurrence, recurrence_group_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
        [title.trim(), event_type.trim(), s, e, location.trim(), notes?.trim() || null, req.session.userId, recurrence || null, groupId]
      );
      lastId = rows[0].id;
    }
    res.json({ ok: true, id: lastId, count: instances.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/events/:id', requireAdmin, async (req, res) => {
  const { title, event_type, start_time, end_time, location, notes } = req.body;
  if (!title || !event_type || !start_time || !end_time || !location)
    return res.status(400).json({ error: 'Title, type, start/end time and location are required' });
  try {
    await db.run(
      'UPDATE events SET title=$1, event_type=$2, start_time=$3, end_time=$4, location=$5, notes=$6 WHERE id=$7',
      [title.trim(), event_type.trim(), start_time, end_time, location.trim(), notes?.trim() || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/events/group/:groupId', requireAdmin, async (req, res) => {
  const events = await db.all('SELECT id FROM events WHERE recurrence_group_id = $1', [req.params.groupId]);
  for (const ev of events) await db.run('DELETE FROM registrations WHERE event_id = $1', [ev.id]);
  await db.run('DELETE FROM events WHERE recurrence_group_id = $1', [req.params.groupId]);
  res.json({ ok: true });
});

app.delete('/api/events/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM registrations WHERE event_id = $1', [req.params.id]);
  await db.run('DELETE FROM events WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ── Registrations ─────────────────────────────────────────────────────────────

app.post('/api/events/:id/register', requireAuth, async (req, res) => {
  const exists = await db.one('SELECT id FROM registrations WHERE user_id = $1 AND event_id = $2',
    [req.session.userId, req.params.id]);
  if (exists) return res.status(400).json({ error: 'Already registered' });
  await db.run('INSERT INTO registrations (user_id, event_id) VALUES ($1,$2)',
    [req.session.userId, req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/events/:id/register', requireAuth, async (req, res) => {
  await db.run('DELETE FROM registrations WHERE user_id = $1 AND event_id = $2',
    [req.session.userId, req.params.id]);
  res.json({ ok: true });
});

app.post('/api/events/:id/checkin', requireAuth, async (req, res) => {
  const reg = await db.one('SELECT * FROM registrations WHERE user_id = $1 AND event_id = $2',
    [req.session.userId, req.params.id]);
  if (!reg) return res.status(400).json({ error: 'Not registered for this event' });
  if (reg.checked_in) return res.status(400).json({ error: 'Already checked in' });
  await db.run('UPDATE registrations SET checked_in=1, checked_in_at=NOW() WHERE user_id=$1 AND event_id=$2',
    [req.session.userId, req.params.id]);
  res.json({ ok: true });
});

// Admin: check in any participant
app.post('/api/admin/events/:id/checkin', requireAdmin, async (req, res) => {
  const { user_id } = req.body;
  const reg = await db.one('SELECT * FROM registrations WHERE user_id = $1 AND event_id = $2',
    [user_id, req.params.id]);
  if (!reg) return res.status(400).json({ error: 'Participant not registered for this event' });
  await db.run('UPDATE registrations SET checked_in=1, checked_in_at=NOW() WHERE user_id=$1 AND event_id=$2',
    [user_id, req.params.id]);
  res.json({ ok: true });
});

// Admin: registrations for an event
app.get('/api/admin/events/:id/registrations', requireAdmin, async (req, res) => {
  const regs = await db.all(`
    SELECT r.*, u.full_name, u.username,
      CASE WHEN u.photo_data IS NOT NULL THEN u.id ELSE NULL END AS photo_user_id
    FROM registrations r
    JOIN users u ON r.user_id = u.id
    WHERE r.event_id = $1
    ORDER BY u.full_name ASC
  `, [req.params.id]);
  res.json(regs);
});

// Admin: list all users
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const users = await db.all(
    `SELECT id, username, full_name, role, admin_notes, created_at,
      CASE WHEN photo_data IS NOT NULL THEN id ELSE NULL END AS photo_user_id
     FROM users ORDER BY full_name ASC`
  );
  res.json(users);
});

// Admin: update user role
app.put('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
  const { role } = req.body;
  if (!['admin', 'participant'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });
  await db.run('UPDATE users SET role = $1 WHERE id = $2', [role, req.params.id]);
  res.json({ ok: true });
});

// Admin: update notes on a participant
app.put('/api/admin/users/:id/notes', requireAdmin, async (req, res) => {
  const { notes } = req.body;
  await db.run('UPDATE users SET admin_notes = $1 WHERE id = $2', [notes?.trim() || null, req.params.id]);
  res.json({ ok: true });
});

// Admin: upload / replace participant photo
app.post('/api/admin/users/:id/photo', requireAdmin, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No photo provided' });
  const photoData = req.file.buffer.toString('base64');
  const photoMime = req.file.mimetype;
  await db.run('UPDATE users SET photo_data = $1, photo_mime = $2 WHERE id = $3',
    [photoData, photoMime, req.params.id]);
  res.json({ ok: true, photo_user_id: parseInt(req.params.id) });
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

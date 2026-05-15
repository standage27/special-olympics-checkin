const fs   = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'checkin.db');

let SQL, db;

const DEFAULT_EVENT_TYPES = [
  'Athletics','Swimming','Basketball','Soccer','Gymnastics',
  'Bocce','Bowling','Cycling','Golf','Powerlifting','Tennis','Volleyball'
];

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS event_types (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL COLLATE NOCASE
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'participant',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    event_type TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    location TEXT NOT NULL,
    notes TEXT,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    registered_at TEXT NOT NULL DEFAULT (datetime('now')),
    checked_in INTEGER NOT NULL DEFAULT 0,
    checked_in_at TEXT,
    UNIQUE(user_id, event_id)
  );
`;

function save() {
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

function migrate() {
  // events: date_time → start_time / end_time
  const evCols = db.exec("PRAGMA table_info(events)")[0];
  if (evCols) {
    const evNames = evCols.values.map(r => r[1]);
    if (evNames.includes('date_time') && !evNames.includes('start_time')) {
      db.run('ALTER TABLE events ADD COLUMN start_time TEXT');
      db.run('ALTER TABLE events ADD COLUMN end_time TEXT');
      db.run('UPDATE events SET start_time = date_time, end_time = date_time');
    }
    if (!evNames.includes('recurrence'))          db.run('ALTER TABLE events ADD COLUMN recurrence TEXT');
    if (!evNames.includes('recurrence_group_id')) db.run('ALTER TABLE events ADD COLUMN recurrence_group_id TEXT');
  }

  // users: add photo_filename and admin_notes
  const uCols = db.exec("PRAGMA table_info(users)")[0];
  if (uCols) {
    const uNames = uCols.values.map(r => r[1]);
    if (!uNames.includes('photo_filename')) db.run('ALTER TABLE users ADD COLUMN photo_filename TEXT');
    if (!uNames.includes('admin_notes'))    db.run('ALTER TABLE users ADD COLUMN admin_notes TEXT');
  }

  // event_types table + default seed
  const etCols = db.exec("PRAGMA table_info(event_types)")[0];
  if (!etCols) {
    db.run(`CREATE TABLE IF NOT EXISTS event_types (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL COLLATE NOCASE
    )`);
    DEFAULT_EVENT_TYPES.forEach(n => db.run('INSERT OR IGNORE INTO event_types (name) VALUES (?)', [n]));
  } else {
    DEFAULT_EVENT_TYPES.forEach(n => db.run('INSERT OR IGNORE INTO event_types (name) VALUES (?)', [n]));
  }

  save();
}

function rowsToObjects(stmt) {
  const cols = stmt.getColumnNames();
  const rows = [];
  while (stmt.step()) {
    const vals = stmt.get();
    const obj  = {};
    cols.forEach((c, i) => { obj[c] = vals[i]; });
    rows.push(obj);
  }
  stmt.free();
  return rows;
}

function runStmt(sql, params = []) {
  db.run(sql, params);
  save();
  const rowid   = db.exec('SELECT last_insert_rowid()')[0]?.values[0][0];
  const changes = db.exec('SELECT changes()')[0]?.values[0][0];
  return { lastInsertRowid: rowid, changes };
}

function getOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = rowsToObjects(stmt);
  return rows[0] || null;
}

function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  return rowsToObjects(stmt);
}

async function init() {
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();
  if (fs.existsSync(DB_FILE)) {
    const fileData = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileData);
    migrate();
  } else {
    db = new SQL.Database();
    db.run(SCHEMA);
    save();
    return { run: runStmt, get: getOne, all: getAll };
  }
  db.run(SCHEMA);
  return { run: runStmt, get: getOne, all: getAll };
}

module.exports = { init };

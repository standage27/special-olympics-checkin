const { Pool } = require('pg');

const DEFAULT_EVENT_TYPES = [
  'Athletics','Swimming','Basketball','Soccer','Gymnastics',
  'Bocce','Bowling','Cycling','Golf','Powerlifting','Tennis','Volleyball'
];

let pool;

async function init() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_types (
      id   SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name     TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'participant',
      photo_data    TEXT,
      photo_mime    TEXT,
      admin_notes   TEXT,
      phone         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id                  SERIAL PRIMARY KEY,
      title               TEXT NOT NULL,
      event_type          TEXT NOT NULL,
      start_time          TEXT NOT NULL,
      end_time            TEXT NOT NULL,
      location            TEXT NOT NULL,
      notes               TEXT,
      created_by          INTEGER NOT NULL,
      recurrence          TEXT,
      recurrence_group_id TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS registrations (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL,
      event_id      INTEGER NOT NULL,
      registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checked_in    INTEGER NOT NULL DEFAULT 0,
      checked_in_at TIMESTAMPTZ,
      UNIQUE(user_id, event_id)
    )
  `);

  for (const name of DEFAULT_EVENT_TYPES) {
    await pool.query('INSERT INTO event_types (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
  }

  return {
    one: async (text, params) => { const r = await pool.query(text, params); return r.rows[0] || null; },
    all: async (text, params) => { const r = await pool.query(text, params); return r.rows; },
    run: async (text, params) => { const r = await pool.query(text, params); return r.rows; },
  };
}

module.exports = { init };

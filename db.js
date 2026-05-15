const { neon } = require('@neondatabase/serverless');

let sql;

const DEFAULT_EVENT_TYPES = [
  'Athletics','Swimming','Basketball','Soccer','Gymnastics',
  'Bocce','Bowling','Cycling','Golf','Powerlifting','Tennis','Volleyball'
];

async function init() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  sql = neon(process.env.DATABASE_URL);

  await sql`
    CREATE TABLE IF NOT EXISTS event_types (
      id   SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name     TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'participant',
      photo_data    TEXT,
      photo_mime    TEXT,
      admin_notes   TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
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
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS registrations (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL,
      event_id      INTEGER NOT NULL,
      registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checked_in    INTEGER NOT NULL DEFAULT 0,
      checked_in_at TIMESTAMPTZ,
      UNIQUE(user_id, event_id)
    )
  `;

  // Seed default event types
  for (const name of DEFAULT_EVENT_TYPES) {
    await sql`INSERT INTO event_types (name) VALUES (${name}) ON CONFLICT (name) DO NOTHING`;
  }

  return {
    query: (text, params) => sql(text, params),
    one:   async (text, params) => { const r = await sql(text, params); return r[0] || null; },
    all:   async (text, params) => sql(text, params),
    run:   async (text, params) => { const r = await sql(text, params); return r; },
  };
}

module.exports = { init };

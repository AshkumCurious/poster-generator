import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'farewell.db');

// Reuse a single connection across hot reloads / serverless invocations.
let db = global.__farewellDb;
if (!db) {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  global.__farewellDb = db;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    person_name TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    template_id TEXT NOT NULL DEFAULT 'classic-border',
    folder_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open', -- open | closed
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contributors (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    invited_at TEXT,
    uploaded_at TEXT,
    UNIQUE(event_id, email)
  );

  CREATE TABLE IF NOT EXISTS poster_state (
    event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    layout_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS google_accounts (
    email TEXT PRIMARY KEY,
    refresh_token TEXT NOT NULL,
    access_token TEXT,
    expiry_date INTEGER,
    drive_root_folder_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const eventCols = db.prepare('PRAGMA table_info(events)').all();
if (!eventCols.some((c) => c.name === 'owner_email')) {
  db.exec('ALTER TABLE events ADD COLUMN owner_email TEXT');
}

export default db;

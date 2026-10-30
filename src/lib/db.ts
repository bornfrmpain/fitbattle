// SQLite via Node's built-in driver (Node >= 22.5): zero setup for local dev.
// All SQL lives here and in repo files, so moving to PostgreSQL means
// re-implementing those two layers; the schema is plain relational SQL.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS battles (
  id TEXT PRIMARY KEY,
  host_user_id TEXT NOT NULL REFERENCES users(id),
  config_json TEXT NOT NULL,
  status TEXT NOT NULL,
  current_turn INTEGER NOT NULL,
  winner TEXT,
  invite_code TEXT NOT NULL UNIQUE,
  invite_expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS battles_status ON battles(status, created_at);
CREATE TABLE IF NOT EXISTS battle_players (
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  seat INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  PRIMARY KEY (battle_id, seat)
);
CREATE INDEX IF NOT EXISTS battle_players_user ON battle_players(user_id);
CREATE TABLE IF NOT EXISTS turns (
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  seat INTEGER NOT NULL,
  slot TEXT NOT NULL,
  status TEXT NOT NULL,
  outfit_item_id TEXT,
  started_at INTEGER,
  deadline INTEGER,
  ended_at INTEGER,
  PRIMARY KEY (battle_id, idx)
);
CREATE TABLE IF NOT EXISTS outfit_items (
  id TEXT PRIMARY KEY,
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  seat INTEGER NOT NULL,
  turn_idx INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  brand TEXT,
  price_cents INTEGER NOT NULL,
  slot TEXT NOT NULL,
  listing_url TEXT,
  image_url TEXT,
  snapshot_json TEXT NOT NULL,
  locked_at INTEGER NOT NULL,
  sold_since_selection INTEGER NOT NULL DEFAULT 0,
  UNIQUE (battle_id, turn_idx)
);
CREATE TABLE IF NOT EXISTS votes (
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  voter_id TEXT NOT NULL REFERENCES users(id),
  seat INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (battle_id, voter_id)
);
CREATE TABLE IF NOT EXISTS tryons (
  id TEXT PRIMARY KEY,
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  seat INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  photo_path TEXT NOT NULL,
  result_path TEXT,
  status TEXT NOT NULL,
  error TEXT,
  share_with_opponent INTEGER NOT NULL DEFAULT 0,
  notes_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tryon_photos (
  id TEXT PRIMARY KEY,
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  seat INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  path TEXT NOT NULL,
  mime TEXT NOT NULL,
  consent_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tryon_jobs (
  id TEXT PRIMARY KEY,
  photo_id TEXT NOT NULL REFERENCES tryon_photos(id) ON DELETE CASCADE,
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  seat INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  item_ids_json TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  status TEXT NOT NULL,           -- queued | running | done | failed
  step INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL,
  step_label TEXT,
  visibility TEXT NOT NULL,       -- private | opponent | public
  seed INTEGER NOT NULL,
  result_path TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS image_probes (
  url TEXT PRIMARY KEY,
  width INTEGER,
  height INTEGER,
  ok INTEGER NOT NULL,
  probed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS battle_challenges (
  id TEXT PRIMARY KEY,
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  source_title TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS battle_challenges_battle ON battle_challenges(battle_id, created_at);
CREATE TABLE IF NOT EXISTS wheels (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  mode TEXT NOT NULL,
  entries_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS wheels_user ON wheels(user_id, updated_at);
CREATE INDEX IF NOT EXISTS tryon_jobs_battle ON tryon_jobs(battle_id, created_at);
CREATE INDEX IF NOT EXISTS tryon_jobs_user ON tryon_jobs(user_id, created_at);
`;

const g = globalThis as unknown as { __fitduelDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!g.__fitduelDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const d = new DatabaseSync(path.join(DATA_DIR, "fitduel.db"));
    d.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    d.exec(SCHEMA);
    g.__fitduelDb = d;
  }
  return g.__fitduelDb;
}

/** Runs fn inside an IMMEDIATE transaction so concurrent requests serialize on writes. */
export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

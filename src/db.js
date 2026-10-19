// One SQLite file (node:sqlite, no dependency) in DATA_DIR. App Service keeps /home across restarts and deploys.
// The email module adds its own tables to the same database (email.migrate()).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export function openDb(dir) {
  if (dir !== ':memory:') mkdirSync(join(dir, 'thumbs'), { recursive: true });
  const db = new DatabaseSync(dir === ':memory:' ? ':memory:' : join(dir, 'riverside.db'));
  // /home on App Service is a network share: no WAL, full sync, wait instead of failing on a lock.
  db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
  db.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS login_tokens (hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS staff (username TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, must_change INTEGER NOT NULL DEFAULT 1,
      default_pw INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS staff_logins (id INTEGER PRIMARY KEY, who TEXT NOT NULL, at INTEGER NOT NULL, ip TEXT NOT NULL, method TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, who TEXT NOT NULL, what TEXT NOT NULL);`);
  // Added later: per-account session version (sign out everywhere). Older databases get the column here.
  if (!db.prepare('PRAGMA table_info(staff)').all().some((c) => c.name === 'session_v')) db.exec('ALTER TABLE staff ADD COLUMN session_v INTEGER NOT NULL DEFAULT 0');
  return db;
}

/** The site's live data (alerts, overrides, groups, live switch) is one JSON document under key "state". */
export const getState = (db) => JSON.parse(db.prepare("SELECT value FROM kv WHERE key = 'state'").get()?.value ?? '{}');
export const setState = (db, state) => db.prepare("INSERT INTO kv (key, value) VALUES ('state', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(state));

/** Nightly copy to DATA_DIR/backup/riverside-YYYY-MM-DD.db, keeping the newest 7. Safe while the app runs. */
export function backup(db, dir, now = new Date()) {
  const folder = join(dir, 'backup');
  mkdirSync(folder, { recursive: true });
  const name = `riverside-${now.toISOString().slice(0, 10)}.db`;
  const files = readdirSync(folder).filter((f) => /^riverside-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  if (!files.includes(name)) {
    db.exec(`VACUUM INTO '${join(folder, name).replace(/'/g, "''")}'`);
    files.push(name);
  }
  for (const f of files.slice(0, -7)) rmSync(join(folder, f), { force: true });
}

export const ACTIVITY_KEEP = 200;
/** View-only log of staff changes: who did what, when. Keeps the newest ACTIVITY_KEEP entries. */
export function logActivity(db, who, what, now = Date.now()) {
  db.prepare('INSERT INTO activity (at, who, what) VALUES (?, ?, ?)').run(now, String(who), String(what).slice(0, 300));
  db.prepare('DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY id DESC LIMIT ?)').run(ACTIVITY_KEEP);
}
export const recentActivity = (db, n = ACTIVITY_KEEP) => db.prepare('SELECT at, who, what FROM activity ORDER BY id DESC LIMIT ?').all(n);

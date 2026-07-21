// Stress-test seeder: parse the private `tabs` export (Great Suspender wrappers),
// unwrap the real URL/title, and write N tabs into the app's tabos.db as COLD
// tabs. On next launch BrowserManager restores them; only the active tab becomes
// a live renderer, the rest stay cold (no Chromium process) — the memory engine.
//
// Usage:
//   node scripts/seed-stress.mjs [count]
//
// count defaults to 1000. Reads ../../tabs, writes to the Electron userData db.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appDir, '..');

const count = Number(process.argv[2] ?? 1000);
const tabsFile = path.join(repoRoot, 'tabs');
const userData = path.join(os.homedir(), 'Library', 'Application Support', 'tabos-desktop');
const dbFile = path.join(userData, 'tabos.db');

function unwrap(line) {
  const raw = line.trim();
  if (!raw) return null;
  // Great Suspender wrapper: ...suspended.html#ttl=<title>&pos=<n>&uri=<url>
  const hashIndex = raw.indexOf('#');
  if (raw.includes('/suspended.html') && hashIndex !== -1) {
    const params = new URLSearchParams(raw.slice(hashIndex + 1));
    const uri = params.get('uri');
    const ttl = params.get('ttl');
    if (uri && /^https?:\/\//i.test(uri)) {
      return { url: uri, title: ttl || uri };
    }
    return null;
  }
  // Plain URL line.
  if (/^https?:\/\//i.test(raw)) return { url: raw, title: raw };
  return null;
}

function uuid() {
  return crypto.randomUUID();
}

async function main() {
  if (!fs.existsSync(tabsFile)) {
    console.error(`No tabs file at ${tabsFile}`);
    process.exit(1);
  }

  const lines = fs.readFileSync(tabsFile, 'utf8').split('\n');
  const seen = new Set();
  const records = [];
  for (const line of lines) {
    const rec = unwrap(line);
    if (!rec) continue;
    if (seen.has(rec.url)) continue;
    seen.add(rec.url);
    records.push(rec);
    if (records.length >= count) break;
  }
  console.log(`Parsed ${records.length} unique recoverable tabs (target ${count}).`);

  const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
  const db = fs.existsSync(dbFile) ? new SQL.Database(fs.readFileSync(dbFile)) : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS browser_schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS browser_state (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), active_tab_id TEXT, saved_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS browser_tabs (
      id TEXT PRIMARY KEY, position INTEGER NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL, favicon TEXT,
      runtime_state TEXT NOT NULL, is_loading INTEGER NOT NULL, can_go_back INTEGER NOT NULL, can_go_forward INTEGER NOT NULL,
      created_at INTEGER NOT NULL, last_active_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS browser_visits (
      id TEXT PRIMARY KEY, position INTEGER NOT NULL, tab_id TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL,
      visited_at INTEGER NOT NULL, parent_visit_id TEXT);
    INSERT OR IGNORE INTO browser_schema_migrations(version, applied_at) VALUES (1, ${Date.now()});
  `);

  db.run('DELETE FROM browser_state');
  db.run('DELETE FROM browser_visits');
  db.run('DELETE FROM browser_tabs');

  const now = Date.now();
  const ids = [];
  const stmt = db.prepare(`
    INSERT INTO browser_tabs(id, position, url, title, favicon, runtime_state, is_loading, can_go_back, can_go_forward, created_at, last_active_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  records.forEach((rec, i) => {
    const id = uuid();
    ids.push(id);
    // First tab is the active one (becomes hot on restore); rest are cold.
    const runtime = i === 0 ? 'hot' : 'cold';
    stmt.run([id, i, rec.url, rec.title.slice(0, 300), null, runtime, 0, 0, 0, now - i * 1000, now - i * 1000]);
  });
  stmt.free();

  db.run('INSERT INTO browser_state(singleton, active_tab_id, saved_at) VALUES (1, ?, ?)', [ids[0], now]);

  fs.mkdirSync(userData, { recursive: true });
  const tmp = `${dbFile}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(db.export()));
  fs.renameSync(tmp, dbFile);
  db.close();

  console.log(`Seeded ${records.length} tabs into ${dbFile}`);
  console.log(`Active (hot): ${records[0]?.url}`);
  console.log('Launch the app: only the active tab spins up a renderer; the rest stay cold.');
}

main().catch((err) => { console.error(err); process.exit(1); });

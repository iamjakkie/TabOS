import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type { BrowserPathEvent, BrowserSnapshot, BrowserTab, RuntimeState } from '../shared/browser';

let sqlPromise: Promise<SqlJsStatic> | undefined;

function loadSql(): Promise<SqlJsStatic> {
  sqlPromise ??= initSqlJs({
    locateFile: (file) => require.resolve(`sql.js/dist/${file}`),
  });
  return sqlPromise;
}

export class SnapshotRepository {
  private constructor(
    private readonly filename: string,
    private readonly db: Database,
  ) {
    this.migrate();
  }

  static async open(filename: string): Promise<SnapshotRepository> {
    const SQL = await loadSql();
    const data = fs.existsSync(filename) ? fs.readFileSync(filename) : undefined;
    return new SnapshotRepository(filename, data ? new SQL.Database(data) : new SQL.Database());
  }

  load(): BrowserSnapshot | null {
    const state = this.first<{ active_tab_id: string | null }>(
      'SELECT active_tab_id FROM browser_state WHERE singleton = 1',
    );
    if (!state) return null;

    const tabs = this.all<Record<string, unknown>>('SELECT * FROM browser_tabs ORDER BY position');
    const visits = this.all<Record<string, unknown>>('SELECT * FROM browser_visits ORDER BY visited_at, position');

    return {
      activeTabId: state.active_tab_id,
      tabs: tabs.map((row) => ({
        id: String(row.id),
        url: String(row.url),
        title: String(row.title),
        favicon: row.favicon == null ? undefined : String(row.favicon),
        runtimeState: String(row.runtime_state) as RuntimeState,
        isLoading: Boolean(row.is_loading),
        canGoBack: Boolean(row.can_go_back),
        canGoForward: Boolean(row.can_go_forward),
        createdAt: Number(row.created_at),
        lastActiveAt: Number(row.last_active_at),
      } satisfies BrowserTab)),
      path: visits.map((row) => ({
        id: String(row.id),
        tabId: String(row.tab_id),
        url: String(row.url),
        title: String(row.title),
        visitedAt: Number(row.visited_at),
        parentVisitId: row.parent_visit_id == null ? undefined : String(row.parent_visit_id),
      } satisfies BrowserPathEvent)),
    };
  }

  save(snapshot: BrowserSnapshot): void {
    this.db.run('BEGIN IMMEDIATE');
    try {
      this.db.run('DELETE FROM browser_state');
      this.db.run('DELETE FROM browser_visits');
      this.db.run('DELETE FROM browser_tabs');
      this.db.run(
        'INSERT INTO browser_state(singleton, active_tab_id, saved_at) VALUES (1, ?, ?)',
        [snapshot.activeTabId, Date.now()],
      );

      const tabStatement = this.db.prepare(`
        INSERT INTO browser_tabs(
          id, position, url, title, favicon, runtime_state, is_loading,
          can_go_back, can_go_forward, created_at, last_active_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      snapshot.tabs.forEach((tab, position) => {
        tabStatement.run([
          tab.id, position, tab.url, tab.title, tab.favicon ?? null, tab.runtimeState,
          tab.isLoading ? 1 : 0, tab.canGoBack ? 1 : 0, tab.canGoForward ? 1 : 0,
          tab.createdAt, tab.lastActiveAt,
        ]);
      });
      tabStatement.free();

      const visitStatement = this.db.prepare(`
        INSERT INTO browser_visits(id, position, tab_id, url, title, visited_at, parent_visit_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      snapshot.path.forEach((visit, position) => {
        visitStatement.run([
          visit.id, position, visit.tabId, visit.url, visit.title, visit.visitedAt,
          visit.parentVisitId ?? null,
        ]);
      });
      visitStatement.free();
      this.db.run('COMMIT');
      this.flush();
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.flush();
    this.db.close();
  }

  private migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS browser_schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS browser_state (
        singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
        active_tab_id TEXT,
        saved_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS browser_tabs (
        id TEXT PRIMARY KEY,
        position INTEGER NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        favicon TEXT,
        runtime_state TEXT NOT NULL,
        is_loading INTEGER NOT NULL,
        can_go_back INTEGER NOT NULL,
        can_go_forward INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS browser_visits (
        id TEXT PRIMARY KEY,
        position INTEGER NOT NULL,
        tab_id TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        visited_at INTEGER NOT NULL,
        parent_visit_id TEXT
      );
      INSERT OR IGNORE INTO browser_schema_migrations(version, applied_at) VALUES (1, ${Date.now()});
    `);
  }

  private flush(): void {
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    const temp = `${this.filename}.tmp`;
    fs.writeFileSync(temp, Buffer.from(this.db.export()));
    fs.renameSync(temp, this.filename);
  }

  private all<T>(sql: string): T[] {
    const statement = this.db.prepare(sql);
    const rows: T[] = [];
    while (statement.step()) rows.push(statement.getAsObject() as T);
    statement.free();
    return rows;
  }

  private first<T>(sql: string): T | null {
    return this.all<T>(sql)[0] ?? null;
  }
}

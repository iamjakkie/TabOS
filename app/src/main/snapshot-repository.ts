import fs from 'node:fs';
import initSqlJs from 'sql.js';
import type { BrowserPathEvent, BrowserSnapshot } from '../shared/browser';
import type { Database, SqlJsStatic } from 'sql.js';

export class SnapshotRepository {
  private db: Database;
  private readonly filename: string;
  private static SQL: SqlJsStatic | null = null;

  private constructor(db: Database, filename: string) {
    this.db = db;
    this.filename = filename;
  }

  static async open(filename: string): Promise<SnapshotRepository> {
    const SQL = SnapshotRepository.SQL ?? (await initSqlJs());
    SnapshotRepository.SQL = SQL;

    if (fs.existsSync(filename)) {
      const buffer = fs.readFileSync(filename);
      const db = new SQL.Database(buffer);
      return new SnapshotRepository(db, filename);
    }

    const db = new SQL.Database();
    SnapshotRepository.initSchema(db);
    return new SnapshotRepository(db, filename);
  }

  private static initSchema(db: Database): void {
    db.run(`
      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tabs (
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
      CREATE TABLE IF NOT EXISTS visits (
        id TEXT PRIMARY KEY,
        tab_id TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        visited_at INTEGER NOT NULL,
        parent_visit_id TEXT
      );
    `);
  }

  load(): BrowserSnapshot | null {
    const rows = this.db.exec("SELECT value FROM app_state WHERE key = 'activeTabId'");
    if (rows.length === 0 || rows[0].values.length === 0) return null;
    const activeTabId = rows[0].values[0][0] as string;

    const tabs: BrowserSnapshot['tabs'] = [];
    const tabRows = this.db.exec(
      `SELECT id, url, title, favicon, runtime_state, is_loading,
              can_go_back, can_go_forward, created_at, last_active_at
        FROM tabs
        ORDER BY position ASC`,
    );
    if (tabRows.length > 0) {
      for (const row of tabRows[0].values) {
        const [
          id,
          url,
          title,
          favicon,
          runtimeState,
          isLoading,
          canGoBack,
          canGoForward,
          createdAt,
          lastActiveAt,
        ] = row as [
          string,
          string,
          string,
          string | null,
          string,
          number,
          number,
          number,
          number,
          number,
        ];
        tabs.push({
          id,
          url,
          title,
          favicon: favicon ?? undefined,
          runtimeState: runtimeState as 'hot' | 'warm' | 'cold',
          isLoading: Boolean(isLoading),
          canGoBack: Boolean(canGoBack),
          canGoForward: Boolean(canGoForward),
          createdAt,
          lastActiveAt,
        });
      }
    }

    const path: BrowserPathEvent[] = [];
    const visitRows = this.db.exec(
      `SELECT id, tab_id, url, title, visited_at, parent_visit_id
        FROM visits
        ORDER BY visited_at ASC`,
    );
    if (visitRows.length > 0) {
      for (const row of visitRows[0].values) {
        const [id, tabId, url, title, visitedAt, parentVisitId] = row as [
          string,
          string,
          string,
          string,
          number,
          string | null,
        ];
        const event: BrowserPathEvent = { id, tabId, url, title, visitedAt };
        if (parentVisitId) event.parentVisitId = parentVisitId;
        path.push(event);
      }
    }

    return { activeTabId, tabs, path };
  }

  save(snapshot: BrowserSnapshot): void {
    this.db.run('BEGIN TRANSACTION');
    try {
      this.db.run('DELETE FROM tabs');
      this.db.run('DELETE FROM visits');
      this.db.run("DELETE FROM app_state WHERE key = 'activeTabId'");

      if (snapshot.activeTabId !== null) {
        this.db.run("INSERT INTO app_state (key, value) VALUES ('activeTabId', ?)", [snapshot.activeTabId]);
      }

      for (let i = 0; i < snapshot.tabs.length; i++) {
        const tab = snapshot.tabs[i];
        this.db.run(
          `INSERT INTO tabs
            (id, position, url, title, favicon, runtime_state, is_loading,
             can_go_back, can_go_forward, created_at, last_active_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tab.id,
            i,
            tab.url,
            tab.title,
            tab.favicon ?? null,
            tab.runtimeState,
            tab.isLoading ? 1 : 0,
            tab.canGoBack ? 1 : 0,
            tab.canGoForward ? 1 : 0,
            tab.createdAt,
            tab.lastActiveAt,
          ],
        );
      }

      for (const event of snapshot.path) {
        this.db.run(
          `INSERT INTO visits
            (id, tab_id, url, title, visited_at, parent_visit_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
          [event.id, event.tabId, event.url, event.title, event.visitedAt, event.parentVisitId ?? null],
        );
      }

      this.db.run('COMMIT');
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }

    const data = this.db.export();
    const tempFile = this.filename + '.tmp';
    fs.writeFileSync(tempFile, Buffer.from(data));
    fs.renameSync(tempFile, this.filename);
  }

  close(): void {
    this.db.close();
  }
}

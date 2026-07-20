import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import {
  STUDY_SCHEMA_VERSION,
  type AddNodeInput,
  type CreatePathInput,
  type LogSessionInput,
  type RecordProgressInput,
  type StudyCompletionState,
  type StudyDeliverable,
  type StudyExport,
  type StudyNodeProgress,
  type StudyPath,
  type StudyPathDetail,
  type StudyPathNode,
  type StudyPathStats,
  type StudyProgressEvent,
  type StudyResource,
  type StudySession,
} from '../shared/study';

let sqlPromise: Promise<SqlJsStatic> | undefined;

function loadSql(): Promise<SqlJsStatic> {
  sqlPromise ??= initSqlJs({ locateFile: (file) => require.resolve(`sql.js/dist/${file}`) });
  return sqlPromise;
}

function id(): string {
  return crypto.randomUUID();
}

export class StudyRepository {
  private constructor(
    private readonly filename: string,
    private readonly db: Database,
  ) {
    this.migrate();
  }

  static async open(filename: string): Promise<StudyRepository> {
    const SQL = await loadSql();
    const data = fs.existsSync(filename) ? fs.readFileSync(filename) : undefined;
    return new StudyRepository(filename, data ? new SQL.Database(data) : new SQL.Database());
  }

  schemaVersion(): number {
    const row = this.first<{ version: number }>(
      'SELECT MAX(version) AS version FROM study_schema_migrations',
    );
    return row?.version ?? 0;
  }

  createPath(input: CreatePathInput): StudyPath {
    const now = Date.now();
    const path: StudyPath = {
      id: id(),
      title: input.title,
      description: input.description ?? null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    this.run(
      `INSERT INTO study_paths(id, title, description, status, created_at, updated_at, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [path.id, path.title, path.description, path.status, path.createdAt, path.updatedAt, path.archivedAt],
    );
    this.flush();
    return path;
  }

  addNode(input: AddNodeInput): StudyPathNode {
    const now = Date.now();
    const resource: StudyResource = {
      id: id(),
      resourceType: input.resource.resourceType,
      title: input.resource.title,
      sourceUrl: input.resource.sourceUrl ?? null,
      localRef: input.resource.localRef ?? null,
      authorOrProvider: input.resource.authorOrProvider ?? null,
      totalUnits: input.resource.totalUnits ?? null,
      unitKind: input.resource.unitKind ?? null,
      metadata: input.resource.metadata ?? null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    this.run(
      `INSERT INTO study_resources(id, resource_type, title, source_url, local_ref, author_or_provider,
         total_units, unit_kind, metadata, created_at, updated_at, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [resource.id, resource.resourceType, resource.title, resource.sourceUrl, resource.localRef,
       resource.authorOrProvider, resource.totalUnits, resource.unitKind,
       resource.metadata ? JSON.stringify(resource.metadata) : null, resource.createdAt, resource.updatedAt, resource.archivedAt],
    );

    const position = this.first<{ next: number }>(
      'SELECT COUNT(*) AS next FROM study_path_nodes WHERE path_id = ? AND archived_at IS NULL',
      [input.pathId],
    )?.next ?? 0;

    const node: StudyPathNode = {
      id: id(),
      pathId: input.pathId,
      resourceId: resource.id,
      parentNodeId: input.parentNodeId ?? null,
      position,
      titleOverride: input.titleOverride ?? null,
      status: 'todo',
      targetUnits: input.targetUnits ?? resource.totalUnits ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    this.run(
      `INSERT INTO study_path_nodes(id, path_id, resource_id, parent_node_id, position, title_override,
         status, target_units, notes, created_at, updated_at, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [node.id, node.pathId, node.resourceId, node.parentNodeId, node.position, node.titleOverride,
       node.status, node.targetUnits, node.notes, node.createdAt, node.updatedAt, node.archivedAt],
    );
    this.touchPath(input.pathId, now);
    this.flush();
    return node;
  }

  recordProgress(input: RecordProgressInput): StudyNodeProgress {
    const now = Date.now();
    const event: StudyProgressEvent = {
      id: id(),
      nodeId: input.nodeId,
      unitsDelta: input.unitsDelta ?? 0,
      totalUnitsSnapshot: input.totalUnitsSnapshot ?? null,
      completionState: input.completionState ?? null,
      note: input.note ?? null,
      createdAt: now,
    };
    this.run(
      `INSERT INTO study_progress_events(id, node_id, units_delta, total_units_snapshot, completion_state, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [event.id, event.nodeId, event.unitsDelta, event.totalUnitsSnapshot, event.completionState, event.note, event.createdAt],
    );

    // Reflect explicit completion into the node status (derived convenience field).
    if (event.completionState) {
      const status = event.completionState === 'completed' ? 'done'
        : event.completionState === 'in_progress' ? 'in_progress' : 'todo';
      this.run('UPDATE study_path_nodes SET status = ?, updated_at = ? WHERE id = ?', [status, now, event.nodeId]);
    }
    const node = this.first<Record<string, unknown>>('SELECT * FROM study_path_nodes WHERE id = ?', [input.nodeId]);
    if (node) this.touchPath(String(node.path_id), now);
    this.flush();
    return this.deriveNodeProgress(input.nodeId);
  }

  logSession(input: LogSessionInput): StudySession {
    const now = Date.now();
    const session: StudySession = {
      id: id(),
      pathId: input.pathId ?? null,
      nodeId: input.nodeId ?? null,
      resourceId: input.resourceId ?? null,
      startedAt: input.startedAt ?? now - input.durationSeconds * 1000,
      endedAt: input.endedAt ?? now,
      durationSeconds: input.durationSeconds,
      note: input.note ?? null,
      createdAt: now,
    };
    this.run(
      `INSERT INTO study_sessions(id, path_id, node_id, resource_id, started_at, ended_at, duration_seconds, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [session.id, session.pathId, session.nodeId, session.resourceId, session.startedAt,
       session.endedAt, session.durationSeconds, session.note, session.createdAt],
    );
    if (input.deliverable) {
      const deliverable: StudyDeliverable = {
        id: id(),
        sessionId: session.id,
        nodeId: session.nodeId,
        deliverableType: input.deliverable.deliverableType,
        content: input.deliverable.content,
        createdAt: now,
      };
      this.run(
        `INSERT INTO study_deliverables(id, session_id, node_id, deliverable_type, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [deliverable.id, deliverable.sessionId, deliverable.nodeId, deliverable.deliverableType, deliverable.content, deliverable.createdAt],
      );
    }
    if (session.pathId) this.touchPath(session.pathId, now);
    this.flush();
    return session;
  }

  listPaths(): Array<{ path: StudyPath; stats: StudyPathStats }> {
    const paths = this.all<Record<string, unknown>>(
      'SELECT * FROM study_paths WHERE archived_at IS NULL ORDER BY updated_at DESC',
    ).map((row) => this.mapPath(row));
    return paths.map((path) => ({ path, stats: this.computeStats(path.id) }));
  }

  getPathDetail(pathId: string): StudyPathDetail | null {
    const pathRow = this.first<Record<string, unknown>>('SELECT * FROM study_paths WHERE id = ?', [pathId]);
    if (!pathRow) return null;
    const path = this.mapPath(pathRow);

    const nodeRows = this.all<Record<string, unknown>>(
      'SELECT * FROM study_path_nodes WHERE path_id = ? AND archived_at IS NULL ORDER BY position',
      [pathId],
    );
    const nodes = nodeRows.map((row) => {
      const node = this.mapNode(row);
      const resourceRow = this.first<Record<string, unknown>>('SELECT * FROM study_resources WHERE id = ?', [node.resourceId]);
      return {
        node,
        resource: this.mapResource(resourceRow!),
        progress: this.deriveNodeProgress(node.id),
      };
    });
    return { path, nodes, stats: this.computeStats(pathId) };
  }

  exportAll(): StudyExport {
    return {
      schemaVersion: STUDY_SCHEMA_VERSION,
      exportedAt: Date.now(),
      paths: this.all<Record<string, unknown>>('SELECT * FROM study_paths').map((r) => this.mapPath(r)),
      resources: this.all<Record<string, unknown>>('SELECT * FROM study_resources').map((r) => this.mapResource(r)),
      nodes: this.all<Record<string, unknown>>('SELECT * FROM study_path_nodes').map((r) => this.mapNode(r)),
      progressEvents: this.all<Record<string, unknown>>('SELECT * FROM study_progress_events').map((r) => this.mapProgressEvent(r)),
      sessions: this.all<Record<string, unknown>>('SELECT * FROM study_sessions').map((r) => this.mapSession(r)),
      deliverables: this.all<Record<string, unknown>>('SELECT * FROM study_deliverables').map((r) => this.mapDeliverable(r)),
    };
  }

  close(): void {
    this.flush();
    this.db.close();
  }

  // ---- derivation ----

  private deriveNodeProgress(nodeId: string): StudyNodeProgress {
    const events = this.all<Record<string, unknown>>(
      'SELECT * FROM study_progress_events WHERE node_id = ? ORDER BY created_at',
      [nodeId],
    ).map((r) => this.mapProgressEvent(r));

    const node = this.first<Record<string, unknown>>('SELECT * FROM study_path_nodes WHERE id = ?', [nodeId]);
    const resource = node
      ? this.first<Record<string, unknown>>('SELECT * FROM study_resources WHERE id = ?', [String(node.resource_id)])
      : null;

    let unitsCompleted = 0;
    let completionState: StudyCompletionState = 'not_started';
    let totalSnapshot: number | null = null;
    let updatedAt: number | null = null;

    for (const event of events) {
      unitsCompleted += event.unitsDelta;
      if (event.totalUnitsSnapshot != null) totalSnapshot = event.totalUnitsSnapshot;
      if (event.completionState) completionState = event.completionState;
      updatedAt = event.createdAt;
    }

    const totalUnits = totalSnapshot
      ?? (node?.target_units != null ? Number(node.target_units) : null)
      ?? (resource?.total_units != null ? Number(resource.total_units) : null);

    if (completionState !== 'completed') {
      if (totalUnits != null && totalUnits > 0 && unitsCompleted >= totalUnits) completionState = 'completed';
      else if (unitsCompleted > 0) completionState = 'in_progress';
    }

    const fraction = completionState === 'completed'
      ? 1
      : totalUnits && totalUnits > 0
        ? Math.min(1, unitsCompleted / totalUnits)
        : 0;

    return { nodeId, unitsCompleted, totalUnits, completionState, fraction, updatedAt };
  }

  private computeStats(pathId: string): StudyPathStats {
    const nodes = this.all<Record<string, unknown>>(
      'SELECT id FROM study_path_nodes WHERE path_id = ? AND archived_at IS NULL',
      [pathId],
    ).map((r) => String(r.id));

    let completedNodes = 0;
    let fractionSum = 0;
    for (const nodeId of nodes) {
      const progress = this.deriveNodeProgress(nodeId);
      if (progress.completionState === 'completed') completedNodes += 1;
      fractionSum += progress.fraction;
    }

    const time = this.first<{ total: number | null; count: number; last: number | null }>(
      'SELECT SUM(duration_seconds) AS total, COUNT(*) AS count, MAX(ended_at) AS last FROM study_sessions WHERE path_id = ?',
      [pathId],
    );

    return {
      pathId,
      totalNodes: nodes.length,
      completedNodes,
      overallFraction: nodes.length ? fractionSum / nodes.length : 0,
      totalTimeSeconds: time?.total ?? 0,
      sessionCount: time?.count ?? 0,
      lastStudiedAt: time?.last ?? null,
    };
  }

  // ---- mapping ----

  private mapPath(row: Record<string, unknown>): StudyPath {
    return {
      id: String(row.id),
      title: String(row.title),
      description: row.description == null ? null : String(row.description),
      status: String(row.status) as StudyPath['status'],
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      archivedAt: row.archived_at == null ? null : Number(row.archived_at),
    };
  }

  private mapResource(row: Record<string, unknown>): StudyResource {
    return {
      id: String(row.id),
      resourceType: String(row.resource_type) as StudyResource['resourceType'],
      title: String(row.title),
      sourceUrl: row.source_url == null ? null : String(row.source_url),
      localRef: row.local_ref == null ? null : String(row.local_ref),
      authorOrProvider: row.author_or_provider == null ? null : String(row.author_or_provider),
      totalUnits: row.total_units == null ? null : Number(row.total_units),
      unitKind: row.unit_kind == null ? null : (String(row.unit_kind) as StudyResource['unitKind']),
      metadata: row.metadata == null ? null : JSON.parse(String(row.metadata)),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      archivedAt: row.archived_at == null ? null : Number(row.archived_at),
    };
  }

  private mapNode(row: Record<string, unknown>): StudyPathNode {
    return {
      id: String(row.id),
      pathId: String(row.path_id),
      resourceId: String(row.resource_id),
      parentNodeId: row.parent_node_id == null ? null : String(row.parent_node_id),
      position: Number(row.position),
      titleOverride: row.title_override == null ? null : String(row.title_override),
      status: String(row.status) as StudyPathNode['status'],
      targetUnits: row.target_units == null ? null : Number(row.target_units),
      notes: row.notes == null ? null : String(row.notes),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      archivedAt: row.archived_at == null ? null : Number(row.archived_at),
    };
  }

  private mapProgressEvent(row: Record<string, unknown>): StudyProgressEvent {
    return {
      id: String(row.id),
      nodeId: String(row.node_id),
      unitsDelta: Number(row.units_delta),
      totalUnitsSnapshot: row.total_units_snapshot == null ? null : Number(row.total_units_snapshot),
      completionState: row.completion_state == null ? null : (String(row.completion_state) as StudyCompletionState),
      note: row.note == null ? null : String(row.note),
      createdAt: Number(row.created_at),
    };
  }

  private mapSession(row: Record<string, unknown>): StudySession {
    return {
      id: String(row.id),
      pathId: row.path_id == null ? null : String(row.path_id),
      nodeId: row.node_id == null ? null : String(row.node_id),
      resourceId: row.resource_id == null ? null : String(row.resource_id),
      startedAt: Number(row.started_at),
      endedAt: row.ended_at == null ? null : Number(row.ended_at),
      durationSeconds: Number(row.duration_seconds),
      note: row.note == null ? null : String(row.note),
      createdAt: Number(row.created_at),
    };
  }

  private mapDeliverable(row: Record<string, unknown>): StudyDeliverable {
    return {
      id: String(row.id),
      sessionId: row.session_id == null ? null : String(row.session_id),
      nodeId: row.node_id == null ? null : String(row.node_id),
      deliverableType: String(row.deliverable_type) as StudyDeliverable['deliverableType'],
      content: String(row.content),
      createdAt: Number(row.created_at),
    };
  }

  // ---- infra ----

  private touchPath(pathId: string, now: number): void {
    this.run('UPDATE study_paths SET updated_at = ? WHERE id = ?', [now, pathId]);
  }

  private migrate(): void {
    this.db.run('CREATE TABLE IF NOT EXISTS study_schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
    const current = this.schemaVersion();
    if (current >= STUDY_SCHEMA_VERSION) return;

    if (current < 1) {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS study_paths (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          archived_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS study_resources (
          id TEXT PRIMARY KEY,
          resource_type TEXT NOT NULL,
          title TEXT NOT NULL,
          source_url TEXT,
          local_ref TEXT,
          author_or_provider TEXT,
          total_units INTEGER,
          unit_kind TEXT,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          archived_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS study_path_nodes (
          id TEXT PRIMARY KEY,
          path_id TEXT NOT NULL,
          resource_id TEXT NOT NULL,
          parent_node_id TEXT,
          position INTEGER NOT NULL,
          title_override TEXT,
          status TEXT NOT NULL,
          target_units INTEGER,
          notes TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          archived_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS study_progress_events (
          id TEXT PRIMARY KEY,
          node_id TEXT NOT NULL,
          units_delta INTEGER NOT NULL,
          total_units_snapshot INTEGER,
          completion_state TEXT,
          note TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS study_sessions (
          id TEXT PRIMARY KEY,
          path_id TEXT,
          node_id TEXT,
          resource_id TEXT,
          started_at INTEGER NOT NULL,
          ended_at INTEGER,
          duration_seconds INTEGER NOT NULL,
          note TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS study_deliverables (
          id TEXT PRIMARY KEY,
          session_id TEXT,
          node_id TEXT,
          deliverable_type TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS study_nodes_path ON study_path_nodes(path_id, position);
        CREATE INDEX IF NOT EXISTS study_progress_node ON study_progress_events(node_id, created_at);
        CREATE INDEX IF NOT EXISTS study_sessions_path ON study_sessions(path_id);
      `);
    }

    this.db.run('INSERT OR IGNORE INTO study_schema_migrations(version, applied_at) VALUES (?, ?)', [STUDY_SCHEMA_VERSION, Date.now()]);
    this.flush();
  }

  private flush(): void {
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    const temp = `${this.filename}.tmp`;
    fs.writeFileSync(temp, Buffer.from(this.db.export()));
    fs.renameSync(temp, this.filename);
  }

  private run(sql: string, params: unknown[] = []): void {
    this.db.run(sql, params as never);
  }

  private all<T>(sql: string, params: unknown[] = []): T[] {
    const statement = this.db.prepare(sql);
    statement.bind(params as never);
    const rows: T[] = [];
    while (statement.step()) rows.push(statement.getAsObject() as T);
    statement.free();
    return rows;
  }

  private first<T>(sql: string, params: unknown[] = []): T | null {
    return this.all<T>(sql, params)[0] ?? null;
  }
}

// Canonical Study Mode domain contracts shared between main and renderer.
// Durability rule: these types describe CANONICAL persisted data. Derived
// statistics (see StudyPathStats) are always recomputed, never stored as the
// source of truth.

export const STUDY_SCHEMA_VERSION = 1;

export type StudyPathStatus = 'active' | 'paused' | 'completed' | 'archived';
export type StudyNodeStatus = 'todo' | 'in_progress' | 'done' | 'skipped';
export type StudyCompletionState = 'not_started' | 'in_progress' | 'completed';

export type StudyResourceType =
  | 'book'
  | 'pdf'
  | 'article'
  | 'video'
  | 'course'
  | 'tab'
  | 'checkpoint';

export type StudyUnitKind = 'pages' | 'lessons' | 'minutes' | 'items' | 'binary';

export type StudyDeliverableType =
  | 'note'
  | 'takeaway'
  | 'exercise'
  | 'code'
  | 'photo'
  | 'summary';

export interface StudyPath {
  id: string;
  title: string;
  description: string | null;
  status: StudyPathStatus;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export interface StudyResource {
  id: string;
  resourceType: StudyResourceType;
  title: string;
  sourceUrl: string | null;
  localRef: string | null;
  authorOrProvider: string | null;
  totalUnits: number | null;
  unitKind: StudyUnitKind | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export interface StudyPathNode {
  id: string;
  pathId: string;
  resourceId: string;
  parentNodeId: string | null;
  position: number;
  titleOverride: string | null;
  status: StudyNodeStatus;
  targetUnits: number | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

// Progress is modeled as an append-only event log. The current progress of a
// node is DERIVED from its events, never mutated in place. This keeps history
// intact and makes future sync/merge tractable.
export interface StudyProgressEvent {
  id: string;
  nodeId: string;
  unitsDelta: number;
  totalUnitsSnapshot: number | null;
  completionState: StudyCompletionState | null;
  note: string | null;
  createdAt: number;
}

export interface StudySession {
  id: string;
  pathId: string | null;
  nodeId: string | null;
  resourceId: string | null;
  startedAt: number;
  endedAt: number | null;
  durationSeconds: number;
  note: string | null;
  createdAt: number;
}

export interface StudyDeliverable {
  id: string;
  sessionId: string | null;
  nodeId: string | null;
  deliverableType: StudyDeliverableType;
  content: string;
  createdAt: number;
}

// ---- Derived projections (recomputed, not canonical) ----

export interface StudyNodeProgress {
  nodeId: string;
  unitsCompleted: number;
  totalUnits: number | null;
  completionState: StudyCompletionState;
  fraction: number; // 0..1; 0 when total unknown/zero
  updatedAt: number | null;
}

export interface StudyPathStats {
  pathId: string;
  totalNodes: number;
  completedNodes: number;
  overallFraction: number; // 0..1 across nodes with known targets
  totalTimeSeconds: number;
  sessionCount: number;
  lastStudiedAt: number | null;
}

export interface StudyPathDetail {
  path: StudyPath;
  nodes: Array<{
    node: StudyPathNode;
    resource: StudyResource;
    progress: StudyNodeProgress;
  }>;
  stats: StudyPathStats;
}

// ---- Command inputs ----

export interface CreatePathInput {
  title: string;
  description?: string | null;
}

export interface CreateResourceInput {
  resourceType: StudyResourceType;
  title: string;
  sourceUrl?: string | null;
  localRef?: string | null;
  authorOrProvider?: string | null;
  totalUnits?: number | null;
  unitKind?: StudyUnitKind | null;
  metadata?: Record<string, unknown> | null;
}

export interface AddNodeInput {
  pathId: string;
  resource: CreateResourceInput;
  parentNodeId?: string | null;
  titleOverride?: string | null;
  targetUnits?: number | null;
  notes?: string | null;
}

export interface RecordProgressInput {
  nodeId: string;
  unitsDelta?: number;
  totalUnitsSnapshot?: number | null;
  completionState?: StudyCompletionState | null;
  note?: string | null;
}

export interface LogSessionInput {
  pathId?: string | null;
  nodeId?: string | null;
  resourceId?: string | null;
  startedAt?: number;
  endedAt?: number | null;
  durationSeconds: number;
  note?: string | null;
  deliverable?: {
    deliverableType: StudyDeliverableType;
    content: string;
  } | null;
}

export interface StudyExport {
  schemaVersion: number;
  exportedAt: number;
  paths: StudyPath[];
  resources: StudyResource[];
  nodes: StudyPathNode[];
  progressEvents: StudyProgressEvent[];
  sessions: StudySession[];
  deliverables: StudyDeliverable[];
}

export interface StudyBridge {
  listPaths(): Promise<Array<{ path: StudyPath; stats: StudyPathStats }>>;
  getPathDetail(pathId: string): Promise<StudyPathDetail | null>;
  createPath(input: CreatePathInput): Promise<StudyPath>;
  addNode(input: AddNodeInput): Promise<StudyPathNode>;
  recordProgress(input: RecordProgressInput): Promise<StudyNodeProgress>;
  logSession(input: LogSessionInput): Promise<StudySession>;
  exportAll(): Promise<StudyExport>;
}

declare global {
  interface Window {
    study: StudyBridge;
  }
}

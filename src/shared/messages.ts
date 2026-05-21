import type { TabEntry, Workspace, UserPrefs, SnoozeRule } from '../store/types';

// ─── UI → Background ─────────────────────────────────────────────────────────

export interface SnoozeTabMessage {
  type: 'SNOOZE_TAB';
  payload: { tabId: string; rule: SnoozeRule };
}

export interface UnsnoozeTabMessage {
  type: 'UNSNOOZE_TAB';
  payload: { tabId: string };
}

export interface VirtualizeTabMessage {
  type: 'VIRTUALIZE_TAB';
  payload: { tabId: string };
}

export interface RestoreTabMessage {
  type: 'RESTORE_TAB';
  payload: { tabId: string };
}

export interface ArchiveTabMessage {
  type: 'ARCHIVE_TAB';
  payload: { tabId: string };
}

export interface DeleteTabMessage {
  type: 'DELETE_TAB';
  payload: { tabId: string };
}

export interface AssignWorkspaceMessage {
  type: 'ASSIGN_WORKSPACE';
  payload: { tabId: string; workspaceId: string };
}

export interface SwitchWorkspaceMessage {
  type: 'SWITCH_WORKSPACE';
  payload: { workspaceId: string };
}

export interface CreateWorkspaceMessage {
  type: 'CREATE_WORKSPACE';
  payload: Omit<Workspace, 'id' | 'createdAt' | 'sortOrder'>;
}

export interface UpdateWorkspaceMessage {
  type: 'UPDATE_WORKSPACE';
  payload: Workspace;
}

export interface DeleteWorkspaceMessage {
  type: 'DELETE_WORKSPACE';
  payload: { workspaceId: string };
}

export interface SavePrefsMessage {
  type: 'SAVE_PREFS';
  payload: UserPrefs;
}

export interface GetStateMessage {
  type: 'GET_STATE';
}

export interface TriggerExportMessage {
  type: 'TRIGGER_EXPORT';
  payload: {
    scope: 'full' | 'selective';
    workspaceIds?: string[];
    includeArchived: boolean;
    includeEmbeddings: boolean;
  };
}

export interface TriggerImportMessage {
  type: 'TRIGGER_IMPORT';
  payload: {
    archiveJson: string;
    strategy: 'clean' | 'merge' | 'workspace';
    workspaceIds?: string[];
  };
}

// ─── Background → UI ─────────────────────────────────────────────────────────

export interface TabsUpdatedMessage {
  type: 'TABS_UPDATED';
  payload: { entries: TabEntry[] };
}

export interface WorkspacesUpdatedMessage {
  type: 'WORKSPACES_UPDATED';
  payload: { workspaces: Workspace[] };
}

export interface PrefsUpdatedMessage {
  type: 'PREFS_UPDATED';
  payload: UserPrefs;
}

export interface StateResponseMessage {
  type: 'STATE_RESPONSE';
  payload: {
    tabs: TabEntry[];
    workspaces: Workspace[];
    prefs: UserPrefs;
  };
}

export interface ImportProgressMessage {
  type: 'IMPORT_PROGRESS';
  payload: { processed: number; total: number; done: boolean };
}

export interface ErrorMessage {
  type: 'ERROR';
  payload: { message: string };
}

// ─── Union types for type-safe dispatch ──────────────────────────────────────

export type BackgroundMessage =
  | SnoozeTabMessage
  | UnsnoozeTabMessage
  | VirtualizeTabMessage
  | RestoreTabMessage
  | ArchiveTabMessage
  | DeleteTabMessage
  | AssignWorkspaceMessage
  | SwitchWorkspaceMessage
  | CreateWorkspaceMessage
  | UpdateWorkspaceMessage
  | DeleteWorkspaceMessage
  | SavePrefsMessage
  | GetStateMessage
  | TriggerExportMessage
  | TriggerImportMessage;

export type UIMessage =
  | TabsUpdatedMessage
  | WorkspacesUpdatedMessage
  | PrefsUpdatedMessage
  | StateResponseMessage
  | ImportProgressMessage
  | ErrorMessage;

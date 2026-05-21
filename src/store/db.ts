import { TabOSDatabase } from './schema';
import type { TabEntry, Workspace, UserPrefs } from './types';
import { DEFAULT_USER_PREFS } from './types';

// Single shared instance — safe because IndexedDB connections are reference-counted
export const db = new TabOSDatabase();

// ─── TabEntries ──────────────────────────────────────────────────────────────

export async function getTabEntry(id: string): Promise<TabEntry | undefined> {
  return db.tabEntries.get(id);
}

export async function getTabEntryByChromeId(chromeTabId: number): Promise<TabEntry | undefined> {
  return db.tabEntries.where('chromeTabId').equals(chromeTabId).first();
}

export async function upsertTabEntry(entry: TabEntry): Promise<void> {
  await db.tabEntries.put(entry);
}

export async function upsertTabEntries(entries: TabEntry[]): Promise<void> {
  await db.tabEntries.bulkPut(entries);
}

export async function getTabsByState(state: TabEntry['state']): Promise<TabEntry[]> {
  return db.tabEntries.where('state').equals(state).toArray();
}

export async function getTabsByWorkspace(workspaceId: string): Promise<TabEntry[]> {
  return db.tabEntries.where('workspaceId').equals(workspaceId).toArray();
}

export async function getActiveTabs(): Promise<TabEntry[]> {
  return getTabsByState('active');
}

export async function getSnoozedTabsDue(now: number): Promise<TabEntry[]> {
  return db.tabEntries
    .where('snoozeUntil')
    .belowOrEqual(now)
    .filter((t) => t.state === 'snoozed')
    .toArray();
}

export async function getAllTabs(): Promise<TabEntry[]> {
  return db.tabEntries.toArray();
}

export async function deleteTabEntry(id: string): Promise<void> {
  await db.tabEntries.delete(id);
}

export async function clearAllTabEntries(): Promise<void> {
  await db.tabEntries.clear();
}

// ─── Workspaces ──────────────────────────────────────────────────────────────

export async function getAllWorkspaces(): Promise<Workspace[]> {
  return db.workspaces.orderBy('sortOrder').toArray();
}

export async function getWorkspace(id: string): Promise<Workspace | undefined> {
  return db.workspaces.get(id);
}

export async function getActiveWorkspace(): Promise<Workspace | undefined> {
  return db.workspaces.where('isActive').equals(1).first();
}

export async function upsertWorkspace(workspace: Workspace): Promise<void> {
  await db.workspaces.put(workspace);
}

export async function deleteWorkspace(id: string): Promise<void> {
  await db.workspaces.delete(id);
}

export async function clearAllWorkspaces(): Promise<void> {
  await db.workspaces.clear();
}

// ─── UserPrefs ───────────────────────────────────────────────────────────────
// Stored in chrome.storage.local (small, fast, needs to be available before DB open)

export async function getUserPrefs(): Promise<UserPrefs> {
  return new Promise((resolve) => {
    chrome.storage.local.get('userPrefs', (result) => {
      resolve({ ...DEFAULT_USER_PREFS, ...(result['userPrefs'] as Partial<UserPrefs> | undefined) });
    });
  });
}

export async function saveUserPrefs(prefs: UserPrefs): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ userPrefs: prefs }, resolve);
  });
}

import { initTracker, rehydrateFocusState, buildEntryFromChromeTabSync } from './tracker';
import { initScheduler, rehydrateSnoozeAlarms, scheduleSnooze, cancelSnooze } from './scheduler';
import {
  getAllTabs,
  getAllWorkspaces,
  getUserPrefs,
  upsertTabEntry,
  upsertTabEntries,
  upsertWorkspace,
  deleteWorkspace,
  saveUserPrefs,
  getTabEntry,
  getTabEntryByChromeId,
} from '../store/db';
import { virtualizeTab, restoreTab } from './virtualizer';
import { broadcastTabsUpdate, broadcastWorkspacesUpdate } from './broadcast';
import type { BackgroundMessage } from '../shared/messages';
import { generateId } from '../shared/utils';
import type { Workspace } from '../store/types';
import { WORKSPACE_COLORS } from '../shared/constants';

// ─── Startup ─────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(onInstalled);
chrome.runtime.onStartup.addListener(onStartup);

// Register message listener immediately — Chrome may send messages before
// the async startup routines complete
chrome.runtime.onMessage.addListener(
  (message: BackgroundMessage, _sender, sendResponse) => {
    handleMessage(message, sendResponse);
    return true; // Keep channel open for async response
  },
);

async function onInstalled(): Promise<void> {
  await boot();
  setupContextMenus();
}

async function onStartup(): Promise<void> {
  await boot();
}

async function boot(): Promise<void> {
  initTracker();
  initScheduler();
  await rehydrateFocusState();
  await rehydrateSnoozeAlarms();
  await syncLiveTabsToStore();
}

// ─── Context menus ───────────────────────────────────────────────────────────

function setupContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'tabos-snooze-1h',
      title: 'Snooze for 1 hour',
      contexts: ['page', 'frame'],
    });
    chrome.contextMenus.create({
      id: 'tabos-snooze-1d',
      title: 'Snooze for 1 day',
      contexts: ['page', 'frame'],
    });
    chrome.contextMenus.create({
      id: 'tabos-snooze-1w',
      title: 'Snooze for 1 week',
      contexts: ['page', 'frame'],
    });
    chrome.contextMenus.create({
      id: 'tabos-virtualize',
      title: 'Virtualize this tab',
      contexts: ['page', 'frame'],
    });
  });

  chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
}

async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
): Promise<void> {
  if (!tab?.id) return;
  const { getTabEntryByChromeId } = await import('../store/db');
  const entry = await getTabEntryByChromeId(tab.id);
  if (!entry) return;

  const now = Date.now();
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  if (info.menuItemId === 'tabos-snooze-1h') {
    await scheduleSnooze({ ...entry, snoozeUntil: now + HOUR, snoozeRule: { type: 'duration', durationMs: HOUR } });
  } else if (info.menuItemId === 'tabos-snooze-1d') {
    await scheduleSnooze({ ...entry, snoozeUntil: now + DAY, snoozeRule: { type: 'duration', durationMs: DAY } });
  } else if (info.menuItemId === 'tabos-snooze-1w') {
    await scheduleSnooze({ ...entry, snoozeUntil: now + 7 * DAY, snoozeRule: { type: 'duration', durationMs: 7 * DAY } });
  } else if (info.menuItemId === 'tabos-virtualize') {
    await virtualizeTab(entry);
  }
}

// ─── Message handler ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleMessage(message: BackgroundMessage, sendResponse: (r: any) => void): Promise<void> {
  try {
    switch (message.type) {
      case 'GET_STATE': {
        const [tabs, workspaces, prefs] = await Promise.all([
          getAllTabs(),
          getAllWorkspaces(),
          getUserPrefs(),
        ]);
        sendResponse({ type: 'STATE_RESPONSE', payload: { tabs, workspaces, prefs } });
        break;
      }

      case 'FORCE_SYNC': {
        await syncLiveTabsToStore();
        sendResponse({ ok: true });
        break;
      }

      case 'GET_DIAGNOSTICS': {
        const chromeTabs = await chrome.tabs.query({});
        const stored = await getAllTabs();
        const SKIP = ['chrome://', 'chrome-extension://', 'devtools://', 'about:', 'data:'];
        const skipped = chromeTabs.filter(t => {
          const url = t.url || t.pendingUrl || '';
          return !url || SKIP.some(s => url.startsWith(s));
        });
        const byState = stored.reduce((acc, t) => {
          acc[t.state] = (acc[t.state] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        sendResponse({
          chromeTabsTotal: chromeTabs.length,
          chromeTabsSkipped: skipped.length,
          chromeTabsImportable: chromeTabs.length - skipped.length,
          storedTotal: stored.length,
          storedByState: byState,
        });
        break;
      }

      case 'RESTORE_TAB': {
        const entry = await getTabEntry(message.payload.tabId);
        if (entry) await restoreTab(entry);
        sendResponse({ ok: true });
        break;
      }

      case 'VIRTUALIZE_TAB': {
        const entry = await getTabEntry(message.payload.tabId);
        if (entry) await virtualizeTab(entry);
        sendResponse({ ok: true });
        break;
      }

      case 'ARCHIVE_TAB': {
        const entry = await getTabEntry(message.payload.tabId);
        if (entry) await upsertTabEntry({ ...entry, state: 'archived' });
        await broadcastTabsUpdate();
        sendResponse({ ok: true });
        break;
      }

      case 'DELETE_TAB': {
        const { deleteTabEntry } = await import('../store/db');
        await deleteTabEntry(message.payload.tabId);
        await broadcastTabsUpdate();
        sendResponse({ ok: true });
        break;
      }

      case 'SNOOZE_TAB': {
        const entry = await getTabEntry(message.payload.tabId);
        if (entry) {
          const snoozed = { ...entry, ...message.payload.rule };
          await scheduleSnooze(snoozed);
        }
        sendResponse({ ok: true });
        break;
      }

      case 'UNSNOOZE_TAB': {
        const entry = await getTabEntry(message.payload.tabId);
        if (entry) await cancelSnooze(entry);
        sendResponse({ ok: true });
        break;
      }

      case 'ASSIGN_WORKSPACE': {
        const entry = await getTabEntry(message.payload.tabId);
        if (entry) {
          await upsertTabEntry({ ...entry, workspaceId: message.payload.workspaceId, confidence: 1, classifierLevel: 1 });
          await broadcastTabsUpdate();
        }
        sendResponse({ ok: true });
        break;
      }

      case 'SWITCH_WORKSPACE': {
        await handleWorkspaceSwitch(message.payload.workspaceId);
        sendResponse({ ok: true });
        break;
      }

      case 'CREATE_WORKSPACE': {
        const workspaces = await getAllWorkspaces();
        const ws: Workspace = {
          ...message.payload,
          id: generateId(),
          createdAt: Date.now(),
          sortOrder: workspaces.length,
        };
        await upsertWorkspace(ws);
        await broadcastWorkspacesUpdate();
        sendResponse({ ok: true, id: ws.id });
        break;
      }

      case 'UPDATE_WORKSPACE': {
        await upsertWorkspace(message.payload);
        await broadcastWorkspacesUpdate();
        sendResponse({ ok: true });
        break;
      }

      case 'DELETE_WORKSPACE': {
        await deleteWorkspace(message.payload.workspaceId);
        await broadcastWorkspacesUpdate();
        sendResponse({ ok: true });
        break;
      }

      case 'SAVE_PREFS': {
        await saveUserPrefs(message.payload);
        await broadcastPrefsUpdate(message.payload);
        sendResponse({ ok: true });
        break;
      }

      case 'TRIGGER_EXPORT': {
        const { runExport } = await import('../portability/exporter');
        await runExport(message.payload);
        sendResponse({ ok: true });
        break;
      }

      case 'TRIGGER_IMPORT': {
        const { runImport } = await import('../portability/importer');
        await runImport(message.payload);
        sendResponse({ ok: true });
        break;
      }

      default:
        sendResponse({ ok: false, error: 'Unknown message type' });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sendResponse({ ok: false, error: msg });
  }
}

async function broadcastPrefsUpdate(prefs: unknown): Promise<void> {
  chrome.runtime.sendMessage({ type: 'PREFS_UPDATED', payload: prefs }).catch(() => {});
}

// ─── Workspace switching ─────────────────────────────────────────────────────

async function handleWorkspaceSwitch(targetWorkspaceId: string): Promise<void> {
  const [allTabs, workspaces] = await Promise.all([getAllTabs(), getAllWorkspaces()]);
  const now = Date.now();

  const currentWorkspace = workspaces.find((w) => w.isActive);
  const targetWorkspace = workspaces.find((w) => w.id === targetWorkspaceId);
  if (!targetWorkspace) return;

  // Virtualize tabs from the current workspace not touched in last 5 minutes
  if (currentWorkspace) {
    const toVirtualize = allTabs.filter(
      (t) => t.workspaceId === currentWorkspace.id && t.state === 'active' && now - t.lastActiveAt > 5 * 60_000,
    );
    for (const tab of toVirtualize) {
      await virtualizeTab(tab);
    }
    await upsertWorkspace({ ...currentWorkspace, isActive: false });
  }

  // Restore virtualized tabs in the target workspace (up to tabLimit)
  const limit = targetWorkspace.tabLimit ?? 20;
  const toRestore = allTabs
    .filter((t) => t.workspaceId === targetWorkspaceId && t.state === 'virtualized')
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
    .slice(0, limit);

  for (const tab of toRestore) {
    await restoreTab(tab);
  }

  await upsertWorkspace({ ...targetWorkspace, isActive: true });
  await broadcastWorkspacesUpdate();
  await broadcastTabsUpdate();
}

// ─── Sync on startup ─────────────────────────────────────────────────────────

/**
 * On install or service worker restart, query ALL open Chrome tabs across
 * every window and import any not yet in the store.
 *
 * Designed for large sessions (2000+ tabs):
 *  - One chrome.tabs.query() call — returns everything including discarded tabs
 *  - One getAllTabs() call — builds an in-memory lookup map (no per-tab DB hits)
 *  - Corpus loaded once — classification is synchronous per tab
 *  - Writes in 500-entry chunks via bulkPut
 */
export async function syncLiveTabsToStore(): Promise<void> {
  const { loadCorpora } = await import('../classifier/tfidf');
  const { chunk } = await import('../shared/utils');

  const [chromeTabs, workspaces, existingEntries, corpora] = await Promise.all([
    chrome.tabs.query({}),
    getAllWorkspaces(),
    getAllTabs(),
    loadCorpora(),
  ]);

  // Build lookup maps from existing data — O(1) per tab instead of O(n) DB queries
  const existingByChromeId = new Map(
    existingEntries.filter(e => e.chromeTabId != null).map(e => [e.chromeTabId!, e]),
  );
  const existingByUrl = new Map(existingEntries.map(e => [e.url, e]));

  const toCreate: import('../store/types').TabEntry[] = [];
  const toUpdate: import('../store/types').TabEntry[] = [];

  for (const tab of chromeTabs) {
    if (!tab.id) continue;

    const knownById = existingByChromeId.get(tab.id);
    if (knownById) {
      // Already tracked — reconcile state in case the browser was restarted
      if (knownById.state !== 'active') {
        toUpdate.push({ ...knownById, chromeTabId: tab.id, state: 'active' });
      }
      continue;
    }

    // Build the entry — sync, no awaits inside the loop
    const entry = buildEntryFromChromeTabSync(tab, workspaces, corpora);
    if (!entry) continue;

    // If we've seen this URL before (different chromeTabId), update rather than duplicate
    const knownByUrl = existingByUrl.get(entry.url);
    if (knownByUrl) {
      toUpdate.push({ ...knownByUrl, chromeTabId: tab.id, state: 'active' });
    } else {
      toCreate.push(entry);
    }
  }

  // Write in chunks — Dexie bulkPut handles the batching efficiently
  const allWrites = [...toCreate, ...toUpdate];
  for (const batch of chunk(allWrites, 500)) {
    await upsertTabEntries(batch);
  }

  if (allWrites.length > 0) {
    await broadcastTabsUpdate();
    console.log(`[TabOS] Synced ${toCreate.length} new + ${toUpdate.length} updated tabs from ${chromeTabs.length} Chrome tabs`);
  }
}

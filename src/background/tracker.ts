import { v4 as uuidv4 } from 'uuid';
import { db, getTabEntryByChromeId, upsertTabEntry, getActiveTabs, getAllWorkspaces } from '../store/db';
import { extractDomain } from '../shared/utils';
import { UNASSIGNED_WORKSPACE_ID } from '../store/types';
import type { TabEntry } from '../store/types';
import { classifyTab } from '../classifier/engine';
import { broadcastTabsUpdate } from './broadcast';

// Tracks the currently focused tab and when it gained focus
let focusedChromeTabId: number | null = null;
let focusGainedAt: number | null = null;

export function initTracker(): void {
  chrome.tabs.onCreated.addListener(handleTabCreated);
  chrome.tabs.onUpdated.addListener(handleTabUpdated);
  chrome.tabs.onActivated.addListener(handleTabActivated);
  chrome.tabs.onRemoved.addListener(handleTabRemoved);
  chrome.windows.onFocusChanged.addListener(handleWindowFocusChanged);
}

/** Build a TabEntry from a Chrome tab object and classify it. Exported for use by the initial sync. */
export async function buildEntryFromChromeTab(
  tab: chrome.tabs.Tab,
  workspaces: Awaited<ReturnType<typeof getAllWorkspaces>>,
): Promise<TabEntry | null> {
  if (!tab.url || !tab.id || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return null;

  const now = Date.now();
  const domain = extractDomain(tab.url);

  const entry: TabEntry = {
    id: uuidv4(),
    chromeTabId: tab.id,
    url: tab.url,
    title: tab.title ?? tab.url,
    favicon: tab.favIconUrl ?? '',
    domain,
    state: 'active',
    createdAt: now,
    lastActiveAt: now,
    visitCount: 1,
    totalActiveMs: 0,
    workspaceId: UNASSIGNED_WORKSPACE_ID,
    confidence: 0,
    classifierLevel: 1,
    tags: [],
    stalenessScore: 0,
    lastScoredAt: now,
  };

  const classification = await classifyTab(entry, workspaces);
  entry.workspaceId = classification.workspaceId;
  entry.confidence = classification.confidence;
  entry.classifierLevel = classification.level;

  return entry;
}

async function handleTabCreated(tab: chrome.tabs.Tab): Promise<void> {
  const workspaces = await getAllWorkspaces();
  const entry = await buildEntryFromChromeTab(tab, workspaces);
  if (!entry) return;
  await upsertTabEntry(entry);
  await broadcastTabsUpdate();
}

async function handleTabUpdated(
  chromeTabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
  tab: chrome.tabs.Tab,
): Promise<void> {
  // Only act when the URL or title changes on a fully loaded tab
  if (!changeInfo.url && !changeInfo.title) return;
  if (!tab.url || tab.url.startsWith('chrome://')) return;

  const existing = await getTabEntryByChromeId(chromeTabId);
  if (!existing) return;

  const urlChanged = changeInfo.url && changeInfo.url !== existing.url;
  const updated: TabEntry = {
    ...existing,
    url: tab.url,
    title: tab.title ?? tab.url,
    favicon: tab.favIconUrl ?? existing.favicon,
    domain: extractDomain(tab.url),
  };

  // Re-classify if URL changed (user navigated to a different site)
  if (urlChanged) {
    const workspaces = await getAllWorkspaces();
    const classification = await classifyTab(updated, workspaces);
    updated.workspaceId = classification.workspaceId;
    updated.confidence = classification.confidence;
    updated.classifierLevel = classification.level;
  }

  await upsertTabEntry(updated);
  await broadcastTabsUpdate();
}

async function handleTabActivated(activeInfo: chrome.tabs.TabActiveInfo): Promise<void> {
  const now = Date.now();

  // Accumulate active time for the previously focused tab
  if (focusedChromeTabId !== null && focusGainedAt !== null) {
    await accumulateActiveTime(focusedChromeTabId, now - focusGainedAt);
  }

  focusedChromeTabId = activeInfo.tabId;
  focusGainedAt = now;

  const entry = await getTabEntryByChromeId(activeInfo.tabId);
  if (!entry) return;

  await upsertTabEntry({
    ...entry,
    lastActiveAt: now,
    visitCount: entry.visitCount + 1,
    state: 'active',
  });

  await broadcastTabsUpdate();
}

async function handleTabRemoved(chromeTabId: number, removeInfo: chrome.tabs.TabRemoveInfo): Promise<void> {
  if (removeInfo.isWindowClosing) return;

  // Flush active time for the removed tab
  if (focusedChromeTabId === chromeTabId && focusGainedAt !== null) {
    await accumulateActiveTime(chromeTabId, Date.now() - focusGainedAt);
    focusedChromeTabId = null;
    focusGainedAt = null;
  }

  const entry = await getTabEntryByChromeId(chromeTabId);
  if (!entry) return;

  // User-initiated close: mark archived (not virtualized — TabOS didn't do this)
  await upsertTabEntry({
    ...entry,
    state: 'archived',
    chromeTabId: undefined,
  });

  await broadcastTabsUpdate();
}

function handleWindowFocusChanged(windowId: number): void {
  const now = Date.now();

  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser lost focus — flush active time
    if (focusedChromeTabId !== null && focusGainedAt !== null) {
      accumulateActiveTime(focusedChromeTabId, now - focusGainedAt).catch(() => {});
      focusGainedAt = null;
    }
  } else {
    // Browser regained focus — restart timer for current tab
    if (focusedChromeTabId !== null) {
      focusGainedAt = now;
    }
  }
}

async function accumulateActiveTime(chromeTabId: number, elapsedMs: number): Promise<void> {
  if (elapsedMs <= 0) return;
  const entry = await getTabEntryByChromeId(chromeTabId);
  if (!entry) return;
  await upsertTabEntry({ ...entry, totalActiveMs: entry.totalActiveMs + elapsedMs });
}

export function getCurrentFocusedTabId(): number | null {
  return focusedChromeTabId;
}

/** Called on service worker restart — sync in-memory focus state with Chrome's current state */
export async function rehydrateFocusState(): Promise<void> {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id) {
      focusedChromeTabId = activeTab.id;
      focusGainedAt = Date.now();
    }
  } catch {
    // Non-critical — focus tracking will resume on next tab activation event
  }
}

import { v4 as uuidv4 } from 'uuid';
import { db, getTabEntryByChromeId, upsertTabEntry, getActiveTabs, getAllWorkspaces } from '../store/db';
import { extractDomain } from '../shared/utils';
import { UNASSIGNED_WORKSPACE_ID } from '../store/types';
import type { TabEntry, Workspace } from '../store/types';
import { classifyTab } from '../classifier/engine';
import { loadCorpora } from '../classifier/tfidf';
import { classifyByDomain } from '../classifier/domain-rules';
import { classifyByTFIDF } from '../classifier/tfidf';
import { L2_CONFIDENCE_THRESHOLD } from '../shared/constants';
import type { WorkspaceCorpora } from '../classifier/types';
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

const SKIP_SCHEMES = ['chrome://', 'chrome-extension://', 'devtools://', 'about:', 'data:'];

/**
 * Tab suspender extensions (The Great Suspender, Tab Suspender, etc.) replace the
 * tab URL with a chrome-extension:// suspended page that embeds the real URL and
 * title in the hash: `#ttl=Page+Title&uri=https://...` or `#url=...`.
 * Returns the real url + title so we store the original page data, not the suspender proxy.
 */
function resolveSuspendedTab(tab: chrome.tabs.Tab): { url: string; title?: string } | null {
  const raw = tab.url || tab.pendingUrl || '';
  if (!raw) return null;

  if (raw.startsWith('chrome-extension://')) {
    try {
      const hash = new URL(raw).hash; // "#ttl=Page+Title&uri=https://..."
      const params = new URLSearchParams(hash.slice(1));
      const realUrl = params.get('uri') ?? params.get('url');
      if (realUrl && (realUrl.startsWith('http://') || realUrl.startsWith('https://'))) {
        const realTitle = params.get('ttl') ?? undefined;
        return { url: realUrl, title: realTitle };
      }
    } catch {
      // malformed — fall through to scheme check
    }
  }

  if (SKIP_SCHEMES.some(s => raw.startsWith(s))) return null;
  return { url: raw };
}

/**
 * Build a TabEntry from a Chrome tab. Accepts pre-loaded workspaces and corpora
 * so the bulk sync can share a single load across thousands of tabs.
 */
export function buildEntryFromChromeTabSync(
  tab: chrome.tabs.Tab,
  workspaces: Workspace[],
  corpora: WorkspaceCorpora,
): TabEntry | null {
  if (!tab.id) return null;
  const resolved = resolveSuspendedTab(tab);
  if (!resolved) return null;

  const { url, title: suspendedTitle } = resolved;
  const now = Date.now();
  const domain = extractDomain(url);
  // Prefer title embedded in suspender hash, then Chrome's tab.title, then URL as fallback
  const title = suspendedTitle ?? tab.title ?? url;

  // Classify inline without async DB hits
  let workspaceId = UNASSIGNED_WORKSPACE_ID;
  let confidence = 0;
  let level: 1 | 2 | 3 = 1;

  const l1 = classifyByDomain(url, workspaces);
  if (l1) {
    workspaceId = l1.workspaceId;
    confidence = l1.confidence;
    level = 1;
  } else {
    const l2 = classifyByTFIDF(title, corpora);
    if (l2 && l2.score >= L2_CONFIDENCE_THRESHOLD) {
      workspaceId = l2.workspaceId;
      confidence = l2.score;
      level = 2;
    }
  }

  return {
    id: uuidv4(),
    chromeTabId: tab.id,
    url,
    title,
    favicon: tab.favIconUrl ?? '',
    domain,
    state: 'active',
    createdAt: now,
    lastActiveAt: now,
    visitCount: 1,
    totalActiveMs: 0,
    workspaceId,
    confidence,
    classifierLevel: level,
    tags: [],
    stalenessScore: 0,
    lastScoredAt: now,
  };
}

/** Async wrapper used by the onCreated event handler (single tab, no pre-loaded corpus). */
export async function buildEntryFromChromeTab(
  tab: chrome.tabs.Tab,
  workspaces: Workspace[],
): Promise<TabEntry | null> {
  const corpora = await loadCorpora();
  return buildEntryFromChromeTabSync(tab, workspaces, corpora);
}

/** Exported for use in diagnostics and other callers that need just the resolved URL. */
export function resolveTabUrl(tab: chrome.tabs.Tab): string | null {
  return resolveSuspendedTab(tab)?.url ?? null;
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
  const resolved = resolveSuspendedTab(tab);
  if (!resolved) return;

  const existing = await getTabEntryByChromeId(chromeTabId);
  if (!existing) return;

  const { url, title: resolvedTitle } = resolved;
  const urlChanged = changeInfo.url && url !== existing.url;
  const updated: TabEntry = {
    ...existing,
    url,
    title: resolvedTitle ?? tab.title ?? url,
    favicon: tab.favIconUrl ?? existing.favicon,
    domain: extractDomain(url),
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

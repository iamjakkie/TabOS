import { getTabEntryByChromeId, upsertTabEntry } from '../store/db';
import type { TabEntry } from '../store/types';
import { broadcastTabsUpdate } from './broadcast';

/**
 * Closes the Chrome tab while preserving the TabEntry as virtualized.
 * All metadata is kept — the tab reappears in the side panel and can be restored.
 */
export async function virtualizeTab(entry: TabEntry): Promise<void> {
  if (entry.state !== 'active' || !entry.chromeTabId) return;

  // Best-effort scroll position capture before closing
  let scrollPosition: number | undefined;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: entry.chromeTabId },
      func: () => window.scrollY,
    });
    scrollPosition = result?.result as number | undefined;
  } catch {
    // Page may have blocked scripting — that's fine, scroll restore is best-effort
  }

  await upsertTabEntry({
    ...entry,
    state: 'virtualized',
    chromeTabId: undefined,
    scrollPosition,
  });

  // Remove the Chrome tab — this triggers onRemoved, but since we already
  // updated state to 'virtualized', the tracker won't re-archive it
  try {
    await chrome.tabs.remove(entry.chromeTabId);
  } catch {
    // Tab may have already been closed
  }

  await broadcastTabsUpdate();
}

/**
 * Re-opens a virtualized tab in Chrome and updates its entry back to active.
 */
export async function restoreTab(entry: TabEntry): Promise<void> {
  if (entry.state === 'active' && entry.chromeTabId) return;

  const tab = await chrome.tabs.create({ url: entry.url, active: true });

  await upsertTabEntry({
    ...entry,
    state: 'active',
    chromeTabId: tab.id,
    lastActiveAt: Date.now(),
  });

  // Attempt scroll position restore after the page loads
  if (entry.scrollPosition && tab.id) {
    restoreScrollPosition(tab.id, entry.scrollPosition);
  }

  await broadcastTabsUpdate();
}

/** Injects a content script to restore scroll position once the page is ready */
function restoreScrollPosition(chromeTabId: number, scrollY: number): void {
  // Poll until the tab finishes loading, then inject
  const listener = async (
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
  ) => {
    if (tabId !== chromeTabId || changeInfo.status !== 'complete') return;
    chrome.tabs.onUpdated.removeListener(listener);
    try {
      await chrome.scripting.executeScript({
        target: { tabId: chromeTabId },
        func: (y: number) => window.scrollTo(0, y),
        args: [scrollY],
      });
    } catch {
      // Best-effort — ignore if scripting blocked
    }
  };
  chrome.tabs.onUpdated.addListener(listener);
}

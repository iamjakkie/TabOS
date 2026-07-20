import type { BrowserSnapshot } from '../shared/browser';

export function normalizeRestoredSnapshot(snapshot: BrowserSnapshot): BrowserSnapshot {
  const activeTabId = snapshot.tabs.some((tab) => tab.id === snapshot.activeTabId)
    ? snapshot.activeTabId
    : snapshot.tabs.at(-1)?.id ?? null;

  return {
    activeTabId,
    path: snapshot.path.map((visit) => ({ ...visit })),
    tabs: snapshot.tabs.map((tab) => ({
      ...tab,
      runtimeState: tab.id === activeTabId ? 'hot' : 'cold',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
    })),
  };
}

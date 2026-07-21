export interface LiveRenderer {
  tabId: string;
  lastUsedAt: number;
}

// Choose which inactive live renderers to freeze to stay within budget.
// The active tab and any pinned tabs are protected and never frozen; pinned
// renderers also do not count against the budget (the user asked to keep them).
export function chooseTabsToFreeze(
  renderers: LiveRenderer[],
  activeTabId: string | null,
  maxLiveRenderers: number,
  pinnedTabIds: ReadonlySet<string> = new Set(),
): string[] {
  const freezable = renderers.filter(
    (renderer) => renderer.tabId !== activeTabId && !pinnedTabIds.has(renderer.tabId),
  );
  // Budget applies to non-pinned renderers; pinned ones are kept regardless.
  const nonPinnedCount = renderers.filter((r) => !pinnedTabIds.has(r.tabId)).length;
  const excess = Math.max(0, nonPinnedCount - maxLiveRenderers);
  return freezable
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt)
    .slice(0, excess)
    .map((renderer) => renderer.tabId);
}

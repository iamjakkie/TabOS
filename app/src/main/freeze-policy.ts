export interface LiveRenderer {
  tabId: string;
  lastUsedAt: number;
}

export function chooseTabsToFreeze(
  renderers: LiveRenderer[],
  activeTabId: string | null,
  maxLiveRenderers: number,
): string[] {
  const excess = Math.max(0, renderers.length - maxLiveRenderers);
  return renderers
    .filter((renderer) => renderer.tabId !== activeTabId)
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt)
    .slice(0, excess)
    .map((renderer) => renderer.tabId);
}

import type { BrowserTab } from '../shared/browser';

// Find tabs whose title or URL contains the query. Returns matching tab ids in
// tab-strip order. Empty/whitespace query matches nothing (find bar shows 0).
export function findMatches(tabs: BrowserTab[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return tabs
    .filter((tab) => `${tab.title} ${tab.url}`.toLowerCase().includes(q))
    .map((tab) => tab.id);
}

// Advance an index within [0, count) by direction (+1/-1), wrapping around.
// Returns -1 when there are no matches.
export function stepIndex(current: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return -1;
  return (current + direction + count) % count;
}

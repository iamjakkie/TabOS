import type { BrowserTab, RuntimeState, TabUsage } from '../shared/browser';

// Filter tabs by a whitespace-separated query, matching every term against
// title or URL (AND semantics). Empty query returns all tabs.
export function filterTabs(tabs: BrowserTab[], query: string): BrowserTab[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return tabs;
  return tabs.filter((tab) => {
    const haystack = `${tab.title} ${tab.url}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

// Map runtime state + live usage to a dot color:
//  - cold (suspended)  -> flat gray (no process, no workload)
//  - live (hot/warm)   -> green (idle) through red (busy) by CPU%
export function usageColor(state: RuntimeState, usage: TabUsage | undefined): string {
  if (state === 'cold') return '#5a6172';
  const cpu = usage?.cpu ?? 0;
  // Clamp CPU to 0..100 and map to hue 120 (green) -> 0 (red).
  const load = Math.max(0, Math.min(1, cpu / 100));
  const hue = Math.round(120 * (1 - load));
  return `hsl(${hue} 70% 48%)`;
}

export interface VirtualWindow {
  start: number;
  end: number;
  topPad: number;
  totalHeight: number;
}

// Compute which rows of a fixed-height virtual list are visible for a given
// scrollTop and viewport height, with an overscan buffer above/below.
export function visibleWindow(
  count: number,
  rowHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
): VirtualWindow {
  const first = Math.floor(scrollTop / rowHeight);
  const visible = Math.ceil(viewportHeight / rowHeight);
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, first + visible + overscan);
  return { start, end, topPad: start * rowHeight, totalHeight: count * rowHeight };
}

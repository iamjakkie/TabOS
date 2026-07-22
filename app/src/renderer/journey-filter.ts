import type { BrowserPathEvent } from '../shared/browser';

// Time ranges for the Journey view. The full history is always kept in the DB;
// these only narrow what the graph renders so it stays legible over time.
export type JourneyRange = '24h' | '7d' | '30d' | 'all';

const DAY = 24 * 60 * 60 * 1000;

export const RANGE_PRESETS: Array<{ id: JourneyRange; label: string }> = [
  { id: '24h', label: 'Last 24h' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'all', label: 'All time' },
];

export const DEFAULT_RANGE: JourneyRange = '7d';

// Timestamp cutoff for a range. 'all' returns 0 (include everything).
export function rangeStart(range: JourneyRange, now: number = Date.now()): number {
  switch (range) {
    case '24h': return now - DAY;
    case '7d': return now - 7 * DAY;
    case '30d': return now - 30 * DAY;
    case 'all': return 0;
  }
}

export function filterVisitsByRange(
  visits: BrowserPathEvent[],
  range: JourneyRange,
  now: number = Date.now(),
): BrowserPathEvent[] {
  const start = rangeStart(range, now);
  if (start <= 0) return visits;
  return visits.filter((visit) => visit.visitedAt >= start);
}

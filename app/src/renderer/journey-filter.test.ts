import { describe, expect, it } from 'vitest';
import { filterVisitsByRange, RANGE_PRESETS, rangeStart } from './journey-filter';
import type { BrowserPathEvent } from '../shared/browser';

function visit(id: string, ageMs: number, now: number): BrowserPathEvent {
  return { id, tabId: 't', url: `https://example.com/${id}`, title: id, visitedAt: now - ageMs };
}

const DAY = 24 * 60 * 60 * 1000;

describe('rangeStart', () => {
  it('returns a cutoff N days before now', () => {
    const now = 1_000 * DAY;
    expect(rangeStart('7d', now)).toBe(now - 7 * DAY);
    expect(rangeStart('24h', now)).toBe(now - DAY);
    expect(rangeStart('30d', now)).toBe(now - 30 * DAY);
  });

  it('returns 0 (no cutoff) for the all-time range', () => {
    expect(rangeStart('all', 123456)).toBe(0);
  });
});

describe('filterVisitsByRange', () => {
  const now = 1_000 * DAY;
  const visits = [
    visit('today', 1 * 60 * 60 * 1000, now),
    visit('threeDays', 3 * DAY, now),
    visit('tenDays', 10 * DAY, now),
    visit('fortyDays', 40 * DAY, now),
  ];

  it('keeps only visits within the last 7 days by default', () => {
    const result = filterVisitsByRange(visits, '7d', now).map((v) => v.id);
    expect(result).toEqual(['today', 'threeDays']);
  });

  it('keeps everything for the all-time range', () => {
    expect(filterVisitsByRange(visits, 'all', now)).toHaveLength(4);
  });

  it('widens with a 30-day range', () => {
    const result = filterVisitsByRange(visits, '30d', now).map((v) => v.id);
    expect(result).toEqual(['today', 'threeDays', 'tenDays']);
  });

  it('exposes selectable presets including a 7-day default', () => {
    expect(RANGE_PRESETS.map((p) => p.id)).toContain('7d');
  });
});

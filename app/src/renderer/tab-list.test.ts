import { describe, expect, it } from 'vitest';
import { filterTabs, usageColor, visibleWindow } from './tab-list';
import type { BrowserTab } from '../shared/browser';

function tab(partial: Partial<BrowserTab>): BrowserTab {
  return {
    id: 'x', url: 'https://example.com', title: 'Example', runtimeState: 'cold',
    isLoading: false, canGoBack: false, canGoForward: false, pinned: false, createdAt: 0, lastActiveAt: 0,
    ...partial,
  };
}

describe('filterTabs', () => {
  const tabs = [
    tab({ id: 'a', title: 'Rust Book', url: 'https://doc.rust-lang.org/book' }),
    tab({ id: 'b', title: 'YouTube', url: 'https://youtube.com/watch?v=1' }),
    tab({ id: 'c', title: 'Kalman Filter', url: 'https://en.wikipedia.org/wiki/Kalman_filter' }),
  ];

  it('returns all tabs for an empty query', () => {
    expect(filterTabs(tabs, '')).toHaveLength(3);
    expect(filterTabs(tabs, '   ')).toHaveLength(3);
  });

  it('matches title case-insensitively', () => {
    expect(filterTabs(tabs, 'rust').map((t) => t.id)).toEqual(['a']);
  });

  it('matches URL', () => {
    expect(filterTabs(tabs, 'wikipedia').map((t) => t.id)).toEqual(['c']);
  });

  it('matches across multiple terms (AND)', () => {
    expect(filterTabs(tabs, 'kalman filter').map((t) => t.id)).toEqual(['c']);
    expect(filterTabs(tabs, 'rust youtube')).toHaveLength(0);
  });
});

describe('usageColor', () => {
  it('is gray for cold tabs regardless of cpu', () => {
    expect(usageColor('cold', undefined)).toBe('#5a6172');
    expect(usageColor('cold', { tabId: 'x', cpu: 90, memoryMB: 100 })).toBe('#5a6172');
  });

  it('scales green -> red with cpu for live tabs', () => {
    const idle = usageColor('hot', { tabId: 'x', cpu: 0, memoryMB: 50 });
    const busy = usageColor('hot', { tabId: 'x', cpu: 100, memoryMB: 900 });
    expect(idle).not.toBe(busy);
    // idle should be greenish (low red channel), busy reddish (high red channel).
    expect(idle.startsWith('hsl(')).toBe(true);
    expect(idle).toContain('120'); // hue 120 = green
    expect(busy).toContain('hsl(0'); // hue 0 = red
  });

  it('treats a live tab with no metric yet as low load (green)', () => {
    expect(usageColor('warm', undefined)).toContain('120');
  });
});

describe('visibleWindow', () => {
  it('computes a windowed slice with overscan', () => {
    const w = visibleWindow(1000, 40, 0, 400, 5);
    expect(w.start).toBe(0);
    expect(w.end).toBeGreaterThanOrEqual(10);
    expect(w.topPad).toBe(0);
    expect(w.totalHeight).toBe(40000);
  });

  it('offsets the window when scrolled', () => {
    const w = visibleWindow(1000, 40, 4000, 400, 5);
    expect(w.start).toBe(100 - 5); // 4000/40 = 100, minus overscan
    expect(w.topPad).toBe((100 - 5) * 40);
  });

  it('clamps to bounds', () => {
    const w = visibleWindow(10, 40, 0, 400, 5);
    expect(w.start).toBe(0);
    expect(w.end).toBe(10);
  });
});

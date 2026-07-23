import { describe, expect, it } from 'vitest';
import { findMatches, stepIndex } from './tab-find';
import type { BrowserTab } from '../shared/browser';

function tab(id: string, title: string, url = `https://example.com/${id}`): BrowserTab {
  return {
    id, url, title, runtimeState: 'cold', isLoading: false, canGoBack: false,
    canGoForward: false, pinned: false, createdAt: 0, lastActiveAt: 0,
  };
}

const tabs = [
  tab('a', 'Rust Book'),
  tab('b', 'YouTube', 'https://youtube.com'),
  tab('c', 'Rust async', 'https://rust-lang.org'),
  tab('d', 'Kalman filter'),
];

describe('findMatches', () => {
  it('returns matching tab ids by title or URL, in order', () => {
    expect(findMatches(tabs, 'rust')).toEqual(['a', 'c']);
    expect(findMatches(tabs, 'youtube')).toEqual(['b']);
  });

  it('is case-insensitive and trims', () => {
    expect(findMatches(tabs, '  RUST ')).toEqual(['a', 'c']);
  });

  it('returns nothing for an empty query', () => {
    expect(findMatches(tabs, '')).toEqual([]);
    expect(findMatches(tabs, '   ')).toEqual([]);
  });
});

describe('stepIndex', () => {
  it('wraps forward', () => {
    expect(stepIndex(0, 3, 1)).toBe(1);
    expect(stepIndex(2, 3, 1)).toBe(0);
  });

  it('wraps backward', () => {
    expect(stepIndex(0, 3, -1)).toBe(2);
    expect(stepIndex(1, 3, -1)).toBe(0);
  });

  it('returns -1 when there are no matches', () => {
    expect(stepIndex(0, 0, 1)).toBe(-1);
  });
});

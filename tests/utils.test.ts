import { describe, it, expect } from 'vitest';
import { matchGlob, extractDomain, decayScore, logNormalize, chunk, formatRelativeTime } from '../src/shared/utils';

describe('extractDomain', () => {
  it('extracts hostname', () => {
    expect(extractDomain('https://github.com/foo/bar')).toBe('github.com');
  });
  it('returns empty string for invalid URL', () => {
    expect(extractDomain('not-a-url')).toBe('');
  });
});

describe('decayScore', () => {
  it('returns 1 for just-now activity', () => {
    expect(decayScore(Date.now(), 86_400_000)).toBeCloseTo(1, 2);
  });
  it('returns ~0.5 at half-life', () => {
    const halfLife = 86_400_000;
    expect(decayScore(Date.now() - halfLife, halfLife)).toBeCloseTo(0.5, 1);
  });
  it('approaches 0 for very old timestamps', () => {
    expect(decayScore(Date.now() - 365 * 86_400_000, 86_400_000)).toBeLessThan(0.01);
  });
});

describe('logNormalize', () => {
  it('returns 0 for 0 input', () => {
    expect(logNormalize(0)).toBe(0);
  });
  it('caps at 1', () => {
    expect(logNormalize(10000, 10)).toBe(1);
  });
});

describe('chunk', () => {
  it('splits array into chunks', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('returns empty for empty input', () => {
    expect(chunk([], 3)).toEqual([]);
  });
});

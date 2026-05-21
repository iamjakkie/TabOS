import { describe, it, expect } from 'vitest';
import { computeImportanceScore } from '../src/background/budgeter';
import type { TabEntry } from '../src/store/types';

const makeTab = (overrides: Partial<TabEntry>): TabEntry => ({
  id: 'test',
  url: 'https://example.com',
  title: 'Example',
  favicon: '',
  domain: 'example.com',
  state: 'active',
  createdAt: Date.now() - 86_400_000,
  lastActiveAt: Date.now() - 3_600_000,
  visitCount: 5,
  totalActiveMs: 600_000,
  workspaceId: 'ws1',
  confidence: 0.9,
  classifierLevel: 1,
  tags: [],
  stalenessScore: 0,
  lastScoredAt: Date.now(),
  ...overrides,
});

describe('computeImportanceScore', () => {
  it('returns value between 0 and 1', () => {
    const score = computeImportanceScore(makeTab({}), 'ws1');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('active workspace tab scores higher than inactive workspace', () => {
    const activeWs = computeImportanceScore(makeTab({ workspaceId: 'ws1' }), 'ws1');
    const inactiveWs = computeImportanceScore(makeTab({ workspaceId: 'ws2' }), 'ws1');
    expect(activeWs).toBeGreaterThan(inactiveWs);
  });

  it('recently active tab scores higher than stale tab', () => {
    const recent = computeImportanceScore(makeTab({ lastActiveAt: Date.now() - 1_000 }), null);
    const stale = computeImportanceScore(makeTab({ lastActiveAt: Date.now() - 30 * 86_400_000 }), null);
    expect(recent).toBeGreaterThan(stale);
  });
});

import { describe, expect, it } from 'vitest';
import { chooseTabsToFreeze } from './freeze-policy';

const views = [
  { tabId: 'active', lastUsedAt: 400 },
  { tabId: 'newest', lastUsedAt: 300 },
  { tabId: 'middle', lastUsedAt: 200 },
  { tabId: 'oldest', lastUsedAt: 100 },
];

describe('renderer freeze policy', () => {
  it('freezes least-recently-used inactive renderers above budget', () => {
    expect(chooseTabsToFreeze(views, 'active', 3)).toEqual(['oldest']);
  });

  it('never freezes the active renderer even when it is oldest', () => {
    const activeOldest = views.map((view) => view.tabId === 'active' ? { ...view, lastUsedAt: 0 } : view);
    expect(chooseTabsToFreeze(activeOldest, 'active', 2)).toEqual(['oldest', 'middle']);
  });

  it('returns no tabs when within budget', () => {
    expect(chooseTabsToFreeze(views.slice(0, 2), 'active', 3)).toEqual([]);
  });
});

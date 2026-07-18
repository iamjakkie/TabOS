import { describe, expect, it } from 'vitest';
import { appendPathEvent, buildPathRows, createPathEvent, resolveVisitParent, selectSettledNavigation, type PathEvent } from './navigation-path';

const first = createPathEvent({
  id: 'visit-1', tabId: 'tab-a', url: 'https://google.com/search?q=graph', title: 'Search', visitedAt: 100,
});

describe('navigation path', () => {
  it('keeps visits across different tabs in chronological order', () => {
    const second = createPathEvent({
      id: 'visit-2', tabId: 'tab-b', url: 'https://example.com/article', title: 'Article', visitedAt: 200,
      parentVisitId: 'visit-1',
    });
    expect(appendPathEvent([first], second)).toEqual([first, second]);
  });

  it('appends same-tab navigation instead of overwriting prior visits', () => {
    const next = createPathEvent({
      id: 'visit-2', tabId: 'tab-a', url: 'https://example.com', title: 'Example', visitedAt: 200,
      parentVisitId: 'visit-1',
    });
    const path = appendPathEvent([first], next);
    expect(path).toHaveLength(2);
    expect(path.map((event: PathEvent) => event.url)).toEqual([
      'https://google.com/search?q=graph', 'https://example.com',
    ]);
  });

  it('deduplicates repeated delivery of the same committed visit', () => {
    expect(appendPathEvent([first], first)).toEqual([first]);
  });

  it('collapses a redirect chain to only the settled final document', () => {
    expect(selectSettledNavigation([
      'https://google.com',
      'https://www.google.com/',
      'https://www.google.com/?client=safari',
    ])).toBe('https://www.google.com/?client=safari');
  });

  it('ignores hash-only same-document churn', () => {
    expect(selectSettledNavigation([
      'https://example.com/article',
      'https://example.com/article#section-one',
      'https://example.com/article#section-two',
    ], 'https://example.com/article')).toBeNull();
  });

  it('connects the first visit in a new tab to the visit it was opened from', () => {
    expect(resolveVisitParent({
      previousVisitInTab: undefined,
      openedFromVisit: 'visit-parent',
      activeVisit: 'visit-other',
    })).toBe('visit-parent');
  });

  it('continues within the new tab after its first linked visit', () => {
    expect(resolveVisitParent({
      previousVisitInTab: 'visit-child-1',
      openedFromVisit: 'visit-parent',
      activeVisit: 'visit-other',
    })).toBe('visit-child-1');
  });

  it('renders a new-tab visit one branch deeper than its opener', () => {
    const child = createPathEvent({
      id: 'visit-child', tabId: 'tab-b', url: 'https://example.com', title: 'Child', visitedAt: 200,
      parentVisitId: 'visit-1',
    });
    expect(buildPathRows([first, child])).toEqual([
      { event: first, depth: 0 },
      { event: child, depth: 1 },
    ]);
  });
});

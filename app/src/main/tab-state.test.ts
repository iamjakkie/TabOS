import { describe, expect, it } from 'vitest';
import { createTab, normalizeNavigationInput, reduceTabState } from './tab-state';

describe('normalizeNavigationInput', () => {
  it('keeps explicit http and https URLs', () => {
    expect(normalizeNavigationInput('https://example.com/path')).toBe('https://example.com/path');
    expect(normalizeNavigationInput('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('adds https to domain-like input', () => {
    expect(normalizeNavigationInput('example.com/docs')).toBe('https://example.com/docs');
  });

  it('uses a search URL for non-domain text', () => {
    expect(normalizeNavigationInput('local first knowledge graph')).toBe(
      'https://www.google.com/search?q=local+first+knowledge+graph',
    );
  });
});

describe('tab state', () => {
  it('creates an active tab with a stable logical identity', () => {
    const tab = createTab('https://example.com', 'tab-1', 100);
    expect(tab).toMatchObject({
      id: 'tab-1',
      url: 'https://example.com',
      title: 'New tab',
      runtimeState: 'hot',
      createdAt: 100,
      lastActiveAt: 100,
    });
  });

  it('activates one tab and marks the previous tab warm', () => {
    const first = createTab('https://one.example', 'one', 100);
    const second = { ...createTab('https://two.example', 'two', 200), runtimeState: 'cold' as const };
    const result = reduceTabState([first, second], { type: 'activate', tabId: 'two', now: 300 });

    expect(result.find((tab) => tab.id === 'one')?.runtimeState).toBe('warm');
    expect(result.find((tab) => tab.id === 'two')).toMatchObject({ runtimeState: 'hot', lastActiveAt: 300 });
  });

  it('updates navigation metadata without changing identity', () => {
    const tab = createTab('https://old.example', 'one', 100);
    const result = reduceTabState([tab], {
      type: 'navigated',
      tabId: 'one',
      url: 'https://new.example',
      title: 'New page',
    });

    expect(result[0]).toMatchObject({ id: 'one', url: 'https://new.example', title: 'New page' });
  });
});

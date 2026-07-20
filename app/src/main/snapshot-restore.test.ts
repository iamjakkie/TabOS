import { describe, expect, it } from 'vitest';
import { normalizeRestoredSnapshot } from './snapshot-restore';
import type { BrowserSnapshot } from '../shared/browser';

const stored: BrowserSnapshot = {
  activeTabId: 'b',
  tabs: [
    { id: 'a', url: 'https://a.example', title: 'A', runtimeState: 'warm', isLoading: true, canGoBack: true, canGoForward: true, createdAt: 1, lastActiveAt: 3 },
    { id: 'b', url: 'https://b.example', title: 'B', runtimeState: 'cold', isLoading: false, canGoBack: true, canGoForward: false, createdAt: 2, lastActiveAt: 4 },
  ],
  path: [
    { id: 'v1', tabId: 'a', url: 'https://a.example', title: 'A', visitedAt: 3 },
    { id: 'v2', tabId: 'b', url: 'https://b.example', title: 'B', visitedAt: 4, parentVisitId: 'v1' },
  ],
};

describe('normalizeRestoredSnapshot', () => {
  it('restores only the active tab hot and resets ephemeral navigation state', () => {
    const restored = normalizeRestoredSnapshot(stored);
    expect(restored.tabs[0]).toMatchObject({ id: 'a', runtimeState: 'cold', isLoading: false, canGoBack: false, canGoForward: false });
    expect(restored.tabs[1]).toMatchObject({ id: 'b', runtimeState: 'hot', isLoading: false, canGoBack: false, canGoForward: false });
    expect(restored.path).toEqual(stored.path);
  });
});

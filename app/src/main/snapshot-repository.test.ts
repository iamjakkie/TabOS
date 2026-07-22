import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SnapshotRepository } from './snapshot-repository';
import type { BrowserSnapshot } from '../shared/browser';

const paths: string[] = [];
const now = Date.now();
const snapshot: BrowserSnapshot = {
  activeTabId: 'tab-b',
  tabs: [
    { id: 'tab-a', url: 'https://one.example', title: 'One', runtimeState: 'cold', isLoading: false, canGoBack: false, canGoForward: false, pinned: false, createdAt: 1, lastActiveAt: 10 },
    { id: 'tab-b', url: 'https://two.example', title: 'Two', runtimeState: 'hot', isLoading: false, canGoBack: true, canGoForward: false, pinned: true, createdAt: 2, lastActiveAt: 20 },
  ],
  path: [
    { id: 'visit-a', tabId: 'tab-a', url: 'https://one.example', title: 'One', visitedAt: now - 2000 },
    { id: 'visit-b', tabId: 'tab-b', url: 'https://two.example', title: 'Two', visitedAt: now - 1000, parentVisitId: 'visit-a' },
  ],
};

afterEach(() => {
  for (const filename of paths.splice(0)) fs.rmSync(filename, { force: true });
});

describe('SnapshotRepository', () => {
  it('round-trips tabs, active tab, order and path through a SQLite file', async () => {
    const filename = path.join(os.tmpdir(), `tabos-${crypto.randomUUID()}.db`);
    paths.push(filename);
    const repository = await SnapshotRepository.open(filename);
    repository.save(snapshot);
    repository.close();

    const reopened = await SnapshotRepository.open(filename);
    expect(reopened.load()).toEqual(snapshot);
    reopened.close();
  });

  it('returns null for a fresh database', async () => {
    const filename = path.join(os.tmpdir(), `tabos-${crypto.randomUUID()}.db`);
    paths.push(filename);
    const repository = await SnapshotRepository.open(filename);
    expect(repository.load()).toBeNull();
    repository.close();
  });

  it('accumulates navigation history across saves instead of overwriting it', async () => {
    const filename = path.join(os.tmpdir(), `tabos-${crypto.randomUUID()}.db`);
    paths.push(filename);
    const repository = await SnapshotRepository.open(filename);

    repository.save({
      activeTabId: 'tab-a',
      tabs: [{ id: 'tab-a', url: 'https://one.example', title: 'One', runtimeState: 'hot', isLoading: false, canGoBack: false, canGoForward: false, pinned: false, createdAt: 1, lastActiveAt: now - 3000 }],
      path: [{ id: 'v1', tabId: 'tab-a', url: 'https://one.example', title: 'One', visitedAt: now - 3000 }],
    });

    // A later save with only the newest visit in memory must not erase v1.
    repository.save({
      activeTabId: 'tab-a',
      tabs: [{ id: 'tab-a', url: 'https://two.example', title: 'Two', runtimeState: 'hot', isLoading: false, canGoBack: false, canGoForward: false, pinned: false, createdAt: 1, lastActiveAt: now - 1000 }],
      path: [{ id: 'v2', tabId: 'tab-a', url: 'https://two.example', title: 'Two', visitedAt: now - 1000 }],
    });

    const loaded = repository.load();
    expect(loaded?.path.map((visit) => visit.id).sort()).toEqual(['v1', 'v2']);
    repository.close();
  });

  it('prunes navigation history older than the retention cutoff', async () => {
    const filename = path.join(os.tmpdir(), `tabos-${crypto.randomUUID()}.db`);
    paths.push(filename);
    const repository = await SnapshotRepository.open(filename);
    const oldVisitedAt = now - 40 * 24 * 60 * 60 * 1000; // 40 days ago

    repository.save({
      activeTabId: 'tab-a',
      tabs: [{ id: 'tab-a', url: 'https://recent.example', title: 'Recent', runtimeState: 'hot', isLoading: false, canGoBack: false, canGoForward: false, pinned: false, createdAt: 1, lastActiveAt: now }],
      path: [
        { id: 'stale', tabId: 'tab-a', url: 'https://stale.example', title: 'Stale', visitedAt: oldVisitedAt },
        { id: 'fresh', tabId: 'tab-a', url: 'https://recent.example', title: 'Recent', visitedAt: now - 1000 },
      ],
    });

    const loaded = repository.load();
    expect(loaded?.path.map((visit) => visit.id)).toEqual(['fresh']);
    repository.close();
  });
});

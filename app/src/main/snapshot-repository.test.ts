import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SnapshotRepository } from './snapshot-repository';
import type { BrowserSnapshot } from '../shared/browser';

const paths: string[] = [];
const snapshot: BrowserSnapshot = {
  activeTabId: 'tab-b',
  tabs: [
    { id: 'tab-a', url: 'https://one.example', title: 'One', runtimeState: 'cold', isLoading: false, canGoBack: false, canGoForward: false, createdAt: 1, lastActiveAt: 10 },
    { id: 'tab-b', url: 'https://two.example', title: 'Two', runtimeState: 'hot', isLoading: false, canGoBack: true, canGoForward: false, createdAt: 2, lastActiveAt: 20 },
  ],
  path: [
    { id: 'visit-a', tabId: 'tab-a', url: 'https://one.example', title: 'One', visitedAt: 10 },
    { id: 'visit-b', tabId: 'tab-b', url: 'https://two.example', title: 'Two', visitedAt: 20, parentVisitId: 'visit-a' },
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
});

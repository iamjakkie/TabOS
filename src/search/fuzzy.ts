import Fuse, { type IFuseOptions } from 'fuse.js';
import type { TabEntry } from '../store/types';

export interface SearchResult {
  entry: TabEntry;
  score: number;
}

const FUSE_OPTIONS: IFuseOptions<TabEntry> = {
  keys: [
    { name: 'title', weight: 0.5 },
    { name: 'url', weight: 0.3 },
    { name: 'domain', weight: 0.1 },
    { name: 'tags', weight: 0.1 },
  ],
  threshold: 0.4,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

let fuse: Fuse<TabEntry> | null = null;
let indexedCount = 0;

export function buildIndex(entries: TabEntry[]): void {
  fuse = new Fuse(entries, FUSE_OPTIONS);
  indexedCount = entries.length;
}

export function updateIndex(entries: TabEntry[]): void {
  if (!fuse || Math.abs(entries.length - indexedCount) > 50) {
    buildIndex(entries);
    return;
  }
  // Incremental update for small changes
  fuse.setCollection(entries);
  indexedCount = entries.length;
}

export function search(query: string, limit: number = 20): SearchResult[] {
  if (!fuse || !query.trim()) return [];

  const results = fuse.search(query, { limit });
  return results.map((r) => ({
    entry: r.item,
    score: 1 - (r.score ?? 0),
  }));
}

export function isIndexReady(): boolean {
  return fuse !== null;
}

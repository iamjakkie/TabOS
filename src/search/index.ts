import { getAllTabs } from '../store/db';
import { buildIndex, updateIndex } from './fuzzy';

let initialized = false;

/** Load all tabs from DB and build the initial search index */
export async function initSearchIndex(): Promise<void> {
  const entries = await getAllTabs();
  buildIndex(entries);
  initialized = true;
}

/** Rebuild index after a batch of tab changes */
export async function refreshSearchIndex(): Promise<void> {
  const entries = await getAllTabs();
  updateIndex(entries);
}

export function isSearchReady(): boolean {
  return initialized;
}

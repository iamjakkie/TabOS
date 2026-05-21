import pako from 'pako';
import {
  getAllTabs,
  getAllWorkspaces,
  upsertTabEntries,
  upsertWorkspace,
  clearAllTabEntries,
  clearAllWorkspaces,
  saveUserPrefs,
} from '../store/db';
import { validateArchive, ArchiveValidationError } from './format';
import { migrateArchive } from './migrate';
import { detectConflicts } from './differ';
import { loadCorpora, saveCorpora, updateCorpus } from '../classifier/tfidf';
import { chunk } from '../shared/utils';
import { IMPORT_BATCH_SIZE } from '../shared/constants';
import type { TabEntry, Workspace } from '../store/types';
import { generateId } from '../shared/utils';

export interface ImportOptions {
  archiveJson: string;
  strategy: 'clean' | 'merge' | 'workspace';
  workspaceIds?: string[];
}

export type ImportProgressCallback = (processed: number, total: number) => void;

export async function runImport(
  options: ImportOptions,
  onProgress?: ImportProgressCallback,
): Promise<{ tabsImported: number; conflicts: number }> {
  // Parse + validate
  let parsed: unknown;
  try {
    parsed = JSON.parse(options.archiveJson);
  } catch {
    throw new ArchiveValidationError('Archive is not valid JSON');
  }

  validateArchive(parsed);
  const archive = migrateArchive(parsed);

  const incomingTabs = archive.tabEntries ?? [];
  const incomingWorkspaces = archive.workspaces ?? [];

  // Filter to selected workspaces for workspace-selective import
  let tabsToImport = incomingTabs;
  let workspacesToImport = incomingWorkspaces;
  if (options.strategy === 'workspace' && options.workspaceIds?.length) {
    const ids = new Set(options.workspaceIds);
    tabsToImport = incomingTabs.filter((t) => ids.has(t.workspaceId));
    workspacesToImport = incomingWorkspaces.filter((w) => ids.has(w.id));
  }

  let tabsImported = 0;
  let conflictCount = 0;

  if (options.strategy === 'clean') {
    await clearAllTabEntries();
    await clearAllWorkspaces();

    // Remap IDs to avoid collisions, force all state to virtualized
    const remapped = tabsToImport.map((t) => ({
      ...t,
      state: 'virtualized' as const,
      chromeTabId: undefined,
    }));

    const batches = chunk(remapped, IMPORT_BATCH_SIZE);
    for (let i = 0; i < batches.length; i++) {
      await upsertTabEntries(batches[i]!);
      tabsImported += batches[i]!.length;
      onProgress?.(tabsImported, remapped.length);
    }

    for (const ws of workspacesToImport) {
      await upsertWorkspace(ws);
    }

    if (archive.userPrefs) {
      await saveUserPrefs(archive.userPrefs);
    }
  } else {
    // Merge or workspace-selective — non-destructive
    const [localTabs, localWorkspaces] = await Promise.all([getAllTabs(), getAllWorkspaces()]);
    const localByUrl = new Map(localTabs.map((t) => [t.url, t]));

    const { merged, conflicts } = detectConflicts(localByUrl, tabsToImport);
    conflictCount = conflicts.length;

    const batches = chunk(merged, IMPORT_BATCH_SIZE);
    for (let i = 0; i < batches.length; i++) {
      await upsertTabEntries(batches[i]!);
      tabsImported += batches[i]!.length;
      onProgress?.(tabsImported, merged.length);
    }

    // Merge workspace definitions
    const localWsMap = new Map(localWorkspaces.map((w) => [w.name, w]));
    for (const incoming of workspacesToImport) {
      const existing = localWsMap.get(incoming.name);
      if (existing) {
        // Merge domain/keyword patterns
        await upsertWorkspace({
          ...existing,
          domainPatterns: [...new Set([...existing.domainPatterns, ...incoming.domainPatterns])],
          keywordPatterns: [...new Set([...existing.keywordPatterns, ...incoming.keywordPatterns])],
        });
      } else {
        await upsertWorkspace({ ...incoming, id: generateId() });
      }
    }
  }

  // Merge classifier corpora
  if (archive.classifierState?.tfidfCorpora) {
    const local = await loadCorpora();
    const merged = { ...local };
    for (const [wsId, terms] of Object.entries(archive.classifierState.tfidfCorpora)) {
      merged[wsId] = { ...(merged[wsId] ?? {}), ...terms };
    }
    await saveCorpora(merged);
  }

  return { tabsImported, conflicts: conflictCount };
}

/** Parse a gzipped .tabos file (ArrayBuffer) → JSON string */
export function decompressArchive(buffer: ArrayBuffer): string {
  const uint8 = new Uint8Array(buffer);
  const decompressed = pako.ungzip(uint8, { to: 'string' });
  return decompressed;
}

/** Parse plain text (OneTab / URL list) into virtual TabEntries */
export function parseURLList(text: string): TabEntry[] {
  const now = Date.now();
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('http'))
    .map((line) => {
      const [url, ...titleParts] = line.split(' | ');
      const safeUrl = url ?? '';
      let domain = '';
      try { domain = new URL(safeUrl).hostname; } catch { /* ignore */ }
      return {
        id: generateId(),
        url: safeUrl,
        title: titleParts.join(' | ') || safeUrl,
        favicon: '',
        domain,
        state: 'virtualized' as const,
        createdAt: now,
        lastActiveAt: now,
        visitCount: 0,
        totalActiveMs: 0,
        workspaceId: '__unassigned__',
        confidence: 0,
        classifierLevel: 1 as const,
        tags: [],
        stalenessScore: 0,
        lastScoredAt: now,
      } satisfies TabEntry;
    });
}

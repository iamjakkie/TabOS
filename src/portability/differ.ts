import type { TabEntry } from '../store/types';

export interface MergeConflict {
  url: string;
  local: TabEntry;
  incoming: TabEntry;
  conflictFields: string[];
}

export interface MergedEntry {
  entry: TabEntry;
  hadConflict: boolean;
}

/**
 * Merge two TabEntry records for the same URL.
 * Auto-resolves most fields; returns conflict info for workspace mismatches.
 */
export function mergeEntries(local: TabEntry, incoming: TabEntry): MergedEntry {
  const conflictFields: string[] = [];

  if (local.workspaceId !== incoming.workspaceId) {
    conflictFields.push('workspaceId');
  }

  // Auto-resolution strategy
  const merged: TabEntry = {
    ...local,

    // Always take the most recent activity data
    lastActiveAt: Math.max(local.lastActiveAt, incoming.lastActiveAt),

    // Sum counters from both machines
    visitCount: local.visitCount + incoming.visitCount,
    totalActiveMs: local.totalActiveMs + incoming.totalActiveMs,

    // Union tag sets
    tags: [...new Set([...local.tags, ...incoming.tags])],

    // For workspace conflict: keep local (user's own machine wins by default)
    workspaceId: local.workspaceId,

    // Snooze: keep the incoming if it has a later wake time
    snoozeUntil:
      incoming.snoozeUntil && (!local.snoozeUntil || incoming.snoozeUntil > local.snoozeUntil)
        ? incoming.snoozeUntil
        : local.snoozeUntil,

    // Staleness score will be recomputed after import
    stalenessScore: 0,
    lastScoredAt: Date.now(),

    // Always start as virtualized on the target machine
    state: 'virtualized',
    chromeTabId: undefined,
  };

  return { entry: merged, hadConflict: conflictFields.length > 0 };
}

/** Detect all conflicts in a merge operation, returns auto-merged entries + conflict list */
export function detectConflicts(
  localMap: Map<string, TabEntry>,
  incoming: TabEntry[],
): { merged: TabEntry[]; conflicts: MergeConflict[] } {
  const merged: TabEntry[] = [];
  const conflicts: MergeConflict[] = [];

  for (const incomingEntry of incoming) {
    const local = localMap.get(incomingEntry.url);

    if (!local) {
      // New entry — add as virtualized
      merged.push({ ...incomingEntry, state: 'virtualized', chromeTabId: undefined });
      continue;
    }

    const { entry, hadConflict } = mergeEntries(local, incomingEntry);
    merged.push(entry);

    if (hadConflict) {
      conflicts.push({
        url: incomingEntry.url,
        local,
        incoming: incomingEntry,
        conflictFields: ['workspaceId'],
      });
    }
  }

  return { merged, conflicts };
}

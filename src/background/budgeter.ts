import { getActiveTabs, getUserPrefs, getActiveWorkspace, upsertTabEntries } from '../store/db';
import { virtualizeTab } from './virtualizer';
import { getCurrentFocusedTabId } from './tracker';
import { SCORE_WEIGHTS, WORKSPACE_PRIORITY_ACTIVE, WORKSPACE_PRIORITY_INACTIVE } from '../shared/constants';
import { decayScore, logNormalize, clamp } from '../shared/utils';
import type { TabEntry } from '../store/types';

const RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FREQUENCY_SCALE = 50;
const ACTIVE_TIME_SCALE_MS = 3_600_000; // 1 hour

// Grace period after install/sync — budget enforcement is skipped for tabs
// created within this window, preventing mass-close on first run.
const SYNC_GRACE_PERIOD_MS = 10 * 60 * 1000; // 10 minutes

export async function runBudgetCheck(): Promise<void> {
  const prefs = await getUserPrefs();
  const activeTabs = await getActiveTabs();

  if (activeTabs.length <= prefs.maxActiveTabs) return;

  const focusedChromeId = getCurrentFocusedTabId();
  const ws = await getActiveWorkspace();
  const activeWorkspaceId = ws?.id ?? null;
  const now = Date.now();

  const excess = activeTabs.length - prefs.maxActiveTabs;
  const candidates = activeTabs
    .filter((t) => t.chromeTabId !== focusedChromeId)
    // Never auto-close tabs that were just synced in — they haven't been
    // reviewed by the user yet and may be from an initial session import.
    .filter((t) => now - t.createdAt > SYNC_GRACE_PERIOD_MS)
    .map((t) => ({ entry: t, score: computeImportanceScore(t, activeWorkspaceId) }))
    .sort((a, b) => a.score - b.score);

  const toVirtualize = candidates.slice(0, excess).map((c) => c.entry);
  for (const entry of toVirtualize) {
    await virtualizeTab(entry);
  }
}

export function computeImportanceScore(entry: TabEntry, activeWorkspaceId: string | null): number {
  const recency = decayScore(entry.lastActiveAt, RECENCY_HALF_LIFE_MS);
  const frequency = logNormalize(entry.visitCount, FREQUENCY_SCALE);
  const activeTime = logNormalize(entry.totalActiveMs / ACTIVE_TIME_SCALE_MS, 10);
  const workspacePriority =
    entry.workspaceId === activeWorkspaceId
      ? WORKSPACE_PRIORITY_ACTIVE
      : WORKSPACE_PRIORITY_INACTIVE;

  return clamp(
    SCORE_WEIGHTS.recency * recency +
    SCORE_WEIGHTS.frequency * frequency +
    SCORE_WEIGHTS.activeTime * activeTime +
    SCORE_WEIGHTS.workspacePriority * workspacePriority,
    0, 1,
  );
}

export async function refreshStalenessScores(): Promise<void> {
  const allActive = await getActiveTabs();
  const now = Date.now();
  const ws = await getActiveWorkspace();
  const activeWorkspaceId = ws?.id ?? null;

  const updated = allActive.map((entry) => ({
    ...entry,
    stalenessScore: 1 - computeImportanceScore(entry, activeWorkspaceId),
    lastScoredAt: now,
  }));

  await upsertTabEntries(updated);
}

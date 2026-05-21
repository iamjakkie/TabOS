import { getActiveTabs, getWorkspace, getUserPrefs } from '../store/db';
import { virtualizeTab } from './virtualizer';
import { getCurrentFocusedTabId } from './tracker';
import { SCORE_WEIGHTS, WORKSPACE_PRIORITY_ACTIVE, WORKSPACE_PRIORITY_INACTIVE } from '../shared/constants';
import { decayScore, logNormalize, clamp } from '../shared/utils';
import type { TabEntry } from '../store/types';

const RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FREQUENCY_SCALE = 50;
const ACTIVE_TIME_SCALE_MS = 3_600_000; // 1 hour

export async function runBudgetCheck(): Promise<void> {
  const prefs = await getUserPrefs();
  const activeTabs = await getActiveTabs();

  if (activeTabs.length <= prefs.maxActiveTabs) return;

  const focusedChromeId = getCurrentFocusedTabId();
  const activeWorkspace = await getActiveWorkspaceId();

  const excess = activeTabs.length - prefs.maxActiveTabs;
  const candidates = activeTabs
    .filter((t) => t.chromeTabId !== focusedChromeId)
    .map((t) => ({ entry: t, score: computeImportanceScore(t, activeWorkspace) }))
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

  const score =
    SCORE_WEIGHTS.recency * recency +
    SCORE_WEIGHTS.frequency * frequency +
    SCORE_WEIGHTS.activeTime * activeTime +
    SCORE_WEIGHTS.workspacePriority * workspacePriority;
  // pinnedBonus is handled by filtering pinned tabs out of candidates (Chrome API)

  return clamp(score, 0, 1);
}

export async function refreshStalenessScores(): Promise<void> {
  const { getActiveTabs: _a, getTabsByState, upsertTabEntries } = await import('../store/db');
  const { getTabsByState: getTabs } = await import('../store/db');
  const allActive = await getActiveTabs();
  const now = Date.now();
  const activeWorkspaceId = await getActiveWorkspaceId();

  const updated = allActive.map((entry) => ({
    ...entry,
    stalenessScore: 1 - computeImportanceScore(entry, activeWorkspaceId),
    lastScoredAt: now,
  }));

  const { upsertTabEntries: bulkUpdate } = await import('../store/db');
  await bulkUpdate(updated);
}

async function getActiveWorkspaceId(): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { getActiveWorkspace } = await import('../store/db');
  const ws = await getActiveWorkspace();
  return ws?.id ?? null;
}

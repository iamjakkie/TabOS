import { getAllTabs, getUserPrefs } from '../store/db';
import { MS_PER_DAY } from '../shared/constants';

export interface DigestEntry {
  tabId: string;
  title: string;
  url: string;
  favicon: string;
  daysSinceActive: number;
  stalenessScore: number;
  workspaceId: string;
}

export interface DigestReport {
  generatedAt: number;
  totalActive: number;
  totalVirtualized: number;
  totalArchived: number;
  staleTabs: DigestEntry[];
  suggestArchive: DigestEntry[];
}

export async function generateDigest(): Promise<DigestReport> {
  const tabs = await getAllTabs();
  const now = Date.now();

  const active = tabs.filter((t) => t.state === 'active');
  const virtualized = tabs.filter((t) => t.state === 'virtualized');
  const archived = tabs.filter((t) => t.state === 'archived');

  const staleThresholdDays = 14;
  const staleTabs: DigestEntry[] = virtualized
    .filter((t) => (now - t.lastActiveAt) / MS_PER_DAY >= staleThresholdDays)
    .sort((a, b) => a.lastActiveAt - b.lastActiveAt)
    .slice(0, 20)
    .map((t) => ({
      tabId: t.id,
      title: t.title,
      url: t.url,
      favicon: t.favicon,
      daysSinceActive: Math.floor((now - t.lastActiveAt) / MS_PER_DAY),
      stalenessScore: t.stalenessScore,
      workspaceId: t.workspaceId,
    }));

  const suggestArchive: DigestEntry[] = virtualized
    .filter((t) => t.stalenessScore > 0.8)
    .sort((a, b) => b.stalenessScore - a.stalenessScore)
    .slice(0, 10)
    .map((t) => ({
      tabId: t.id,
      title: t.title,
      url: t.url,
      favicon: t.favicon,
      daysSinceActive: Math.floor((now - t.lastActiveAt) / MS_PER_DAY),
      stalenessScore: t.stalenessScore,
      workspaceId: t.workspaceId,
    }));

  return {
    generatedAt: now,
    totalActive: active.length,
    totalVirtualized: virtualized.length,
    totalArchived: archived.length,
    staleTabs,
    suggestArchive,
  };
}

import pako from 'pako';
import {
  getAllTabs,
  getAllWorkspaces,
  getUserPrefs,
} from '../store/db';
import { loadCorpora } from '../classifier/tfidf';
import type { TabEntry } from '../store/types';
import type { TabOSArchive, ExportOptions } from './format';
import { CURRENT_FORMAT_VERSION } from './format';

export async function runExport(options: ExportOptions): Promise<void> {
  const [allTabs, workspaces, prefs, corpora] = await Promise.all([
    getAllTabs(),
    getAllWorkspaces(),
    getUserPrefs(),
    (options.includeClassifierState ?? true) ? loadCorpora() : Promise.resolve({}),
  ]);

  let tabs: TabEntry[] = allTabs;

  if (options.scope === 'selective' && options.workspaceIds?.length) {
    const ids = new Set(options.workspaceIds);
    tabs = tabs.filter((t) => ids.has(t.workspaceId));
  }

  if (!options.includeArchived) {
    tabs = tabs.filter((t) => t.state !== 'archived');
  }

  // Strip Chrome-specific and optionally heavy fields
  const exportedTabs: TabEntry[] = tabs.map((t) => {
    const { chromeTabId: _cid, embedding: _emb, ...rest } = t;
    if (options.includeEmbeddings && t.embedding) {
      return { ...rest, embedding: t.embedding };
    }
    return rest as TabEntry;
  });

  const exportedWorkspaces =
    options.scope === 'selective' && options.workspaceIds?.length
      ? workspaces.filter((w) => options.workspaceIds!.includes(w.id))
      : workspaces;

  const byState = exportedTabs.reduce(
    (acc, t) => ({ ...acc, [t.state]: (acc[t.state] ?? 0) + 1 }),
    {} as Record<TabEntry['state'], number>,
  );
  const byWorkspace = exportedTabs.reduce(
    (acc, t) => ({ ...acc, [t.workspaceId]: (acc[t.workspaceId] ?? 0) + 1 }),
    {} as Record<string, number>,
  );

  const archive: TabOSArchive = {
    version: CURRENT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    exportSource: {
      hostname: await getHostname(),
      os: detectOS(),
      chromeVersion: getChromeVersion(),
      tabosVersion: chrome.runtime.getManifest().version,
    },
    tabEntries: exportedTabs,
    workspaces: exportedWorkspaces,
    userPrefs: options.includeClassifierState ? prefs : null,
    classifierState: (options.includeClassifierState ?? true) ? { tfidfCorpora: corpora } : null,
    stats: {
      totalTabs: exportedTabs.length,
      byState,
      byWorkspace,
      archiveSizeBytes: 0, // will be filled below
    },
  };

  const json = JSON.stringify(archive);
  const compressed = pako.gzip(json);
  archive.stats.archiveSizeBytes = compressed.length;

  // Re-compress with correct size
  const finalJson = JSON.stringify(archive);
  const finalCompressed = pako.gzip(finalJson);

  const blob = new Blob([finalCompressed], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const date = new Date().toISOString().split('T')[0];
  const hostname = await getHostname();
  const filename = `tabos-backup-${hostname}-${date}.tabos`;

  chrome.downloads.download({
    url,
    filename,
    saveAs: !options.outputPath,
  });
}

async function getHostname(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get('hostname', (result) => {
      resolve((result['hostname'] as string) ?? 'unknown');
    });
  });
}

function detectOS(): TabOSArchive['exportSource']['os'] {
  const ua = navigator.userAgent;
  if (ua.includes('Mac')) return 'macos';
  if (ua.includes('Linux')) return 'linux';
  if (ua.includes('Win')) return 'windows';
  return 'unknown';
}

function getChromeVersion(): string {
  const match = navigator.userAgent.match(/Chrome\/([\d.]+)/);
  return match?.[1] ?? 'unknown';
}

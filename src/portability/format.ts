import type { TabEntry, Workspace, UserPrefs } from '../store/types';

export const CURRENT_FORMAT_VERSION = 1;

export interface TabOSArchive {
  version: 1;
  exportedAt: string;
  exportSource: {
    hostname: string;
    os: 'macos' | 'linux' | 'windows' | 'unknown';
    chromeVersion: string;
    tabosVersion: string;
  };
  tabEntries: TabEntry[] | null;
  workspaces: Workspace[] | null;
  userPrefs: UserPrefs | null;
  classifierState: {
    tfidfCorpora: Record<string, Record<string, number>>;
  } | null;
  stats: {
    totalTabs: number;
    byState: Record<TabEntry['state'], number>;
    byWorkspace: Record<string, number>;
    archiveSizeBytes: number;
  };
}

export interface ExportOptions {
  scope: 'full' | 'selective';
  workspaceIds?: string[];
  includeArchived: boolean;
  includeEmbeddings: boolean;
  includeClassifierState?: boolean;
  outputPath?: string;
}

export class ArchiveValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveValidationError';
  }
}

export function validateArchive(raw: unknown): asserts raw is TabOSArchive {
  if (typeof raw !== 'object' || raw === null) {
    throw new ArchiveValidationError('Archive is not a valid object');
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj['version'] !== 'number') {
    throw new ArchiveValidationError('Archive is missing the version field');
  }
  if (obj['version'] > CURRENT_FORMAT_VERSION) {
    throw new ArchiveValidationError(
      `This archive was created by a newer version of TabOS (format v${obj['version']}). Please update TabOS.`,
    );
  }
  if (!obj['exportedAt'] || !obj['exportSource']) {
    throw new ArchiveValidationError('Archive is missing required metadata fields');
  }
}

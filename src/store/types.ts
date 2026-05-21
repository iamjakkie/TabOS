export type TabState = 'active' | 'virtualized' | 'snoozed' | 'archived';

export interface TabEntry {
  id: string;
  chromeTabId?: number;
  url: string;
  title: string;
  favicon: string;
  domain: string;

  // Lifecycle
  state: TabState;
  createdAt: number;
  lastActiveAt: number;
  visitCount: number;
  totalActiveMs: number;

  // Classification
  workspaceId: string;
  confidence: number;
  classifierLevel: 1 | 2 | 3;
  tags: string[];
  embedding?: number[];

  // Snooze
  snoozeUntil?: number;
  snoozeRule?: SnoozeRule;

  // Scoring
  stalenessScore: number;
  lastScoredAt: number;

  // State preservation
  scrollPosition?: number;
  formData?: Record<string, string>;
}

export interface SnoozeRule {
  type: 'duration' | 'conditional';
  durationMs?: number;
  condition?: {
    metric: 'consecutive_absent_days' | 'total_absent_days';
    threshold: number;
    action: 'archive' | 'delete' | 'notify';
  };
}

export interface Workspace {
  id: string;
  name: string;
  color: string;
  icon?: string;
  domainPatterns: string[];
  keywordPatterns: string[];
  isActive: boolean;
  tabLimit?: number;
  decayDays: number;
  createdAt: number;
  sortOrder: number;
}

export interface UserPrefs {
  maxActiveTabs: number;
  maxMemoryMB: number;
  defaultDecayDays: number;
  digestFrequency: 'daily' | 'weekly' | 'manual';
  digestTime: string;
  enableL3Classifier: boolean;
  enablePrefetch: boolean;
  autoExportEnabled: boolean;
  autoExportFrequency: 'daily' | 'weekly';
  autoExportPath?: string;
  theme: 'system' | 'light' | 'dark';
}

export const DEFAULT_USER_PREFS: UserPrefs = {
  maxActiveTabs: 50,
  maxMemoryMB: 2048,
  defaultDecayDays: 7,
  digestFrequency: 'weekly',
  digestTime: '09:00',
  enableL3Classifier: false,
  enablePrefetch: false,
  autoExportEnabled: false,
  autoExportFrequency: 'weekly',
  theme: 'system',
};

export const UNASSIGNED_WORKSPACE_ID = '__unassigned__';

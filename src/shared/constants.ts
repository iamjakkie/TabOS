// Alarm names — must match exactly between registration and handler
export const ALARM_BUDGET_CHECK = 'budget-check';
export const ALARM_EXPIRY_SWEEP = 'expiry-sweep';
export const ALARM_SCORE_REFRESH = 'score-refresh';
export const ALARM_DIGEST = 'digest';
export const ALARM_SNOOZE_PREFIX = 'snooze:';

// Timing (milliseconds unless noted)
export const BUDGET_CHECK_PERIOD_MINUTES = 1;
export const EXPIRY_SWEEP_PERIOD_MINUTES = 360; // 6 hours
export const SCORE_REFRESH_PERIOD_MINUTES = 60;

export const MS_PER_DAY = 86_400_000;
export const MS_PER_HOUR = 3_600_000;

// Classifier thresholds
export const L1_CONFIDENCE_EXACT = 0.95;
export const L1_CONFIDENCE_PREFIX = 0.80;
export const L2_CONFIDENCE_THRESHOLD = 0.60;
export const L3_CLASSIFICATION_QUEUE_INTERVAL_MS = 30_000;

// Budgeter importance score weights
export const SCORE_WEIGHTS = {
  recency: 0.40,
  frequency: 0.20,
  activeTime: 0.20,
  workspacePriority: 0.15,
  pinnedBonus: 0.05,
} as const;

export const WORKSPACE_PRIORITY_ACTIVE = 1.0;
export const WORKSPACE_PRIORITY_INACTIVE = 0.5;

// Chrome tab group colors for workspace assignment
export const WORKSPACE_COLORS: chrome.tabGroups.ColorEnum[] = [
  'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange',
];

// Import batching
export const IMPORT_BATCH_SIZE = 500;

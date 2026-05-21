import {
  getSnoozedTabsDue,
  getTabsByState,
  upsertTabEntry,
  getAllTabs,
  getUserPrefs,
} from '../store/db';
import { restoreTab } from './virtualizer';
import { runBudgetCheck, refreshStalenessScores } from './budgeter';
import {
  ALARM_BUDGET_CHECK,
  ALARM_EXPIRY_SWEEP,
  ALARM_SCORE_REFRESH,
  ALARM_SNOOZE_PREFIX,
  BUDGET_CHECK_PERIOD_MINUTES,
  EXPIRY_SWEEP_PERIOD_MINUTES,
  SCORE_REFRESH_PERIOD_MINUTES,
  MS_PER_DAY,
} from '../shared/constants';
import type { TabEntry } from '../store/types';

export function initScheduler(): void {
  chrome.alarms.onAlarm.addListener(handleAlarm);
  registerPeriodicAlarms();
}

function registerPeriodicAlarms(): void {
  chrome.alarms.create(ALARM_BUDGET_CHECK, { periodInMinutes: BUDGET_CHECK_PERIOD_MINUTES });
  chrome.alarms.create(ALARM_EXPIRY_SWEEP, { periodInMinutes: EXPIRY_SWEEP_PERIOD_MINUTES });
  chrome.alarms.create(ALARM_SCORE_REFRESH, { periodInMinutes: SCORE_REFRESH_PERIOD_MINUTES });
}

async function handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (alarm.name === ALARM_BUDGET_CHECK) {
    await runBudgetCheck();
  } else if (alarm.name === ALARM_EXPIRY_SWEEP) {
    await runExpirySweep();
  } else if (alarm.name === ALARM_SCORE_REFRESH) {
    await refreshStalenessScores();
  } else if (alarm.name.startsWith(ALARM_SNOOZE_PREFIX)) {
    const tabId = alarm.name.slice(ALARM_SNOOZE_PREFIX.length);
    await wakeSnoozeById(tabId);
  }
}

// ─── Snooze scheduling ───────────────────────────────────────────────────────

export async function scheduleSnooze(entry: TabEntry): Promise<void> {
  if (!entry.snoozeUntil) return;

  await upsertTabEntry({ ...entry, state: 'snoozed' });

  chrome.alarms.create(`${ALARM_SNOOZE_PREFIX}${entry.id}`, {
    when: entry.snoozeUntil,
  });
}

export async function cancelSnooze(entry: TabEntry): Promise<void> {
  await chrome.alarms.clear(`${ALARM_SNOOZE_PREFIX}${entry.id}`);
  await upsertTabEntry({
    ...entry,
    state: 'virtualized',
    snoozeUntil: undefined,
    snoozeRule: undefined,
  });
}

async function wakeSnoozeById(tabId: string): Promise<void> {
  const { getTabEntry } = await import('../store/db');
  const entry = await getTabEntry(tabId);
  if (!entry || entry.state !== 'snoozed') return;

  await restoreTab(entry);

  chrome.notifications.create(`snooze-wake-${tabId}`, {
    type: 'basic',
    iconUrl: entry.favicon || 'assets/icons/icon48.png',
    title: 'Tab reminder',
    message: `Time to revisit: ${entry.title}`,
    buttons: [{ title: 'Open now' }, { title: 'Snooze 1 more day' }],
  });
}

// ─── Expiry sweep ─────────────────────────────────────────────────────────────

async function runExpirySweep(): Promise<void> {
  const now = Date.now();
  const allTabs = await getAllTabs();

  for (const tab of allTabs) {
    if (!tab.snoozeRule?.condition) continue;

    const { metric, threshold, action } = tab.snoozeRule.condition;
    const daysSinceActive = (now - tab.lastActiveAt) / MS_PER_DAY;

    let triggered = false;
    if (metric === 'consecutive_absent_days' && daysSinceActive >= threshold) {
      triggered = true;
    } else if (metric === 'total_absent_days' && daysSinceActive >= threshold) {
      triggered = true;
    }

    if (!triggered) continue;

    if (action === 'archive') {
      await upsertTabEntry({ ...tab, state: 'archived', snoozeRule: undefined });
    } else if (action === 'delete') {
      const { deleteTabEntry } = await import('../store/db');
      await deleteTabEntry(tab.id);
    } else if (action === 'notify') {
      chrome.notifications.create(`expiry-notify-${tab.id}`, {
        type: 'basic',
        iconUrl: tab.favicon || 'assets/icons/icon48.png',
        title: 'Stale tab',
        message: `"${tab.title}" hasn't been visited in ${Math.floor(daysSinceActive)} days`,
      });
    }
  }
}

/** Re-register snooze alarms on service worker restart (alarms survive, but we verify) */
export async function rehydrateSnoozeAlarms(): Promise<void> {
  const snoozed = await getTabsByState('snoozed');
  const now = Date.now();

  for (const tab of snoozed) {
    if (!tab.snoozeUntil) continue;

    const alarmName = `${ALARM_SNOOZE_PREFIX}${tab.id}`;
    const existing = await chrome.alarms.get(alarmName);

    if (!existing) {
      if (tab.snoozeUntil <= now) {
        // Missed while service worker was dead — wake immediately
        await wakeSnoozeById(tab.id);
      } else {
        chrome.alarms.create(alarmName, { when: tab.snoozeUntil });
      }
    }
  }
}

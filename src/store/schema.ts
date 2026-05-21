import Dexie, { type Table } from 'dexie';
import type { TabEntry, Workspace } from './types';

export class TabOSDatabase extends Dexie {
  tabEntries!: Table<TabEntry, string>;
  workspaces!: Table<Workspace, string>;

  constructor() {
    super('TabOS');

    this.version(1).stores({
      // Index definitions — only indexed fields listed here; all other fields stored automatically
      tabEntries: [
        'id',
        'state',
        'workspaceId',
        'lastActiveAt',
        'stalenessScore',
        'domain',
        'snoozeUntil',
        'chromeTabId',
      ].join(', '),
      workspaces: 'id, sortOrder, isActive',
    });

    // Future migrations go here:
    // this.version(2).stores({ ... }).upgrade(tx => { ... });
  }
}

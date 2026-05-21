import { create } from 'zustand';
import type { TabEntry, Workspace, UserPrefs } from '../store/types';
import { DEFAULT_USER_PREFS } from '../store/types';
import type { UIMessage } from '../shared/messages';

interface TabOSUIState {
  tabs: TabEntry[];
  workspaces: Workspace[];
  prefs: UserPrefs;
  isLoading: boolean;
  searchQuery: string;
  activeView: 'workspace' | 'search' | 'archive' | 'snooze' | 'settings' | 'import-export';

  // Actions
  setTabs: (tabs: TabEntry[]) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  setPrefs: (prefs: UserPrefs) => void;
  setLoading: (loading: boolean) => void;
  setSearchQuery: (q: string) => void;
  setActiveView: (view: TabOSUIState['activeView']) => void;
}

export const useTabOSStore = create<TabOSUIState>((set) => ({
  tabs: [],
  workspaces: [],
  prefs: DEFAULT_USER_PREFS,
  isLoading: true,
  searchQuery: '',
  activeView: 'workspace',

  setTabs: (tabs) => set({ tabs }),
  setWorkspaces: (workspaces) => set({ workspaces }),
  setPrefs: (prefs) => set({ prefs }),
  setLoading: (isLoading) => set({ isLoading }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setActiveView: (activeView) => set({ activeView }),
}));

/** Subscribe to messages from the background service worker */
export function connectBackgroundMessages(): void {
  chrome.runtime.onMessage.addListener((message: UIMessage) => {
    const store = useTabOSStore.getState();
    switch (message.type) {
      case 'TABS_UPDATED':
        store.setTabs(message.payload.entries);
        break;
      case 'WORKSPACES_UPDATED':
        store.setWorkspaces(message.payload.workspaces);
        break;
      case 'PREFS_UPDATED':
        store.setPrefs(message.payload);
        break;
    }
  });
}

/** Load initial state from the background on side panel open */
export async function loadInitialState(): Promise<void> {
  const store = useTabOSStore.getState();
  store.setLoading(true);

  const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  if (response?.type === 'STATE_RESPONSE') {
    store.setTabs(response.payload.tabs);
    store.setWorkspaces(response.payload.workspaces);
    store.setPrefs(response.payload.prefs);
  }

  store.setLoading(false);
}

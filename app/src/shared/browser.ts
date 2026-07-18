export type RuntimeState = 'hot' | 'warm' | 'cold';

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  runtimeState: RuntimeState;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  createdAt: number;
  lastActiveAt: number;
}

export interface BrowserSnapshot {
  tabs: BrowserTab[];
  activeTabId: string | null;
  path: BrowserPathEvent[];
}

export interface BrowserPathEvent {
  id: string;
  tabId: string;
  url: string;
  title: string;
  visitedAt: number;
  parentVisitId?: string;
}

export interface BrowserLayout {
  topInset: number;
  brainHeight: number;
}

export type BrowserCommand =
  | { type: 'new-tab'; url?: string }
  | { type: 'activate-tab'; tabId: string }
  | { type: 'close-tab'; tabId: string }
  | { type: 'navigate'; tabId: string; input: string }
  | { type: 'back'; tabId: string }
  | { type: 'forward'; tabId: string }
  | { type: 'reload'; tabId: string }
  | { type: 'stop'; tabId: string }
  | { type: 'reorder-tabs'; tabIds: string[] };

export interface TabOSBridge {
  getSnapshot(): Promise<BrowserSnapshot>;
  command(command: BrowserCommand): Promise<BrowserSnapshot>;
  setLayout(layout: BrowserLayout): Promise<void>;
  subscribe(listener: (snapshot: BrowserSnapshot) => void): () => void;
  onFocusAddress(listener: () => void): () => void;
}

declare global {
  interface Window {
    tabos: TabOSBridge;
  }
}

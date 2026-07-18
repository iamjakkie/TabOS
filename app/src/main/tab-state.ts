import type { BrowserTab } from '../shared/browser';

export type TabStateAction =
  | { type: 'activate'; tabId: string; now: number }
  | { type: 'navigated'; tabId: string; url: string; title: string }
  | { type: 'loading'; tabId: string; isLoading: boolean }
  | { type: 'history'; tabId: string; canGoBack: boolean; canGoForward: boolean };

export function normalizeNavigationInput(input: string): string {
  const value = input.trim();
  if (/^https?:\/\//i.test(value)) return value;

  const looksLikeDomain = /^(localhost(?::\d+)?|(?:[\w-]+\.)+[a-z]{2,})(?:[/:?#].*)?$/i.test(value);
  if (looksLikeDomain) return `https://${value}`;

  return `https://www.google.com/search?q=${encodeURIComponent(value).replace(/%20/g, '+')}`;
}

export function createTab(
  url: string,
  id: string = crypto.randomUUID(),
  now: number = Date.now(),
): BrowserTab {
  return {
    id,
    url,
    title: 'New tab',
    runtimeState: 'hot',
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    createdAt: now,
    lastActiveAt: now,
  };
}

export function reduceTabState(tabs: BrowserTab[], action: TabStateAction): BrowserTab[] {
  switch (action.type) {
    case 'activate':
      return tabs.map((tab) => ({
        ...tab,
        runtimeState: tab.id === action.tabId ? 'hot' : tab.runtimeState === 'hot' ? 'warm' : tab.runtimeState,
        lastActiveAt: tab.id === action.tabId ? action.now : tab.lastActiveAt,
      }));
    case 'navigated':
      return tabs.map((tab) => tab.id === action.tabId
        ? { ...tab, url: action.url, title: action.title || tab.title }
        : tab);
    case 'loading':
      return tabs.map((tab) => tab.id === action.tabId ? { ...tab, isLoading: action.isLoading } : tab);
    case 'history':
      return tabs.map((tab) => tab.id === action.tabId
        ? { ...tab, canGoBack: action.canGoBack, canGoForward: action.canGoForward }
        : tab);
  }
}

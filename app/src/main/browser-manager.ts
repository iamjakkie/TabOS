import {
  BaseWindow,
  WebContentsView,
  type Rectangle,
  type Session,
} from 'electron';
import type { BrowserCommand, BrowserSnapshot, BrowserTab } from '../shared/browser';
import { createTab, normalizeNavigationInput, reduceTabState } from './tab-state';
import { chooseTabsToFreeze } from './freeze-policy';
import { appendPathEvent, createPathEvent, resolveVisitParent, selectSettledNavigation, type PathEvent } from './navigation-path';
import { normalizeRestoredSnapshot } from './snapshot-restore';
import type { SnapshotRepository } from './snapshot-repository';

const DEFAULT_URL = 'https://example.com';
const MAX_LIVE_RENDERERS = 6;

interface ManagedView {
  view: WebContentsView;
  lastUsedAt: number;
}

export class BrowserManager {
  private tabs: BrowserTab[] = [];
  private activeTabId: string | null = null;
  private readonly views = new Map<string, ManagedView>();
  private path: PathEvent[] = [];
  private readonly suppressPathForTab = new Set<string>();
  private readonly lastVisitByTab = new Map<string, string>();
  private readonly openedFromVisitByTab = new Map<string, string>();
  private readonly pendingNavigations = new Map<string, string[]>();
  private activeVisitId: string | undefined;
  private contentBounds: Rectangle = { x: 288, y: 104, width: 912, height: 696 };
  private onSnapshot: (snapshot: BrowserSnapshot) => void = () => {};

  constructor(
    private readonly window: BaseWindow,
    private readonly browserSession: Session,
    private readonly repository?: SnapshotRepository,
  ) {}

  setSnapshotListener(listener: (snapshot: BrowserSnapshot) => void): void {
    this.onSnapshot = listener;
  }

  getSnapshot(): BrowserSnapshot {
    return { tabs: this.tabs, activeTabId: this.activeTabId, path: this.path };
  }

  // Map of live renderer OS process id -> tabId, for usage sampling. Only tabs
  // with an active WebContentsView appear here (cold tabs have no process).
  getLiveProcessMap(): Map<number, string> {
    const map = new Map<number, string>();
    for (const [tabId, managed] of this.views) {
      try {
        const pid = managed.view.webContents.getOSProcessId();
        if (pid) map.set(pid, tabId);
      } catch {
        // webContents may be gone mid-sample; skip.
      }
    }
    return map;
  }

  setBounds(bounds: Rectangle): void {
    this.contentBounds = bounds;
    const active = this.activeTabId ? this.views.get(this.activeTabId) : undefined;
    active?.view.setBounds(bounds);
  }

  async initialize(): Promise<void> {
    const stored = this.repository?.load();
    if (stored?.tabs.length) {
      const restored = normalizeRestoredSnapshot(stored);
      this.tabs = restored.tabs;
      this.path = restored.path;
      this.activeTabId = restored.activeTabId;
      for (const visit of this.path) this.lastVisitByTab.set(visit.tabId, visit.id);
      this.activeVisitId = this.activeTabId ? this.lastVisitByTab.get(this.activeTabId) : undefined;

      const active = this.activeTabId ? this.tabs.find((tab) => tab.id === this.activeTabId) : undefined;
      if (active) {
        const view = this.createView(active.id);
        this.views.set(active.id, { view, lastUsedAt: Date.now() });
        this.showOnly(active.id);
        this.suppressPathForTab.add(active.id);
        this.emit();
        await view.webContents.loadURL(active.url);
        return;
      }
    }
    await this.newTab(DEFAULT_URL);
  }

  async handle(command: BrowserCommand): Promise<BrowserSnapshot> {
    switch (command.type) {
      case 'new-tab':
        await this.newTab(command.url ?? DEFAULT_URL);
        break;
      case 'activate-tab':
        await this.activateTab(command.tabId);
        break;
      case 'close-tab':
        await this.closeTab(command.tabId);
        break;
      case 'navigate':
        await this.navigate(command.tabId, command.input);
        break;
      case 'back':
        this.views.get(command.tabId)?.view.webContents.navigationHistory.goBack();
        break;
      case 'forward':
        this.views.get(command.tabId)?.view.webContents.navigationHistory.goForward();
        break;
      case 'reload':
        this.views.get(command.tabId)?.view.webContents.reload();
        break;
      case 'stop':
        this.views.get(command.tabId)?.view.webContents.stop();
        break;
      case 'set-pinned':
        this.tabs = this.tabs.map((tab) => tab.id === command.tabId
          ? { ...tab, pinned: command.pinned }
          : tab);
        this.emit();
        break;
      case 'reorder-tabs': {
        const byId = new Map(this.tabs.map((tab) => [tab.id, tab]));
        const reordered = command.tabIds.flatMap((id) => {
          const tab = byId.get(id);
          return tab ? [tab] : [];
        });
        const omitted = this.tabs.filter((tab) => !command.tabIds.includes(tab.id));
        this.tabs = [...reordered, ...omitted];
        this.emit();
        break;
      }
    }
    return this.getSnapshot();
  }

  destroy(): void {
    this.persist();
    for (const { view } of this.views.values()) {
      this.window.contentView.removeChildView(view);
      view.webContents.close();
    }
    this.views.clear();
  }

  private async newTab(input: string): Promise<void> {
    const url = normalizeNavigationInput(input);
    const tab = createTab(url);
    this.tabs = this.tabs.map((existing) => existing.runtimeState === 'hot'
      ? { ...existing, runtimeState: 'warm' }
      : existing);
    this.tabs.push(tab);
    this.activeTabId = tab.id;
    if (this.activeVisitId) this.openedFromVisitByTab.set(tab.id, this.activeVisitId);
    const view = this.createView(tab.id);
    this.views.set(tab.id, { view, lastUsedAt: Date.now() });
    this.showOnly(tab.id);
    this.emit();
    await view.webContents.loadURL(url);
    this.evictExcessViews();
  }

  private async activateTab(tabId: string): Promise<void> {
    const tab = this.tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return;

    this.tabs = reduceTabState(this.tabs, { type: 'activate', tabId, now: Date.now() });
    this.activeTabId = tabId;
    this.activeVisitId = this.lastVisitByTab.get(tabId);
    let managed = this.views.get(tabId);
    if (!managed) {
      const view = this.createView(tabId);
      managed = { view, lastUsedAt: Date.now() };
      this.views.set(tabId, managed);
      this.suppressPathForTab.add(tabId);
      await view.webContents.loadURL(tab.url);
    }
    managed.lastUsedAt = Date.now();
    this.showOnly(tabId);
    this.emit();
    this.evictExcessViews();
  }

  private async closeTab(tabId: string): Promise<void> {
    const index = this.tabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;

    const managed = this.views.get(tabId);
    if (managed) {
      this.window.contentView.removeChildView(managed.view);
      managed.view.webContents.close();
      this.views.delete(tabId);
    }
    this.tabs.splice(index, 1);

    if (this.activeTabId === tabId) {
      const next = this.tabs[Math.min(index, this.tabs.length - 1)];
      this.activeTabId = null;
      if (next) await this.activateTab(next.id);
      else await this.newTab(DEFAULT_URL);
    } else {
      this.emit();
    }
  }

  private async navigate(tabId: string, input: string): Promise<void> {
    const managed = this.views.get(tabId);
    if (!managed) {
      await this.activateTab(tabId);
    }
    await this.views.get(tabId)?.view.webContents.loadURL(normalizeNavigationInput(input));
  }

  private createView(tabId: string): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        session: this.browserSession,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });
    view.setBackgroundColor('#0b1020');
    this.window.contentView.addChildView(view);
    view.setBounds(this.contentBounds);

    const contents = view.webContents;
    contents.setWindowOpenHandler(({ url }) => {
      void this.newTab(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (_event, url) => {
      if (!/^https?:\/\//i.test(url)) _event.preventDefault();
    });
    contents.on('did-start-loading', () => {
      this.pendingNavigations.set(tabId, []);
      this.updateLoading(tabId, true);
    });
    contents.on('did-stop-loading', () => {
      this.updateLoading(tabId, false);
      this.commitSettledNavigation(tabId);
    });
    contents.on('did-navigate', (_event, url) => this.observeNavigation(tabId, url));
    contents.on('did-navigate-in-page', (_event, url) => this.observeNavigation(tabId, url));
    contents.on('page-title-updated', (_event, title) => {
      const tab = this.tabs.find((candidate) => candidate.id === tabId);
      if (tab) this.tabs = reduceTabState(this.tabs, { type: 'navigated', tabId, url: tab.url, title });
      this.emit();
    });
    contents.on('page-favicon-updated', (_event, favicons) => {
      this.tabs = this.tabs.map((tab) => tab.id === tabId ? { ...tab, favicon: favicons[0] } : tab);
      this.emit();
    });
    contents.on('render-process-gone', () => {
      this.tabs = this.tabs.map((tab) => tab.id === tabId
        ? { ...tab, title: `${tab.title} (renderer crashed)`, runtimeState: 'cold' }
        : tab);
      this.views.delete(tabId);
      this.emit();
    });
    return view;
  }

  private updateLoading(tabId: string, isLoading: boolean): void {
    this.tabs = reduceTabState(this.tabs, { type: 'loading', tabId, isLoading });
    this.updateHistory(tabId);
  }

  private observeNavigation(tabId: string, url: string): void {
    const candidates = this.pendingNavigations.get(tabId) ?? [];
    candidates.push(url);
    this.pendingNavigations.set(tabId, candidates);
    const title = this.views.get(tabId)?.view.webContents.getTitle() || url;
    this.tabs = reduceTabState(this.tabs, { type: 'navigated', tabId, url, title });
    this.updateHistory(tabId);
  }

  private commitSettledNavigation(tabId: string): void {
    const previousVisitId = this.lastVisitByTab.get(tabId);
    const previousUrl = previousVisitId
      ? this.path.find((visit) => visit.id === previousVisitId)?.url
      : undefined;
    const url = selectSettledNavigation(this.pendingNavigations.get(tabId) ?? [], previousUrl);
    this.pendingNavigations.delete(tabId);
    if (this.suppressPathForTab.has(tabId)) {
      this.suppressPathForTab.delete(tabId);
      return;
    }
    if (!url) return;
    const title = this.views.get(tabId)?.view.webContents.getTitle() || url;
    this.tabs = reduceTabState(this.tabs, { type: 'navigated', tabId, url, title });
    const id = crypto.randomUUID();
    const parentVisitId = resolveVisitParent({
      previousVisitInTab: this.lastVisitByTab.get(tabId),
      openedFromVisit: this.openedFromVisitByTab.get(tabId),
      activeVisit: this.activeVisitId,
    });
    this.path = appendPathEvent(this.path, createPathEvent({
      id, tabId, url, title, visitedAt: Date.now(), parentVisitId,
    }));
    this.lastVisitByTab.set(tabId, id);
    this.openedFromVisitByTab.delete(tabId);
    if (this.activeTabId === tabId) this.activeVisitId = id;
    this.updateHistory(tabId);
  }

  private updateHistory(tabId: string): void {
    const history = this.views.get(tabId)?.view.webContents.navigationHistory;
    if (!history) return;
    this.tabs = reduceTabState(this.tabs, {
      type: 'history',
      tabId,
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward(),
    });
    this.emit();
  }

  private showOnly(tabId: string): void {
    for (const [id, { view }] of this.views) {
      view.setVisible(id === tabId);
      if (id === tabId) view.setBounds(this.contentBounds);
    }
  }

  private evictExcessViews(): void {
    const pinned = new Set(this.tabs.filter((tab) => tab.pinned).map((tab) => tab.id));
    const toFreeze = chooseTabsToFreeze(
      [...this.views.entries()].map(([tabId, managed]) => ({ tabId, lastUsedAt: managed.lastUsedAt })),
      this.activeTabId,
      MAX_LIVE_RENDERERS,
      pinned,
    );

    for (const tabId of toFreeze) {
      const managed = this.views.get(tabId);
      if (!managed) continue;
      this.window.contentView.removeChildView(managed.view);
      managed.view.webContents.close();
      this.views.delete(tabId);
      this.tabs = this.tabs.map((tab) => tab.id === tabId ? { ...tab, runtimeState: 'cold' } : tab);
    }
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.repository?.save(snapshot);
    this.onSnapshot(snapshot);
  }

  private persist(): void {
    this.repository?.save(this.getSnapshot());
  }
}

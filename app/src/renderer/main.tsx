import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { BrowserSnapshot, BrowserTab, TabUsage } from '../shared/browser';
import { createHoverWakeController } from './hover-wake';
import { buildPathRows } from '../main/navigation-path';
import { KnowledgeGraphView } from './KnowledgeGraphView';
import { StudyView } from './StudyView';
import { QuickAddToStudy } from './QuickAddToStudy';
import { Sidebar } from './Sidebar';
import './styles.css';

const EMPTY: BrowserSnapshot = { tabs: [], activeTabId: null, path: [] };
const BRAIN_HEIGHT = 330;
const SIDEBAR_WIDTH = 260;

function App() {
  const [snapshot, setSnapshot] = useState<BrowserSnapshot>(EMPTY);
  const [address, setAddress] = useState('');
  const [brainOpen, setBrainOpen] = useState(false);
  const [brainMode, setBrainMode] = useState<'ask' | 'path' | 'groups' | 'activity'>('ask');
  const [studyOpen, setStudyOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [usage, setUsage] = useState<Map<string, TabUsage>>(new Map());
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const tabStripRef = useRef<HTMLDivElement>(null);

  const active = useMemo(
    () => snapshot.tabs.find((tab) => tab.id === snapshot.activeTabId),
    [snapshot],
  );

  async function command(value: Parameters<typeof window.tabos.command>[0]) {
    setSnapshot(await window.tabos.command(value));
  }

  const hoverWake = useMemo(() => createHoverWakeController((tabId) => {
    void command({ type: 'activate-tab', tabId });
  }), []);

  useEffect(() => {
    window.tabos.getSnapshot().then(setSnapshot);
    const unsubscribe = window.tabos.subscribe(setSnapshot);
    const unsubscribeFocus = window.tabos.onFocusAddress(() => {
      addressRef.current?.focus();
      addressRef.current?.select();
    });
    const unsubscribeUsage = window.tabos.onUsage((list) => {
      setUsage(new Map(list.map((entry) => [entry.tabId, entry])));
    });
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setSidebarOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { unsubscribe(); unsubscribeFocus(); unsubscribeUsage(); window.removeEventListener('keydown', onKey); hoverWake.clear(); };
  }, [hoverWake]);

  useEffect(() => {
    if (active?.url) setAddress(active.url);
  }, [active?.id, active?.url]);

  useEffect(() => {
    void window.tabos.setLayout({
      topInset: 52,
      brainHeight: brainOpen ? BRAIN_HEIGHT : 0,
      contentHidden: studyOpen || quickAddOpen,
      leftInset: sidebarOpen ? SIDEBAR_WIDTH : 0,
    });
  }, [brainOpen, studyOpen, quickAddOpen, sidebarOpen]);


  function reorderTabs(targetId: string) {
    if (!draggedTab || draggedTab === targetId) return;
    const ids = snapshot.tabs.map((tab) => tab.id);
    const from = ids.indexOf(draggedTab);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    void command({ type: 'reorder-tabs', tabIds: ids });
    setDraggedTab(null);
  }

  return (
    <main className={`app-shell ${brainOpen ? 'brain-open' : ''} ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <header className="browser-chrome">
        <div
          ref={tabStripRef}
          className="tab-strip"
          onWheel={(event) => {
            if (!tabStripRef.current) return;
            event.preventDefault();
            tabStripRef.current.scrollLeft += event.deltaY || event.deltaX;
          }}
        >
          {snapshot.tabs.map((tab) => (
            <TopTab
              key={tab.id}
              tab={tab}
              active={tab.id === snapshot.activeTabId}
              onActivate={() => command({ type: 'activate-tab', tabId: tab.id })}
              onClose={() => command({ type: 'close-tab', tabId: tab.id })}
              onHoverStart={() => tab.runtimeState !== 'hot' && hoverWake.enter(tab.id)}
              onHoverEnd={() => hoverWake.leave(tab.id)}
              onDragStart={() => setDraggedTab(tab.id)}
              onDrop={() => reorderTabs(tab.id)}
            />
          ))}
        </div>
        <button className="new-tab-button" onClick={() => command({ type: 'new-tab' })} title="New tab (⌘/Ctrl+T)">＋</button>
        <div className="chrome-actions">
          <button className={sidebarOpen ? 'toggle-active' : ''} onClick={() => setSidebarOpen((open) => !open)} title="Toggle tab list (⌘/Ctrl+B)">☰</button>
          <button onClick={() => active && command({ type: 'back', tabId: active.id })} disabled={!active?.canGoBack}>←</button>
          <button onClick={() => active && command({ type: 'forward', tabId: active.id })} disabled={!active?.canGoForward}>→</button>
          <button onClick={() => active && command({ type: active.isLoading ? 'stop' : 'reload', tabId: active.id })}>{active?.isLoading ? '×' : '↻'}</button>
          <form className="compact-address" onSubmit={(event) => {
            event.preventDefault();
            if (active) void command({ type: 'navigate', tabId: active.id, input: address });
            addressRef.current?.blur();
          }}>
            <span>⌕</span>
            <input ref={addressRef} value={address} onFocus={(event) => event.currentTarget.select()} onClick={(event) => event.currentTarget.select()} onChange={(event) => setAddress(event.target.value)} placeholder="Search or enter address" />
          </form>
          <button className={`brain-button ${quickAddOpen ? 'active' : ''}`} onClick={() => setQuickAddOpen((open) => !open)} disabled={!active} title="Add this page to a learning path">
            <span>＋</span><span className="brain-label">Path</span>
          </button>
          <button className={`brain-button ${studyOpen ? 'active' : ''}`} onClick={() => setStudyOpen((open) => !open)} title="Open Study Mode">
            <span>◆</span><span className="brain-label">Study</span>
          </button>
          <button className={`brain-button ${brainOpen ? 'active' : ''}`} onClick={() => setBrainOpen((open) => !open)} title="Open TabOS brain">
            <span>✦</span><span className="brain-label">Brain</span>
          </button>
        </div>
      </header>


      <div className="browser-underlay" />

      {sidebarOpen && (
        <Sidebar
          snapshot={snapshot}
          usage={usage}
          onActivate={(tabId) => command({ type: 'activate-tab', tabId })}
          onClose={(tabId) => command({ type: 'close-tab', tabId })}
        />
      )}

      {quickAddOpen && (
        <div className="quick-add-scrim">
          <QuickAddToStudy active={active} onClose={() => setQuickAddOpen(false)} />
        </div>
      )}

      {studyOpen && (
        <section className="study-overlay">
          <StudyView />
        </section>
      )}

      {brainOpen && (
        <section className="brain-drawer">
          <div className="brain-header">
            <nav>
              {(['ask', 'path', 'groups', 'activity'] as const).map((mode) => (
                <button key={mode} className={brainMode === mode ? 'active' : ''} onClick={() => setBrainMode(mode)}>{mode === 'ask' ? 'Ask' : mode[0]!.toUpperCase() + mode.slice(1)}</button>
              ))}
            </nav>
            <div className="brain-context"><span className="status-dot" /> current session · {snapshot.tabs.length} tabs</div>
            <button className="collapse" onClick={() => setBrainOpen(false)}>⌄</button>
          </div>
          <BrainContent mode={brainMode} active={active} tabs={snapshot.tabs} path={snapshot.path} onMode={setBrainMode} />
        </section>
      )}
    </main>
  );
}

function TopTab({ tab, active, onActivate, onClose, onHoverStart, onHoverEnd, onDragStart, onDrop }: {
  tab: BrowserTab; active: boolean; onActivate: () => void; onClose: () => void;
  onHoverStart: () => void; onHoverEnd: () => void; onDragStart: () => void; onDrop: () => void;
}) {
  return (
    <div className={`top-tab ${active ? 'active' : ''}`} draggable onDragStart={onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} onClick={onActivate} onMouseEnter={onHoverStart} onMouseLeave={onHoverEnd}>
      <span className={`runtime-dot ${tab.runtimeState}`} />
      {tab.favicon ? <img src={tab.favicon} /> : <span className="tab-glyph">◦</span>}
      <span className="top-tab-title">{tab.title}</span>
      {tab.isLoading && <span className="loading-ring" />}
      <button onClick={(event) => { event.stopPropagation(); onClose(); }}>×</button>
    </div>
  );
}

function BrainContent({ mode, active, tabs, path, onMode }: { mode: 'ask' | 'path' | 'groups' | 'activity'; active?: BrowserTab; tabs: BrowserTab[]; path: BrowserSnapshot['path']; onMode: (mode: 'ask' | 'path' | 'groups' | 'activity') => void }) {
  if (mode === 'path') return <div className="brain-content graph-mode"><KnowledgeGraphView path={path} onOpenUrl={(url) => { const existing = tabs.find((tab) => tab.url === url); if (existing) void window.tabos.command({ type: 'activate-tab', tabId: existing.id }); else void window.tabos.command({ type: 'new-tab', url }); }} /></div>;
  if (mode === 'groups') return <div className="brain-content cards"><BrainCard title="Ungrouped" value={`${tabs.length} tabs`} detail="Ready for AI grouping" /><BrainCard title="Research" value="Suggested" detail="Pages with related topics" /><BrainCard title="Later" value="0 tabs" detail="Snoozed and saved" /></div>;
  if (mode === 'activity') return <div className="brain-content cards"><BrainCard title="This session" value={`${tabs.length} tabs`} detail="1 live · recently active" /><BrainCard title="Last hour" value="Browsing trail" detail="Review or close as a batch" action="Review" /><BrainCard title="Memory" value="Efficient" detail="Cold tabs use no renderer" /></div>;
  return <div className="brain-content ask-view"><div className="context-card"><span>Current context</span><strong>{active?.title ?? 'No active page'}</strong><small>{safeHost(active?.url ?? '')}</small></div><form onSubmit={(event) => { event.preventDefault(); onMode('activity'); }}><textarea placeholder="Ask about this page, group this session, create a note, set a reminder…" /><div><button type="button" onClick={() => onMode('path')}>＋ Context</button><button type="submit" className="send">Ask TabOS ↗</button></div></form><div className="quick-prompts"><button onClick={() => onMode('activity')}>Summarize this page</button><button onClick={() => onMode('groups')}>Group open tabs</button><button onClick={() => onMode('path')}>Turn session into a note</button><button onClick={() => onMode('activity')}>Review the last hour</button></div></div>;
}

function BrainCard({ title, value, detail, action }: { title: string; value: string; detail: string; action?: string }) { return <article className="brain-card"><span>{title}</span><strong>{value}</strong><p>{detail}</p>{action && <button>{action} →</button>}</article>; }

function safeHost(url: string): string { try { return new URL(url).hostname; } catch { return url; } }

createRoot(document.getElementById('root')!).render(<App />);

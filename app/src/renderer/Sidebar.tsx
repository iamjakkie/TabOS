import React, { useMemo, useRef, useState } from 'react';
import type { BrowserSnapshot, BrowserTab, TabUsage } from '../shared/browser';
import { filterTabs, usageColor, visibleWindow } from './tab-list';

const ROW_HEIGHT = 40;
const OVERSCAN = 8;

interface Props {
  snapshot: BrowserSnapshot;
  usage: Map<string, TabUsage>;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
}

// Left navigation rail for large tab counts: search + virtualized list with a
// per-tab load indicator. Only the visible slice of rows is rendered, so it
// stays smooth with thousands of tabs.
export function Sidebar({ snapshot, usage, onActivate, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => filterTabs(snapshot.tabs, query), [snapshot.tabs, query]);
  const liveCount = useMemo(
    () => snapshot.tabs.filter((tab) => tab.runtimeState !== 'cold').length,
    [snapshot.tabs],
  );

  const win = visibleWindow(filtered.length, ROW_HEIGHT, scrollTop, viewport, OVERSCAN);
  const rows = filtered.slice(win.start, win.end);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="sidebar-count">
          <strong>{snapshot.tabs.length.toLocaleString()}</strong>
          <span>tabs · {liveCount} live</span>
        </div>
      </div>
      <div className="sidebar-search">
        <span>⌕</span>
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setScrollTop(0); if (scrollRef.current) scrollRef.current.scrollTop = 0; }}
          placeholder="Search tabs"
        />
        {query && <button className="sidebar-clear" onClick={() => setQuery('')}>×</button>}
      </div>

      <div
        ref={scrollRef}
        className="sidebar-list"
        onScroll={(event) => {
          const el = event.currentTarget;
          setScrollTop(el.scrollTop);
          if (el.clientHeight !== viewport) setViewport(el.clientHeight);
        }}
      >
        <div style={{ height: win.totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${win.topPad}px)` }}>
            {rows.map((tab) => (
              <SidebarRow
                key={tab.id}
                tab={tab}
                active={tab.id === snapshot.activeTabId}
                usage={usage.get(tab.id)}
                onActivate={() => onActivate(tab.id)}
                onClose={() => onClose(tab.id)}
              />
            ))}
          </div>
        </div>
        {filtered.length === 0 && <p className="sidebar-empty">No tabs match “{query}”.</p>}
      </div>
    </aside>
  );
}

function SidebarRow({ tab, active, usage, onActivate, onClose }: {
  tab: BrowserTab; active: boolean; usage: TabUsage | undefined; onActivate: () => void; onClose: () => void;
}) {
  const color = usageColor(tab.runtimeState, usage);
  const title = tab.runtimeState === 'cold'
    ? 'Suspended — click to restore'
    : `${tab.runtimeState} · ${usage ? `${usage.cpu}% CPU · ${usage.memoryMB} MB` : 'live'}`;
  return (
    <div
      className={`sidebar-row ${active ? 'active' : ''} ${tab.runtimeState}`}
      style={{ height: ROW_HEIGHT }}
      onClick={onActivate}
      title={title}
    >
      <span className="sidebar-load" style={{ background: color }} />
      {tab.favicon ? <img src={tab.favicon} alt="" /> : <span className="sidebar-glyph">◦</span>}
      <span className="sidebar-row-title">{tab.title || tab.url}</span>
      {tab.isLoading && <span className="sidebar-loading" />}
      <button className="sidebar-row-close" onClick={(event) => { event.stopPropagation(); onClose(); }}>×</button>
    </div>
  );
}

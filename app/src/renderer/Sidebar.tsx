import React, { useMemo, useRef, useState } from 'react';
import type { BrowserSnapshot, BrowserTab, TabUsage } from '../shared/browser';
import { filterTabs, usageColor, visibleWindow } from './tab-list';
import { faviconSrc } from './favicon';

const ROW_HEIGHT = 40;
const OVERSCAN = 8;

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 560;

interface Props {
  snapshot: BrowserSnapshot;
  usage: Map<string, TabUsage>;
  width: number;
  onResize: (width: number) => void;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
}

// Left navigation rail for large tab counts: search + virtualized list with a
// per-tab load indicator. Only the visible slice of rows is rendered, so it
// stays smooth with thousands of tabs. A drag handle on the right edge resizes it.
export function Sidebar({ snapshot, usage, width, onResize, onActivate, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);
  const scrollRef = useRef<HTMLDivElement>(null);

  function startResize(event: React.PointerEvent) {
    event.preventDefault();
    const move = (e: PointerEvent) => {
      const next = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, e.clientX));
      onResize(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing-sidebar');
    };
    document.body.classList.add('resizing-sidebar');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const filtered = useMemo(() => filterTabs(snapshot.tabs, query), [snapshot.tabs, query]);
  const liveCount = useMemo(
    () => snapshot.tabs.filter((tab) => tab.runtimeState !== 'cold').length,
    [snapshot.tabs],
  );

  const win = visibleWindow(filtered.length, ROW_HEIGHT, scrollTop, viewport, OVERSCAN);
  const rows = filtered.slice(win.start, win.end);

  return (
    <aside className="sidebar" style={{ width }}>
      <div className="sidebar-resize" onPointerDown={startResize} title="Drag to resize" />
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
  const icon = faviconSrc(tab.favicon, tab.url);
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
      {icon ? <img src={icon} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : <span className="sidebar-glyph">◦</span>}
      <span className="sidebar-row-title">{tab.title || tab.url}</span>
      {tab.isLoading && <span className="sidebar-loading" />}
      <button className="sidebar-row-close" onClick={(event) => { event.stopPropagation(); onClose(); }}>×</button>
    </div>
  );
}

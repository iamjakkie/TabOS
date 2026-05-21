import React, { useEffect } from 'react';
import { useTabOSStore, connectBackgroundMessages, loadInitialState } from '../store';
import WorkspaceView from './WorkspaceView';
import SearchView from './SearchView';
import ArchiveView from './ArchiveView';
import SnoozeView from './SnoozeView';
import SettingsView from './SettingsView';
import ImportExportView from './ImportExportView';

type View = 'workspace' | 'search' | 'archive' | 'snooze' | 'settings' | 'import-export';

const NAV: { id: View; icon: string; label: string }[] = [
  { id: 'workspace', icon: '▦',  label: 'Spaces'  },
  { id: 'search',    icon: '⌕',  label: 'Search'  },
  { id: 'archive',   icon: '⊟',  label: 'Archive' },
  { id: 'snooze',    icon: '◷',  label: 'Snoozed' },
  { id: 'settings',  icon: '⊙',  label: 'Config'  },
  { id: 'import-export', icon: '⇅', label: 'Export' },
];

export default function App() {
  const { isLoading, activeView, setActiveView, tabs } = useTabOSStore();

  useEffect(() => {
    connectBackgroundMessages();
    loadInitialState();
  }, []);

  const activeTabs  = tabs.filter(t => t.state === 'active').length;
  const snoozed     = tabs.filter(t => t.state === 'snoozed').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 8px', borderBottom: '1px solid var(--c-border)' }}>
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px', color: '#818cf8' }}>
          TabOS
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Pill color="var(--c-accent)" label={`${activeTabs} live`} />
          {snoozed > 0 && <Pill color="var(--c-warn)" label={`${snoozed} 💤`} />}
        </div>
      </div>

      {/* ── Nav ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface)' }}>
        {NAV.map(item => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              style={{
                flex: 1,
                padding: '7px 2px 6px',
                background: 'none',
                border: 'none',
                borderBottom: active ? '2px solid var(--c-accent)' : '2px solid transparent',
                color: active ? '#a5b4fc' : 'var(--c-muted)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                transition: 'color 0.15s',
                fontSize: 12,
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>{item.icon}</span>
              <span style={{ fontSize: 9, letterSpacing: '0.03em', textTransform: 'uppercase', fontWeight: 600 }}>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: 20, color: 'var(--c-muted)', textAlign: 'center', fontSize: 12 }}>Loading…</div>
        ) : (
          <>
            {activeView === 'workspace'    && <WorkspaceView />}
            {activeView === 'search'       && <SearchView />}
            {activeView === 'archive'      && <ArchiveView />}
            {activeView === 'snooze'       && <SnoozeView />}
            {activeView === 'settings'     && <SettingsView />}
            {activeView === 'import-export' && <ImportExportView />}
          </>
        )}
      </div>
    </div>
  );
}

function Pill({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
      background: color + '22', color, border: `1px solid ${color}44`,
      letterSpacing: '0.03em',
    }}>
      {label}
    </span>
  );
}

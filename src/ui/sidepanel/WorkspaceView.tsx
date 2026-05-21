import React, { useState } from 'react';
import { useTabOSStore } from '../store';
import TabCard from '../components/TabCard';
import WorkspaceChip from '../components/WorkspaceChip';
import { UNASSIGNED_WORKSPACE_ID } from '../../store/types';
import type { TabEntry } from '../../store/types';

export default function WorkspaceView() {
  const { tabs, workspaces } = useTabOSStore();
  const [selectedWsId, setSelectedWsId] = useState<string | null>(
    workspaces.find(w => w.isActive)?.id ?? workspaces[0]?.id ?? null,
  );

  const activeWorkspace = workspaces.find(w => w.isActive);
  const displayWsId = selectedWsId ?? activeWorkspace?.id ?? null;

  const wsTab = (wsId: string) => tabs.filter(t => t.workspaceId === wsId && t.state !== 'archived');
  const unassigned = tabs.filter(t => t.workspaceId === UNASSIGNED_WORKSPACE_ID && t.state !== 'archived');

  function send(type: string, payload: Record<string, unknown>) {
    chrome.runtime.sendMessage({ type, payload });
  }

  const actions = (entry: TabEntry) => ({
    onRestore:    () => send('RESTORE_TAB',    { tabId: entry.id }),
    onVirtualize: () => send('VIRTUALIZE_TAB', { tabId: entry.id }),
    onSnooze:     () => send('SNOOZE_TAB',     { tabId: entry.id, rule: { type: 'duration', durationMs: 86_400_000 } }),
    onArchive:    () => send('ARCHIVE_TAB',    { tabId: entry.id }),
  });

  const displayTabs = displayWsId
    ? wsTab(displayWsId).sort((a, b) => {
        // active first, then by recency
        if (a.state === 'active' && b.state !== 'active') return -1;
        if (b.state === 'active' && a.state !== 'active') return 1;
        return b.lastActiveAt - a.lastActiveAt;
      })
    : [];

  const isCurrentWs = displayWsId === activeWorkspace?.id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Workspace strip */}
      <div style={{
        display: 'flex',
        gap: 6,
        padding: '10px 10px 8px',
        overflowX: 'auto',
        borderBottom: '1px solid var(--c-border)',
        scrollbarWidth: 'none',
      }}>
        {workspaces.map(ws => (
          <WorkspaceChip
            key={ws.id}
            workspace={ws}
            isActive={ws.id === displayWsId}
            tabCount={wsTab(ws.id).length}
            onClick={() => setSelectedWsId(ws.id)}
          />
        ))}
        {unassigned.length > 0 && (
          <button
            onClick={() => setSelectedWsId(UNASSIGNED_WORKSPACE_ID)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
              border: displayWsId === UNASSIGNED_WORKSPACE_ID ? '1.5px solid var(--c-muted)' : '1.5px solid var(--c-border)',
              background: displayWsId === UNASSIGNED_WORKSPACE_ID ? 'var(--c-surface)' : 'transparent',
              color: 'var(--c-muted)', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-muted)' }} />
            Unassigned
            <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--c-surface-2)', borderRadius: 99, padding: '0 5px', lineHeight: '16px' }}>
              {unassigned.length}
            </span>
          </button>
        )}
      </div>

      {/* Switch CTA */}
      {displayWsId && !isCurrentWs && displayWsId !== UNASSIGNED_WORKSPACE_ID && (
        <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--c-border)' }}>
          <button
            onClick={() => send('SWITCH_WORKSPACE', { workspaceId: displayWsId })}
            style={{
              width: '100%', padding: '6px 0', borderRadius: 6, border: 'none',
              background: 'var(--c-accent)', color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', letterSpacing: '0.02em',
            }}
          >
            Switch to {workspaces.find(w => w.id === displayWsId)?.name ?? 'workspace'}
          </button>
        </div>
      )}

      {/* Stats row */}
      {displayWsId && (
        <div style={{
          display: 'flex', gap: 12, padding: '6px 14px',
          borderBottom: '1px solid var(--c-border)', fontSize: 10, color: 'var(--c-muted)',
        }}>
          <span>{displayTabs.filter(t => t.state === 'active').length} active</span>
          <span>{displayTabs.filter(t => t.state === 'virtualized').length} virtualized</span>
          <span>{displayTabs.filter(t => t.state === 'snoozed').length} snoozed</span>
        </div>
      )}

      {/* Tab list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {!displayWsId && (
          <Empty text="Select a workspace above" />
        )}
        {displayWsId && displayTabs.length === 0 && (
          <Empty text="No tabs in this workspace yet" />
        )}
        {displayTabs.map(entry => (
          <TabCard key={entry.id} entry={entry} {...actions(entry)} />
        ))}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--c-muted)', fontSize: 12 }}>
      {text}
    </div>
  );
}

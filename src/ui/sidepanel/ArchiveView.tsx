import React from 'react';
import { useTabOSStore } from '../store';
import TabCard from '../components/TabCard';

export default function ArchiveView() {
  const { tabs } = useTabOSStore();
  const archived = tabs
    .filter(t => t.state === 'archived')
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);

  function send(type: string, payload: Record<string, unknown>) {
    chrome.runtime.sendMessage({ type, payload });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '8px 14px', borderBottom: '1px solid var(--c-border)',
        fontSize: 10, color: 'var(--c-muted)', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {archived.length} archived
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {archived.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--c-muted)', fontSize: 12 }}>
            No archived tabs yet
          </div>
        ) : archived.map(entry => (
          <TabCard
            key={entry.id}
            entry={entry}
            onRestore={() => send('RESTORE_TAB', { tabId: entry.id })}
            onArchive={() => send('DELETE_TAB',  { tabId: entry.id })}
          />
        ))}
      </div>
    </div>
  );
}

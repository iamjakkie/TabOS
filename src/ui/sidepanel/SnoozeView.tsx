import React from 'react';
import { useTabOSStore } from '../store';

export default function SnoozeView() {
  const { tabs } = useTabOSStore();
  const snoozed = tabs
    .filter(t => t.state === 'snoozed')
    .sort((a, b) => (a.snoozeUntil ?? 0) - (b.snoozeUntil ?? 0));

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
        {snoozed.length} snoozed
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {snoozed.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--c-muted)', fontSize: 12 }}>
            No snoozed tabs.<br />
            <span style={{ fontSize: 10 }}>Right-click any tab → Snooze</span>
          </div>
        ) : snoozed.map(entry => (
          <div
            key={entry.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 12px', margin: '1px 4px', borderRadius: 6,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-warn)', flexShrink: 0 }} />
            <div style={{ width: 14, height: 14, flexShrink: 0 }}>
              {entry.favicon
                ? <img src={entry.favicon} style={{ width: 14, height: 14, borderRadius: 2 }} />
                : <div style={{ width: 14, height: 14, borderRadius: 2, background: 'var(--c-border)' }} />
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.title}
              </div>
              <div style={{ fontSize: 10, color: 'var(--c-warn)' }}>
                Wakes {entry.snoozeUntil ? new Date(entry.snoozeUntil).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
              </div>
            </div>
            <button
              onClick={() => send('UNSNOOZE_TAB', { tabId: entry.id })}
              style={{
                padding: '3px 8px', borderRadius: 4, border: '1px solid var(--c-border)',
                background: 'transparent', color: 'var(--c-muted)', fontSize: 10,
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              Wake
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

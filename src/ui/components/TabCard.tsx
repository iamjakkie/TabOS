import React, { useState } from 'react';
import type { TabEntry } from '../../store/types';
import { formatRelativeTime } from '../../shared/utils';

interface Props {
  entry: TabEntry;
  onRestore?: () => void;
  onVirtualize?: () => void;
  onSnooze?: () => void;
  onArchive?: () => void;
}

const STATE_DOT: Record<string, string> = {
  active:      '#34d399',
  virtualized: '#64748b',
  snoozed:     '#fbbf24',
  archived:    '#475569',
};

export default function TabCard({ entry, onRestore, onVirtualize, onSnooze, onArchive }: Props) {
  const [hovered, setHovered] = useState(false);
  const isVirt = entry.state === 'virtualized' || entry.state === 'archived';
  const dot = STATE_DOT[entry.state] ?? '#64748b';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={isVirt ? onRestore : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        cursor: isVirt ? 'pointer' : 'default',
        background: hovered ? 'var(--c-surface)' : 'transparent',
        borderRadius: 6,
        margin: '1px 4px',
        transition: 'background 0.1s',
        position: 'relative',
      }}
    >
      {/* State dot */}
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: dot, flexShrink: 0, marginTop: 1,
      }} />

      {/* Favicon */}
      <div style={{ width: 14, height: 14, flexShrink: 0 }}>
        {entry.favicon
          ? <img src={entry.favicon} style={{ width: 14, height: 14, borderRadius: 2 }} />
          : <div style={{ width: 14, height: 14, borderRadius: 2, background: 'var(--c-border)' }} />
        }
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 500,
          color: isVirt ? 'var(--c-muted)' : 'var(--c-text)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {entry.title || entry.url}
        </div>
        <div style={{ fontSize: 10, color: 'var(--c-muted)', display: 'flex', gap: 6 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
            {entry.domain}
          </span>
          <span style={{ flexShrink: 0 }}>·</span>
          <span style={{ flexShrink: 0 }}>{formatRelativeTime(entry.lastActiveAt)}</span>
        </div>
      </div>

      {/* Action buttons (on hover) */}
      {hovered && (
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {isVirt && onRestore && (
            <ActionBtn color="var(--c-accent)" title="Open" onClick={onRestore}>↗</ActionBtn>
          )}
          {entry.state === 'active' && onVirtualize && (
            <ActionBtn color="var(--c-muted)" title="Free memory" onClick={onVirtualize}>⊟</ActionBtn>
          )}
          {onSnooze && (
            <ActionBtn color="var(--c-warn)" title="Snooze 1 day" onClick={onSnooze}>◷</ActionBtn>
          )}
          {onArchive && (
            <ActionBtn color="var(--c-danger)" title="Archive" onClick={onArchive}>×</ActionBtn>
          )}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ children, color, title, onClick }: {
  children: React.ReactNode; color: string; title: string; onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 20, height: 20, borderRadius: 4,
        background: color + '20', color, border: `1px solid ${color}40`,
        fontSize: 12, lineHeight: 1, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

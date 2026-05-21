import React from 'react';
import type { Workspace } from '../../store/types';

interface Props {
  workspace: Workspace;
  isActive?: boolean;
  tabCount?: number;
  onClick?: () => void;
}

// Maps Chrome tabGroup colors → hex
const COLOR_HEX: Record<string, string> = {
  blue:   '#6366f1',
  red:    '#f87171',
  yellow: '#fbbf24',
  green:  '#34d399',
  pink:   '#f472b6',
  purple: '#a78bfa',
  cyan:   '#22d3ee',
  orange: '#fb923c',
};

export default function WorkspaceChip({ workspace, isActive, tabCount, onClick }: Props) {
  const color = COLOR_HEX[workspace.color] ?? '#6366f1';

  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        borderRadius: 99,
        border: isActive ? `1.5px solid ${color}` : '1.5px solid var(--c-border)',
        background: isActive ? color + '18' : 'transparent',
        color: isActive ? color : 'var(--c-muted)',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        transition: 'all 0.15s',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {workspace.icon && <span>{workspace.icon}</span>}
      {workspace.name}
      {tabCount !== undefined && (
        <span style={{
          fontSize: 9, fontWeight: 700,
          background: isActive ? color + '30' : 'var(--c-surface)',
          color: isActive ? color : 'var(--c-muted)',
          borderRadius: 99, padding: '0 5px', lineHeight: '16px',
        }}>
          {tabCount}
        </span>
      )}
    </button>
  );
}

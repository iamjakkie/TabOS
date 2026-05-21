import React, { useState, useMemo } from 'react';
import { useTabOSStore } from '../store';
import TabCard from '../components/TabCard';
import { search, buildIndex } from '../../search/fuzzy';
import type { TabEntry } from '../../store/types';

export default function SearchView() {
  const { tabs } = useTabOSStore();
  const [query, setQuery] = useState('');

  useMemo(() => buildIndex(tabs), [tabs]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return search(query, 30);
  }, [query, tabs]);

  function send(type: string, payload: Record<string, unknown>) {
    chrome.runtime.sendMessage({ type, payload });
  }

  const actions = (entry: TabEntry) => ({
    onRestore:    () => send('RESTORE_TAB',    { tabId: entry.id }),
    onVirtualize: () => send('VIRTUALIZE_TAB', { tabId: entry.id }),
    onSnooze:     () => send('SNOOZE_TAB',     { tabId: entry.id, rule: { type: 'duration', durationMs: 86_400_000 } }),
    onArchive:    () => send('ARCHIVE_TAB',    { tabId: entry.id }),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--c-border)' }}>
        <input
          autoFocus
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Search ${tabs.length} tabs…`}
          style={{
            width: '100%', padding: '7px 12px', borderRadius: 6,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            color: 'var(--c-text)', fontSize: 12, outline: 'none',
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {query && results.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--c-muted)', fontSize: 12 }}>
            No results for "{query}"
          </div>
        )}
        {results.map(({ entry }) => (
          <TabCard key={entry.id} entry={entry} {...actions(entry)} />
        ))}
      </div>
    </div>
  );
}

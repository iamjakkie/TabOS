import React, { useEffect, useState } from 'react';
import type { TabEntry } from '../../store/types';

const S = {
  wrap: { width: 260, background: 'var(--c-bg)', color: 'var(--c-text)', fontFamily: '-apple-system, BlinkMacSystemFont, Inter, sans-serif', WebkitFontSmoothing: 'antialiased' } as React.CSSProperties,
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 8px', borderBottom: '1px solid var(--c-border)' } as React.CSSProperties,
  logo: { fontWeight: 700, fontSize: 14, letterSpacing: '-0.3px', color: '#818cf8' } as React.CSSProperties,
  link: { fontSize: 10, color: 'var(--c-muted)', background: 'none', border: 'none', cursor: 'pointer' } as React.CSSProperties,
  body: { padding: '10px 12px 12px' } as React.CSSProperties,
  tabTitle: { fontSize: 11, color: 'var(--c-muted)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  row: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
};

const SNOOZE_OPTIONS = [
  { label: 'Snooze 1 hour',  ms: 3_600_000 },
  { label: 'Snooze 1 day',   ms: 86_400_000 },
  { label: 'Snooze 1 week',  ms: 7 * 86_400_000 },
];

export default function Popup() {
  const [currentTab, setCurrentTab] = useState<TabEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
      if (!tab?.id) { setLoading(false); return; }
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      if (response?.type === 'STATE_RESPONSE') {
        setCurrentTab(response.payload.tabs.find((t: TabEntry) => t.chromeTabId === tab.id) ?? null);
      }
      setLoading(false);
    });
  }, []);

  async function snooze(ms: number) {
    if (!currentTab) return;
    await chrome.runtime.sendMessage({
      type: 'SNOOZE_TAB',
      payload: { tabId: currentTab.id, rule: { type: 'duration', durationMs: ms } },
    });
    flash('Snoozed ◷');
  }

  async function virtualize() {
    if (!currentTab) return;
    await chrome.runtime.sendMessage({ type: 'VIRTUALIZE_TAB', payload: { tabId: currentTab.id } });
    flash('Tab freed ⊟');
  }

  async function openSidePanel() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId) await chrome.sidePanel.open({ windowId: tab.windowId });
    window.close();
  }

  function flash(msg: string) {
    setFeedback(msg);
    setTimeout(() => window.close(), 1000);
  }

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <span style={S.logo}>TabOS</span>
        <button onClick={openSidePanel} style={S.link}>Open panel →</button>
      </div>

      <div style={S.body}>
        {loading ? (
          <div style={{ color: 'var(--c-muted)', fontSize: 11, padding: '8px 0' }}>Loading…</div>
        ) : feedback ? (
          <div style={{ color: 'var(--c-success)', fontSize: 12, padding: '12px 0', textAlign: 'center', fontWeight: 600 }}>{feedback}</div>
        ) : currentTab ? (
          <>
            <div style={S.tabTitle}>{currentTab.title}</div>
            <div style={S.row}>
              {SNOOZE_OPTIONS.map(opt => (
                <QuickBtn key={opt.ms} color="var(--c-warn)" onClick={() => snooze(opt.ms)}>
                  {opt.label}
                </QuickBtn>
              ))}
              <QuickBtn color="var(--c-accent)" onClick={virtualize}>
                Free memory (virtualize)
              </QuickBtn>
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--c-muted)', fontSize: 11, padding: '8px 0' }}>
            This tab isn't tracked by TabOS yet.
          </div>
        )}
      </div>
    </div>
  );
}

function QuickBtn({ children, color, onClick }: { children: React.ReactNode; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 10px', borderRadius: 6, border: `1px solid ${color}40`,
        background: color + '18', color, fontSize: 11, fontWeight: 600,
        cursor: 'pointer', textAlign: 'left',
      }}
    >
      {children}
    </button>
  );
}

import React, { useState } from 'react';
import { useTabOSStore } from '../store';
import type { UserPrefs } from '../../store/types';

interface Diagnostics {
  chromeTabsTotal: number;
  chromeTabsSkipped: number;
  chromeTabsImportable: number;
  storedTotal: number;
  storedByState: Record<string, number>;
}

export default function SettingsView() {
  const { prefs } = useTabOSStore();
  const [local, setLocal] = useState<UserPrefs>(prefs);
  const [saved, setSaved] = useState(false);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [syncing, setSyncing] = useState(false);

  function set<K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) {
    setLocal(p => ({ ...p, [key]: value }));
    setSaved(false);
  }

  async function save() {
    await chrome.runtime.sendMessage({ type: 'SAVE_PREFS', payload: local });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function runDiagnostics() {
    const result = await chrome.runtime.sendMessage({ type: 'GET_DIAGNOSTICS' });
    setDiag(result);
  }

  async function forceSync() {
    setSyncing(true);
    await chrome.runtime.sendMessage({ type: 'FORCE_SYNC' });
    await runDiagnostics();
    setSyncing(false);
  }

  return (
    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Section label="Memory Budget">
        <Row label="Max active tabs">
          <NumInput value={local.maxActiveTabs} min={5} max={500} onChange={v => set('maxActiveTabs', v)} />
        </Row>
        <Row label="Decay after (days)">
          <NumInput value={local.defaultDecayDays} min={1} max={90} onChange={v => set('defaultDecayDays', v)} />
        </Row>
      </Section>

      <Section label="Digest">
        <Row label="Frequency">
          <SelectInput
            value={local.digestFrequency}
            options={[{ v: 'daily', l: 'Daily' }, { v: 'weekly', l: 'Weekly' }, { v: 'manual', l: 'Manual' }]}
            onChange={v => set('digestFrequency', v as UserPrefs['digestFrequency'])}
          />
        </Row>
      </Section>

      <button
        onClick={save}
        style={{
          padding: '8px', borderRadius: 6, border: 'none',
          background: saved ? 'var(--c-success)' : 'var(--c-accent)',
          color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          transition: 'background 0.2s',
        }}
      >
        {saved ? '✓ Saved' : 'Save Settings'}
      </button>

      <Section label="Diagnostics">
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={runDiagnostics}
            style={{ flex: 1, padding: '6px', borderRadius: 5, border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-text)', fontSize: 11, cursor: 'pointer' }}
          >
            Check counts
          </button>
          <button
            onClick={forceSync}
            disabled={syncing}
            style={{ flex: 1, padding: '6px', borderRadius: 5, border: '1px solid var(--c-accent)', background: 'var(--c-accent)22', color: 'var(--c-accent)', fontSize: 11, cursor: 'pointer', opacity: syncing ? 0.6 : 1 }}
          >
            {syncing ? 'Syncing…' : 'Force sync'}
          </button>
        </div>
        {diag && (
          <div style={{ fontSize: 11, color: 'var(--c-muted)', display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
            <DiagRow label="Chrome tabs found" value={diag.chromeTabsTotal} />
            <DiagRow label="Skipped (chrome:// etc)" value={diag.chromeTabsSkipped} accent="var(--c-muted)" />
            <DiagRow label="Importable" value={diag.chromeTabsImportable} accent="var(--c-success)" />
            <DiagRow label="In TabOS" value={diag.storedTotal} accent="var(--c-accent)" />
            {Object.entries(diag.storedByState).map(([state, count]) => (
              <DiagRow key={state} label={`  → ${state}`} value={count as number} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-muted)', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--c-surface)', borderRadius: 8, padding: '10px 12px' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--c-text)' }}>{label}</span>
      {children}
    </div>
  );
}

function NumInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number" value={value} min={min} max={max}
      onChange={e => onChange(Number(e.target.value))}
      style={{
        width: 60, padding: '3px 8px', borderRadius: 4,
        background: 'var(--c-surface-2)', border: '1px solid var(--c-border)',
        color: 'var(--c-text)', fontSize: 12, textAlign: 'right',
      }}
    />
  );
}

function DiagRow({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      <span style={{ fontWeight: 600, color: accent ?? 'var(--c-text)' }}>{value}</span>
    </div>
  );
}

function SelectInput({ value, options, onChange }: {
  value: string;
  options: { v: string; l: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '3px 6px', borderRadius: 4,
        background: 'var(--c-surface-2)', border: '1px solid var(--c-border)',
        color: 'var(--c-text)', fontSize: 12,
      }}
    >
      {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

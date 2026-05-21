import React, { useState } from 'react';
import { useTabOSStore } from '../store';
import type { UserPrefs } from '../../store/types';

export default function SettingsView() {
  const { prefs } = useTabOSStore();
  const [local, setLocal] = useState<UserPrefs>(prefs);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) {
    setLocal(p => ({ ...p, [key]: value }));
    setSaved(false);
  }

  async function save() {
    await chrome.runtime.sendMessage({ type: 'SAVE_PREFS', payload: local });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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

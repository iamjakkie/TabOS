import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BrowserTab } from '../shared/browser';
import type { StudyPath, StudyResourceType, StudyUnitKind } from '../shared/study';
import { detectResourceType } from './detect-resource';

const RESOURCE_TYPES: StudyResourceType[] = ['book', 'pdf', 'article', 'video', 'course', 'tab', 'checkpoint'];
const UNIT_BY_TYPE: Record<StudyResourceType, StudyUnitKind> = {
  book: 'pages', pdf: 'pages', article: 'items', video: 'minutes', course: 'lessons', tab: 'items', checkpoint: 'binary',
};

const NEW_PATH = '__new__';

// A lightweight popover for adding the current page to a study path without
// leaving the browser. Reads the active tab, guesses a resource type, lets the
// user pick (or create) a path, and optionally re-runs the AI arranger so the
// new tile lands in the right place in the graph.
export function QuickAddToStudy({ active, onClose }: { active: BrowserTab | undefined; onClose: () => void }) {
  const [paths, setPaths] = useState<StudyPath[]>([]);
  const [pathId, setPathId] = useState<string>('');
  const [newPathTitle, setNewPathTitle] = useState('');
  const [title, setTitle] = useState(active?.title ?? '');
  const [resourceType, setResourceType] = useState<StudyResourceType>(detectResourceType(active?.url ?? '', active?.title ?? ''));
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void window.study.listPaths().then((listed) => {
      setPaths(listed.map((entry) => entry.path));
      setPathId((current) => current || listed[0]?.path.id || NEW_PATH);
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [onClose]);

  const canSave = useMemo(
    () => title.trim().length > 0 && (pathId !== NEW_PATH || newPathTitle.trim().length > 0),
    [title, pathId, newPathTitle],
  );

  async function save(arrange: boolean) {
    if (!canSave) return;
    setStatus('saving');
    try {
      let targetPathId = pathId;
      if (pathId === NEW_PATH) {
        const created = await window.study.createPath({ title: newPathTitle.trim() });
        targetPathId = created.id;
      }
      const unitKind = UNIT_BY_TYPE[resourceType];
      await window.study.addNode({
        pathId: targetPathId,
        resource: {
          resourceType,
          title: title.trim(),
          sourceUrl: active?.url ?? null,
          unitKind,
        },
      });
      if (arrange) await window.study.planWithAI(targetPathId);
      setStatus('done');
      const pathName = pathId === NEW_PATH ? newPathTitle.trim() : paths.find((p) => p.id === targetPathId)?.title ?? 'path';
      setMessage(`Added to “${pathName}”${arrange ? ' and arranged' : ''}.`);
      setTimeout(onClose, 900);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Could not add resource.');
    }
  }

  return (
    <div className="quick-add" ref={rootRef}>
      <div className="quick-add-head">
        <span className="quick-add-title">Add to a learning path</span>
        <button className="quick-add-close" onClick={onClose}>×</button>
      </div>

      <div className="quick-add-page">
        {active?.favicon ? <img src={active.favicon} alt="" /> : <span className="quick-add-glyph">◦</span>}
        <span className="quick-add-host">{safeHost(active?.url ?? '')}</span>
      </div>

      <label className="quick-add-field">
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resource title" autoFocus />
      </label>

      <div className="quick-add-row">
        <label className="quick-add-field">
          <span>Type</span>
          <select value={resourceType} onChange={(e) => setResourceType(e.target.value as StudyResourceType)}>
            {RESOURCE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="quick-add-field">
          <span>Path</span>
          <select value={pathId} onChange={(e) => setPathId(e.target.value)}>
            {paths.map((path) => <option key={path.id} value={path.id}>{path.title}</option>)}
            <option value={NEW_PATH}>＋ New path…</option>
          </select>
        </label>
      </div>

      {pathId === NEW_PATH && (
        <label className="quick-add-field">
          <span>New path title</span>
          <input value={newPathTitle} onChange={(e) => setNewPathTitle(e.target.value)} placeholder="e.g. Kalman Filtering for UAV Navigation" />
        </label>
      )}

      {message && <p className={`quick-add-message ${status}`}>{message}</p>}

      <div className="quick-add-actions">
        <button className="ghost" onClick={onClose} disabled={status === 'saving'}>Cancel</button>
        <button className="ghost" onClick={() => void save(false)} disabled={!canSave || status === 'saving'}>Add</button>
        <button className="primary" onClick={() => void save(true)} disabled={!canSave || status === 'saving'}>
          {status === 'saving' ? 'Adding…' : '✦ Add & arrange'}
        </button>
      </div>
    </div>
  );
}

function safeHost(url: string): string { try { return new URL(url).hostname; } catch { return url || 'current page'; } }

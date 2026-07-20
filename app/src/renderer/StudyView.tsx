import React, { useCallback, useEffect, useState } from 'react';
import type {
  StudyDeliverableType, StudyPath, StudyPathDetail, StudyPathStats,
  StudyResourceType, StudyUnitKind,
} from '../shared/study';

type PathSummary = { path: StudyPath; stats: StudyPathStats };

const RESOURCE_TYPES: StudyResourceType[] = ['book', 'pdf', 'article', 'video', 'course', 'tab', 'checkpoint'];
const UNIT_BY_TYPE: Record<StudyResourceType, StudyUnitKind> = {
  book: 'pages', pdf: 'pages', article: 'items', video: 'minutes', course: 'lessons', tab: 'items', checkpoint: 'binary',
};

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function StudyView() {
  const [paths, setPaths] = useState<PathSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StudyPathDetail | null>(null);
  const [creating, setCreating] = useState(false);

  const refreshPaths = useCallback(async () => {
    const listed = await window.study.listPaths();
    setPaths(listed);
    return listed;
  }, []);

  const refreshDetail = useCallback(async (pathId: string) => {
    setDetail(await window.study.getPathDetail(pathId));
  }, []);

  useEffect(() => { void refreshPaths(); }, [refreshPaths]);
  useEffect(() => { if (selectedId) void refreshDetail(selectedId); }, [selectedId, refreshDetail]);

  async function createPath(title: string, description: string) {
    const created = await window.study.createPath({
      title: title.trim(),
      description: description.trim() || null,
    });
    setCreating(false);
    await refreshPaths();
    setSelectedId(created.id);
  }

  async function exportStudy() {
    const data = await window.study.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tabos-study-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (selectedId && detail) {
    return (
      <StudyPathView
        detail={detail}
        onBack={() => { setSelectedId(null); void refreshPaths(); }}
        onChanged={async () => { await refreshDetail(selectedId); await refreshPaths(); }}
      />
    );
  }

  return (
    <div className="study-view">
      <div className="study-toolbar">
        <h2>Learning paths</h2>
        <div className="study-toolbar-actions">
          <button onClick={() => void exportStudy()} className="ghost">Export JSON</button>
          <button onClick={() => setCreating((v) => !v)} className="primary">＋ New path</button>
        </div>
      </div>

      {creating && <NewPathForm onCancel={() => setCreating(false)} onCreate={createPath} />}

      {paths.length === 0 && !creating ? (
        <p className="study-empty">No learning paths yet. Create one to start tracking books, courses, videos, and checkpoints.</p>
      ) : (
        <div className="study-path-grid">
          {paths.map(({ path, stats }) => (
            <button key={path.id} className="study-path-card" onClick={() => setSelectedId(path.id)}>
              <strong>{path.title}</strong>
              <div className="study-progress-bar"><span style={{ width: `${Math.round(stats.overallFraction * 100)}%` }} /></div>
              <small>
                {stats.completedNodes}/{stats.totalNodes} done · {formatDuration(stats.totalTimeSeconds)} logged · {stats.sessionCount} sessions
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NewPathForm({ onCreate, onCancel }: {
  onCreate: (title: string, description: string) => Promise<void>; onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  return (
    <form
      className="study-form"
      onSubmit={(event) => { event.preventDefault(); if (title.trim()) void onCreate(title, description); }}
    >
      <label>
        <span>Path title</span>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Kalman Filtering for UAV Navigation" />
      </label>
      <label>
        <span>Description (optional)</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this path for?" />
      </label>
      <div className="study-form-actions">
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={!title.trim()}>Create path</button>
      </div>
    </form>
  );
}

function StudyPathView({ detail, onBack, onChanged }: {
  detail: StudyPathDetail; onBack: () => void; onChanged: () => Promise<void>;
}) {
  const { path, nodes, stats } = detail;
  const [addingResource, setAddingResource] = useState(false);
  const [sessionNodeId, setSessionNodeId] = useState<string | null>(null);

  async function bumpProgress(nodeId: string, delta: number) {
    await window.study.recordProgress({ nodeId, unitsDelta: delta });
    await onChanged();
  }

  async function complete(nodeId: string) {
    await window.study.recordProgress({ nodeId, completionState: 'completed' });
    await onChanged();
  }

  return (
    <div className="study-view">
      <div className="study-toolbar">
        <button className="ghost" onClick={onBack}>← Paths</button>
        <h2>{path.title}</h2>
        <button className="primary" onClick={() => setAddingResource((v) => !v)}>＋ Resource</button>
      </div>

      <div className="study-stats-header">
        <Stat label="Nodes" value={`${stats.completedNodes}/${stats.totalNodes}`} />
        <Stat label="Overall" value={`${Math.round(stats.overallFraction * 100)}%`} />
        <Stat label="Time" value={formatDuration(stats.totalTimeSeconds)} />
        <Stat label="Sessions" value={String(stats.sessionCount)} />
      </div>

      {addingResource && (
        <AddResourceForm
          pathId={path.id}
          onCancel={() => setAddingResource(false)}
          onAdded={async () => { setAddingResource(false); await onChanged(); }}
        />
      )}

      {nodes.length === 0 && !addingResource ? (
        <p className="study-empty">No resources yet. Add a book, course, video, article, or checkpoint.</p>
      ) : (
        <div className="study-node-list">
          {nodes.map(({ node, resource, progress }) => (
            <article key={node.id} className={`study-node ${progress.completionState}`}>
              <div className="study-node-head">
                <span className={`study-type-badge ${resource.resourceType}`}>{resource.resourceType}</span>
                <strong>{node.titleOverride ?? resource.title}</strong>
              </div>
              <div className="study-progress-bar"><span style={{ width: `${Math.round(progress.fraction * 100)}%` }} /></div>
              <small className="study-node-meta">
                {progress.totalUnits != null
                  ? `${progress.unitsCompleted}/${progress.totalUnits} ${resource.unitKind ?? 'units'}`
                  : progress.completionState === 'completed' ? 'completed'
                  : `${progress.unitsCompleted} ${resource.unitKind ?? 'units'}`}
              </small>
              <div className="study-node-actions">
                {resource.unitKind !== 'binary' && <button onClick={() => void bumpProgress(node.id, 1)}>+1</button>}
                {resource.unitKind !== 'binary' && <button onClick={() => void bumpProgress(node.id, 10)}>+10</button>}
                {progress.completionState !== 'completed' && <button onClick={() => void complete(node.id)}>Done</button>}
                <button onClick={() => setSessionNodeId((id) => (id === node.id ? null : node.id))}>Log session</button>
              </div>
              {sessionNodeId === node.id && (
                <LogSessionForm
                  pathId={path.id}
                  nodeId={node.id}
                  onCancel={() => setSessionNodeId(null)}
                  onLogged={async () => { setSessionNodeId(null); await onChanged(); }}
                />
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function AddResourceForm({ pathId, onAdded, onCancel }: {
  pathId: string; onAdded: () => Promise<void>; onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [resourceType, setResourceType] = useState<StudyResourceType>('book');
  const [sourceUrl, setSourceUrl] = useState('');
  const [totalUnits, setTotalUnits] = useState('');
  const unitKind = UNIT_BY_TYPE[resourceType];

  async function submit() {
    if (!title.trim()) return;
    const parsed = Number(totalUnits);
    await window.study.addNode({
      pathId,
      resource: {
        resourceType,
        title: title.trim(),
        sourceUrl: sourceUrl.trim() || null,
        unitKind,
        totalUnits: unitKind !== 'binary' && totalUnits && Number.isFinite(parsed) ? parsed : null,
      },
    });
    await onAdded();
  }

  return (
    <form className="study-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label>
        <span>Title</span>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resource title" />
      </label>
      <div className="study-form-row">
        <label>
          <span>Type</span>
          <select value={resourceType} onChange={(e) => setResourceType(e.target.value as StudyResourceType)}>
            {RESOURCE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        {unitKind !== 'binary' && (
          <label>
            <span>Total {unitKind} (optional)</span>
            <input type="number" min="0" value={totalUnits} onChange={(e) => setTotalUnits(e.target.value)} placeholder="0" />
          </label>
        )}
      </div>
      <label>
        <span>Source URL (optional)</span>
        <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
      </label>
      <div className="study-form-actions">
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={!title.trim()}>Add resource</button>
      </div>
    </form>
  );
}

function LogSessionForm({ pathId, nodeId, onLogged, onCancel }: {
  pathId: string; nodeId: string; onLogged: () => Promise<void>; onCancel: () => void;
}) {
  const [minutes, setMinutes] = useState('30');
  const [deliverableType, setDeliverableType] = useState<StudyDeliverableType>('takeaway');
  const [content, setContent] = useState('');

  async function submit() {
    const parsed = Number(minutes);
    if (!parsed || !Number.isFinite(parsed) || parsed <= 0) return;
    await window.study.logSession({
      pathId,
      nodeId,
      durationSeconds: Math.round(parsed * 60),
      deliverable: content.trim() ? { deliverableType, content: content.trim() } : null,
    });
    await onLogged();
  }

  return (
    <form className="study-form study-session-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div className="study-form-row">
        <label>
          <span>Minutes studied</span>
          <input autoFocus type="number" min="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </label>
        <label>
          <span>Proof type</span>
          <select value={deliverableType} onChange={(e) => setDeliverableType(e.target.value as StudyDeliverableType)}>
            {(['takeaway', 'note', 'exercise', 'code', 'summary'] as StudyDeliverableType[]).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <label>
        <span>Key takeaway / proof (optional)</span>
        <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="What did you learn or produce?" />
      </label>
      <div className="study-form-actions">
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary">Log session</button>
      </div>
    </form>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="study-stat"><span>{label}</span><strong>{value}</strong></div>;
}

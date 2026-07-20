import React, { useCallback, useEffect, useState } from 'react';
import type {
  StudyPath, StudyPathDetail, StudyPathStats, StudyResourceType, StudyUnitKind,
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

  async function createPath() {
    const title = window.prompt('New learning path title');
    if (!title?.trim()) return;
    const created = await window.study.createPath({ title: title.trim() });
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
          <button onClick={() => void createPath()} className="primary">＋ New path</button>
        </div>
      </div>
      {paths.length === 0 ? (
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

function StudyPathView({ detail, onBack, onChanged }: {
  detail: StudyPathDetail; onBack: () => void; onChanged: () => Promise<void>;
}) {
  const { path, nodes, stats } = detail;

  async function addResource() {
    const title = window.prompt('Resource title (book, video, article, course, checkpoint…)');
    if (!title?.trim()) return;
    const type = (window.prompt(`Type: ${RESOURCE_TYPES.join(', ')}`, 'book') ?? 'book').trim() as StudyResourceType;
    const resourceType = RESOURCE_TYPES.includes(type) ? type : 'article';
    const unitKind = UNIT_BY_TYPE[resourceType];
    let totalUnits: number | null = null;
    if (unitKind !== 'binary') {
      const raw = window.prompt(`Total ${unitKind} (optional)`, '');
      totalUnits = raw && Number.isFinite(Number(raw)) ? Number(raw) : null;
    }
    await window.study.addNode({ pathId: path.id, resource: { resourceType, title: title.trim(), unitKind, totalUnits } });
    await onChanged();
  }

  async function bumpProgress(nodeId: string, delta: number) {
    await window.study.recordProgress({ nodeId, unitsDelta: delta });
    await onChanged();
  }

  async function complete(nodeId: string) {
    await window.study.recordProgress({ nodeId, completionState: 'completed' });
    await onChanged();
  }

  async function logSession(nodeId: string) {
    const raw = window.prompt('Minutes studied', '30');
    const minutes = raw && Number.isFinite(Number(raw)) ? Number(raw) : 0;
    if (minutes <= 0) return;
    const takeaway = window.prompt('Key takeaway / proof (optional)', '') ?? '';
    await window.study.logSession({
      pathId: path.id,
      nodeId,
      durationSeconds: Math.round(minutes * 60),
      deliverable: takeaway.trim() ? { deliverableType: 'takeaway', content: takeaway.trim() } : null,
    });
    await onChanged();
  }

  return (
    <div className="study-view">
      <div className="study-toolbar">
        <button className="ghost" onClick={onBack}>← Paths</button>
        <h2>{path.title}</h2>
        <button className="primary" onClick={() => void addResource()}>＋ Resource</button>
      </div>

      <div className="study-stats-header">
        <Stat label="Nodes" value={`${stats.completedNodes}/${stats.totalNodes}`} />
        <Stat label="Overall" value={`${Math.round(stats.overallFraction * 100)}%`} />
        <Stat label="Time" value={formatDuration(stats.totalTimeSeconds)} />
        <Stat label="Sessions" value={String(stats.sessionCount)} />
      </div>

      {nodes.length === 0 ? (
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
                <button onClick={() => void logSession(node.id)}>Log session</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="study-stat"><span>{label}</span><strong>{value}</strong></div>;
}

import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { StudyPathDetail } from '../shared/study';

const TILE_W = 210;
const TILE_H = 120;

type Node = StudyPathDetail['nodes'][number];

interface Props {
  detail: StudyPathDetail;
  onMoveNode: (nodeId: string, x: number, y: number) => void;
  onAddEdge: (sourceNodeId: string, targetNodeId: string) => void;
  onRemoveEdge: (edgeId: string) => void;
  onBump: (nodeId: string, delta: number) => void;
  onComplete: (nodeId: string) => void;
  onLogSession: (nodeId: string) => void;
}

export function StudyGraphCanvas({ detail, onMoveNode, onAddEdge, onRemoveEdge, onBump, onComplete, onLogSession }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [panning, setPanning] = useState<{ x: number; y: number } | null>(null);
  // Live drag positions overlay the persisted coordinates for smoothness.
  const [drag, setDrag] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [linking, setLinking] = useState<{ sourceId: string; x: number; y: number } | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const posOf = useCallback((node: Node): { x: number; y: number } => {
    if (drag && drag.nodeId === node.node.id) return { x: drag.x, y: drag.y };
    return { x: node.node.canvasX ?? 40, y: node.node.canvasY ?? 40 };
  }, [drag]);

  const byId = useMemo(() => new Map(detail.nodes.map((n) => [n.node.id, n])), [detail.nodes]);

  function toCanvas(clientX: number, clientY: number): { x: number; y: number } {
    const rect = stageRef.current?.getBoundingClientRect();
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    return {
      x: (clientX - left - transform.x) / transform.scale,
      y: (clientY - top - transform.y) / transform.scale,
    };
  }

  return (
    <div
      ref={stageRef}
      className="study-canvas"
      onWheel={(event) => {
        event.preventDefault();
        // Damp + clamp per-event zoom so a fast trackpad flick can't zoom to
        // invisible in one gesture.
        const delta = Math.max(-40, Math.min(40, event.deltaY));
        const factor = Math.exp(-delta * 0.0018);
        setTransform((t) => ({ ...t, scale: Math.max(0.4, Math.min(2.2, t.scale * factor)) }));
      }}
      onPointerDown={(event) => {
        // Pan when the press does not land on an interactive element (a tile,
        // its link handle, or an edge hit-area). The transformed world layer
        // covers the whole canvas, so we can't rely on target === currentTarget.
        const target = event.target as HTMLElement;
        if (target.closest('.study-tile, .study-link-handle, .study-edge-hit')) return;
        setSelectedNode(null);
        setPanning({ x: event.clientX - transform.x, y: event.clientY - transform.y });
      }}
      onPointerMove={(event) => {
        if (panning) setTransform((t) => ({ ...t, x: event.clientX - panning.x, y: event.clientY - panning.y }));
        if (drag) { const p = toCanvas(event.clientX, event.clientY); setDrag({ ...drag, x: p.x - TILE_W / 2, y: p.y - TILE_H / 2 }); }
        if (linking) { const p = toCanvas(event.clientX, event.clientY); setLinking({ ...linking, x: p.x, y: p.y }); }
      }}
      onPointerUp={(event) => {
        setPanning(null);
        if (drag) { onMoveNode(drag.nodeId, Math.round(drag.x), Math.round(drag.y)); setDrag(null); }
        if (linking) {
          const target = (event.target as HTMLElement).closest('[data-node-id]');
          const targetId = target?.getAttribute('data-node-id');
          if (targetId && targetId !== linking.sourceId) onAddEdge(linking.sourceId, targetId);
          setLinking(null);
        }
      }}
      onPointerLeave={() => { setPanning(null); setDrag(null); setLinking(null); }}
    >
      <div className="study-canvas-grid" />
      <div className="study-canvas-world" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
        <svg className="study-canvas-edges">
          <defs>
            <marker id="study-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          {detail.edges.map((edge) => {
            const source = byId.get(edge.sourceNodeId);
            const target = byId.get(edge.targetNodeId);
            if (!source || !target) return null;
            const s = posOf(source); const t = posOf(target);
            const x1 = s.x + TILE_W; const y1 = s.y + TILE_H / 2;
            const x2 = t.x; const y2 = t.y + TILE_H / 2;
            const mx = (x1 + x2) / 2;
            return (
              <g key={edge.id} className={`study-edge ${edge.kind}`}>
                <path d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} markerEnd="url(#study-arrow)" />
                <path className="study-edge-hit" d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  onClick={() => { if (window.confirm('Remove this link?')) onRemoveEdge(edge.id); }} />
              </g>
            );
          })}
          {linking && byId.get(linking.sourceId) && (() => {
            const s = posOf(byId.get(linking.sourceId)!);
            return <path className="study-edge linking" d={`M ${s.x + TILE_W} ${s.y + TILE_H / 2} L ${linking.x} ${linking.y}`} />;
          })()}
        </svg>

        {detail.nodes.map((entry) => {
          const { node, resource, progress } = entry;
          const p = posOf(entry);
          return (
            <div
              key={node.id}
              data-node-id={node.id}
              className={`study-tile ${progress.completionState} ${selectedNode === node.id ? 'selected' : ''}`}
              style={{ left: p.x, top: p.y, width: TILE_W }}
              onPointerDown={(event) => {
                if ((event.target as HTMLElement).closest('.study-tile-actions, .study-link-handle')) return;
                event.stopPropagation();
                setSelectedNode(node.id);
                const pos = posOf(entry);
                setDrag({ nodeId: node.id, x: pos.x, y: pos.y });
              }}
            >
              {(() => { const label = node.titleOverride ?? resource.title; return (<>
              <div className="study-tile-head">
                <span className={`study-type-badge ${resource.resourceType}`}>{resource.resourceType}</span>
              </div>
              <strong
                className={`study-tile-title ${label.length > 64 ? 'xs' : label.length > 38 ? 's' : ''}`}
                title={label}
              >{label}</strong>
              </>); })()}
              <div className="study-progress-bar"><span style={{ width: `${Math.round(progress.fraction * 100)}%` }} /></div>
              <small className="study-node-meta">
                {progress.totalUnits != null
                  ? `${progress.unitsCompleted}/${progress.totalUnits} ${resource.unitKind ?? 'units'}`
                  : progress.completionState === 'completed' ? 'completed'
                  : `${progress.unitsCompleted} ${resource.unitKind ?? 'units'}`}
              </small>
              <div className="study-tile-actions">
                {resource.unitKind !== 'binary' && <button onClick={() => onBump(node.id, 1)}>+1</button>}
                {resource.unitKind !== 'binary' && <button onClick={() => onBump(node.id, 10)}>+10</button>}
                {progress.completionState !== 'completed' && <button onClick={() => onComplete(node.id)}>✓</button>}
                <button onClick={() => onLogSession(node.id)}>⏱</button>
              </div>
              <div
                className="study-link-handle"
                title="Drag to another tile to create a prerequisite link"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  const pos = posOf(entry);
                  setLinking({ sourceId: node.id, x: pos.x + TILE_W, y: pos.y + TILE_H / 2 });
                }}
              />
            </div>
          );
        })}
      </div>

      {detail.nodes.length === 0 && (
        <div className="study-canvas-empty">
          <strong>Empty path</strong>
          <span>Add or import resources — each tile lands on the canvas. Then hit “AI plan” to sequence them.</span>
        </div>
      )}
    </div>
  );
}

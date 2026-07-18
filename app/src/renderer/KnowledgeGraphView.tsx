import React, { useEffect, useMemo, useRef, useState } from 'react';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';
import type { BrowserPathEvent } from '../shared/browser';
import { projectVisitsToKnowledgeGraph, type KnowledgeGraphNode } from './knowledge-graph';

interface PositionedNode extends KnowledgeGraphNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface PositionedLink {
  source: string | PositionedNode;
  target: string | PositionedNode;
  type: 'navigated' | 'opened-from' | 'related';
  count: number;
}

export function KnowledgeGraphView({ path, onOpenUrl }: {
  path: BrowserPathEvent[];
  onOpenUrl: (url: string) => void;
}) {
  const graph = useMemo(() => projectVisitsToKnowledgeGraph(path), [path]);
  const [positions, setPositions] = useState<PositionedNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showNavigation, setShowNavigation] = useState(true);
  const [showBranches, setShowBranches] = useState(true);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [draggingCanvas, setDraggingCanvas] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const width = Math.max(680, svgRef.current?.clientWidth ?? 900);
    const height = Math.max(220, svgRef.current?.clientHeight ?? 300);
    const nodes: PositionedNode[] = graph.nodes.map((node, index) => ({
      ...node,
      x: width / 2 + Math.cos(index * 2.4) * Math.min(150, width / 4),
      y: height / 2 + Math.sin(index * 2.4) * Math.min(100, height / 3),
    }));
    const links: PositionedLink[] = graph.edges.map((edge) => ({ ...edge }));
    const simulation = forceSimulation(nodes)
      .force('link', forceLink<PositionedNode, PositionedLink>(links).id((node) => node.id).distance((link) => link.type === 'opened-from' ? 105 : 78).strength(.65))
      .force('charge', forceManyBody().strength(-260))
      .force('collide', forceCollide<PositionedNode>().radius((node) => 20 + Math.min(12, node.visitCount * 2)))
      .force('center', forceCenter(width / 2, height / 2))
      .alphaDecay(.045)
      .on('tick', () => setPositions(nodes.map((node) => ({ ...node }))));
    return () => { simulation.stop(); };
  }, [graph]);

  const positionedById = useMemo(() => new Map(positions.map((node) => [node.id, node])), [positions]);
  const links = graph.edges.filter((edge) => edge.type === 'opened-from' ? showBranches : showNavigation);
  const selected = positions.find((node) => node.id === selectedId) ?? null;
  const normalizedQuery = query.toLowerCase().trim();

  function resetView() {
    setTransform({ x: 0, y: 0, scale: 1 });
    setSelectedId(null);
  }

  return (
    <div className="knowledge-graph">
      <div className="graph-toolbar">
        <div className="graph-title"><strong>Knowledge graph</strong><span>{graph.nodes.length} pages · {graph.edges.length} connections</span></div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a node…" />
        <label><input type="checkbox" checked={showNavigation} onChange={(event) => setShowNavigation(event.target.checked)} /> navigation</label>
        <label><input type="checkbox" checked={showBranches} onChange={(event) => setShowBranches(event.target.checked)} /> opened from</label>
        <button onClick={resetView}>Reset view</button>
      </div>
      <div className="graph-stage">
        <svg
          ref={svgRef}
          onWheel={(event) => {
            event.preventDefault();
            const factor = event.deltaY > 0 ? .9 : 1.1;
            setTransform((current) => ({ ...current, scale: Math.max(.35, Math.min(2.6, current.scale * factor)) }));
          }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setDraggingCanvas({ x: event.clientX - transform.x, y: event.clientY - transform.y });
          }}
          onPointerMove={(event) => {
            if (draggingCanvas) setTransform((current) => ({ ...current, x: event.clientX - draggingCanvas.x, y: event.clientY - draggingCanvas.y }));
          }}
          onPointerUp={() => setDraggingCanvas(null)}
          onPointerLeave={() => setDraggingCanvas(null)}
        >
          <defs>
            <marker id="graph-arrow" viewBox="0 0 10 10" refX="16" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
          </defs>
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
            {links.map((edge) => {
              const source = positionedById.get(edge.source);
              const target = positionedById.get(edge.target);
              if (!source || !target) return null;
              return <line key={edge.id} className={`graph-edge ${edge.type}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} markerEnd="url(#graph-arrow)" />;
            })}
            {positions.map((node) => {
              const faded = normalizedQuery.length > 0 && !`${node.label} ${node.domain}`.toLowerCase().includes(normalizedQuery);
              const radius = 8 + Math.min(8, Math.sqrt(node.visitCount) * 3);
              return (
                <g key={node.id} className={`graph-node ${node.active ? 'active' : ''} ${selectedId === node.id ? 'selected' : ''} ${faded ? 'faded' : ''}`} transform={`translate(${node.x ?? 0} ${node.y ?? 0})`} onClick={(event) => { event.stopPropagation(); setSelectedId(node.id); }} onDoubleClick={() => node.url && onOpenUrl(node.url)}>
                  <circle r={radius} />
                  <text x={radius + 6} y="4">{truncate(node.label, 30)}</text>
                  {node.visitCount > 1 && <text className="node-count" x={-3} y="3">{node.visitCount}</text>}
                </g>
              );
            })}
          </g>
        </svg>
        {selected && <aside className="node-inspector"><span>Page</span><strong>{selected.label}</strong><small>{selected.domain}</small><p>{selected.visitCount} visit{selected.visitCount === 1 ? '' : 's'}</p><div><button onClick={() => selected.url && onOpenUrl(selected.url)}>Open page</button><button onClick={() => setSelectedId(null)}>Close</button></div></aside>}
        {graph.nodes.length === 0 && <div className="graph-empty"><strong>Your graph starts as you browse</strong><span>Pages and connections will accumulate here.</span></div>}
      </div>
      <div className="graph-legend"><span><i className="legend-page" /> page</span><span><i className="legend-active" /> current</span><span><i className="legend-nav" /> navigation</span><span><i className="legend-opened" /> opened in new tab</span><em>Scroll to zoom · drag empty space to pan · double-click node to open</em></div>
    </div>
  );
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

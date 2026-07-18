import type { BrowserPathEvent } from '../shared/browser';

export type KnowledgeNodeType = 'page' | 'note' | 'space' | 'person' | 'decision' | 'task';
export type KnowledgeEdgeType = 'navigated' | 'opened-from' | 'related';

export interface KnowledgeGraphNode {
  id: string;
  type: KnowledgeNodeType;
  label: string;
  url?: string;
  domain?: string;
  visitCount: number;
  active: boolean;
  lastVisitedAt: number;
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  type: KnowledgeEdgeType;
  count: number;
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export function canonicalPageUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = '';
    }
    if (url.pathname === '/' && !url.search) return `${url.protocol}//${url.host}`;
    return url.toString();
  } catch {
    return rawUrl.split('#', 1)[0] ?? rawUrl;
  }
}

export function projectVisitsToKnowledgeGraph(visits: BrowserPathEvent[]): KnowledgeGraph {
  const nodeByUrl = new Map<string, KnowledgeGraphNode>();
  const nodeIdByVisitId = new Map<string, string>();
  const edgeByKey = new Map<string, KnowledgeGraphEdge>();
  const latest = visits.reduce<BrowserPathEvent | undefined>(
    (current, visit) => !current || visit.visitedAt >= current.visitedAt ? visit : current,
    undefined,
  );
  const latestUrl = latest ? canonicalPageUrl(latest.url) : undefined;

  for (const visit of visits) {
    const url = canonicalPageUrl(visit.url);
    let node = nodeByUrl.get(url);
    if (!node) {
      let domain = '';
      try { domain = new URL(url).hostname; } catch { /* keep empty */ }
      node = {
        id: `page:${url}`,
        type: 'page',
        label: visit.title || domain || url,
        url,
        domain,
        visitCount: 0,
        active: url === latestUrl,
        lastVisitedAt: visit.visitedAt,
      };
      nodeByUrl.set(url, node);
    }
    node.visitCount += 1;
    if (visit.visitedAt >= node.lastVisitedAt) {
      node.lastVisitedAt = visit.visitedAt;
      node.label = visit.title || node.label;
    }
    node.active = url === latestUrl;
    nodeIdByVisitId.set(visit.id, node.id);
  }

  const visitById = new Map(visits.map((visit) => [visit.id, visit]));
  for (const visit of visits) {
    if (!visit.parentVisitId) continue;
    const parent = visitById.get(visit.parentVisitId);
    const source = nodeIdByVisitId.get(visit.parentVisitId);
    const target = nodeIdByVisitId.get(visit.id);
    if (!parent || !source || !target || source === target) continue;
    const type: KnowledgeEdgeType = parent.tabId === visit.tabId ? 'navigated' : 'opened-from';
    const key = `${source}\u0000${target}\u0000${type}`;
    const existing = edgeByKey.get(key);
    if (existing) existing.count += 1;
    else edgeByKey.set(key, { id: `edge:${key}`, source, target, type, count: 1 });
  }

  return { nodes: [...nodeByUrl.values()], edges: [...edgeByKey.values()] };
}

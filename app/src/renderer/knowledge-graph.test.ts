import { describe, expect, it } from 'vitest';
import { projectVisitsToKnowledgeGraph } from './knowledge-graph';
import type { BrowserPathEvent } from '../shared/browser';

const visits: BrowserPathEvent[] = [
  { id: 'v1', tabId: 'a', url: 'https://example.com/article#intro', title: 'Article', visitedAt: 1 },
  { id: 'v2', tabId: 'a', url: 'https://docs.example.com/guide', title: 'Guide', visitedAt: 2, parentVisitId: 'v1' },
  { id: 'v3', tabId: 'b', url: 'https://example.com/article#details', title: 'Article again', visitedAt: 3, parentVisitId: 'v2' },
];

describe('knowledge graph projection', () => {
  it('aggregates repeated visits to the same canonical page node', () => {
    const graph = projectVisitsToKnowledgeGraph(visits);
    const article = graph.nodes.find((node) => node.url === 'https://example.com/article');
    expect(article).toMatchObject({ type: 'page', visitCount: 2 });
    expect(graph.nodes).toHaveLength(2);
  });

  it('creates typed directed edges and aggregates repeat transitions', () => {
    const graph = projectVisitsToKnowledgeGraph(visits);
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'navigated', count: 1 }),
      expect.objectContaining({ type: 'opened-from', count: 1 }),
    ]));
  });

  it('marks the latest visited page as active', () => {
    const graph = projectVisitsToKnowledgeGraph(visits);
    expect(graph.nodes.find((node) => node.active)?.url).toBe('https://example.com/article');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StudyRepository } from './study-repository';
import { STUDY_SCHEMA_VERSION } from '../shared/study';

const files: string[] = [];

function tempFile(): string {
  const filename = path.join(os.tmpdir(), `tabos-study-${crypto.randomUUID()}.db`);
  files.push(filename);
  return filename;
}

async function fresh(): Promise<StudyRepository> {
  return StudyRepository.open(tempFile());
}

afterEach(() => {
  for (const filename of files.splice(0)) fs.rmSync(filename, { force: true });
});

describe('StudyRepository', () => {
  it('creates schema and records the current migration version', async () => {
    const repo = await fresh();
    expect(repo.schemaVersion()).toBe(STUDY_SCHEMA_VERSION);
    repo.close();
  });

  it('creates a path and lists it with zeroed stats', async () => {
    const repo = await fresh();
    const path1 = repo.createPath({ title: 'Kalman Filtering for UAV Navigation' });
    const listed = repo.listPaths();
    expect(listed).toHaveLength(1);
    expect(listed[0].path.id).toBe(path1.id);
    expect(listed[0].stats).toMatchObject({ totalNodes: 0, completedNodes: 0, sessionCount: 0 });
    repo.close();
  });

  it('attaches heterogeneous resources as nodes and persists across reopen', async () => {
    const filename = tempFile();
    let repo = await StudyRepository.open(filename);
    const p = repo.createPath({ title: 'Rust Systems Track' });
    repo.addNode({ pathId: p.id, resource: { resourceType: 'book', title: 'The Rust Programming Language', totalUnits: 20, unitKind: 'lessons' } });
    repo.addNode({ pathId: p.id, resource: { resourceType: 'video', title: 'Async Rust', totalUnits: 90, unitKind: 'minutes' } });
    repo.addNode({ pathId: p.id, resource: { resourceType: 'checkpoint', title: 'Build a CLI', unitKind: 'binary' } });
    repo.close();

    repo = await StudyRepository.open(filename);
    const detail = repo.getPathDetail(p.id);
    expect(detail?.nodes).toHaveLength(3);
    expect(detail?.nodes.map((n) => n.resource.resourceType)).toEqual(['book', 'video', 'checkpoint']);
    expect(detail?.nodes[0].node.position).toBe(0);
    repo.close();
  });

  it('derives node progress from append-only progress events', async () => {
    const repo = await fresh();
    const p = repo.createPath({ title: 'Advanced Linear Algebra' });
    const node = repo.addNode({ pathId: p.id, resource: { resourceType: 'book', title: 'Axler', totalUnits: 300, unitKind: 'pages' }, targetUnits: 300 });

    repo.recordProgress({ nodeId: node.id, unitsDelta: 40 });
    const progress = repo.recordProgress({ nodeId: node.id, unitsDelta: 60 });

    expect(progress.unitsCompleted).toBe(100);
    expect(progress.totalUnits).toBe(300);
    expect(progress.fraction).toBeCloseTo(100 / 300, 5);
    expect(progress.completionState).toBe('in_progress');
    repo.close();
  });

  it('marks a node completed and reflects it in path stats', async () => {
    const repo = await fresh();
    const p = repo.createPath({ title: 'Astrodynamics Foundations' });
    const node = repo.addNode({ pathId: p.id, resource: { resourceType: 'checkpoint', title: 'Orbital elements', unitKind: 'binary' } });

    repo.recordProgress({ nodeId: node.id, completionState: 'completed' });
    const detail = repo.getPathDetail(p.id);

    expect(detail?.nodes[0].progress.completionState).toBe('completed');
    expect(detail?.stats.completedNodes).toBe(1);
    expect(detail?.stats.totalNodes).toBe(1);
    expect(detail?.stats.overallFraction).toBeCloseTo(1, 5);
    repo.close();
  });

  it('logs a study session with a deliverable and aggregates time', async () => {
    const repo = await fresh();
    const p = repo.createPath({ title: 'Rust Systems Track' });
    const node = repo.addNode({ pathId: p.id, resource: { resourceType: 'course', title: 'Tokio', totalUnits: 12, unitKind: 'lessons' } });

    repo.logSession({ pathId: p.id, nodeId: node.id, durationSeconds: 1500, note: 'watched 2 lessons', deliverable: { deliverableType: 'takeaway', content: 'select! macro' } });
    repo.logSession({ pathId: p.id, nodeId: node.id, durationSeconds: 1200 });

    const detail = repo.getPathDetail(p.id);
    expect(detail?.stats.sessionCount).toBe(2);
    expect(detail?.stats.totalTimeSeconds).toBe(2700);
    expect(detail?.stats.lastStudiedAt).not.toBeNull();

    const exported = repo.exportAll();
    expect(exported.deliverables).toHaveLength(1);
    expect(exported.sessions).toHaveLength(2);
    repo.close();
  });

  it('places new nodes on the canvas without overlapping', async () => {
    const repo = await fresh();
    const p = repo.createPath({ title: 'Canvas layout' });
    const a = repo.addNode({ pathId: p.id, resource: { resourceType: 'book', title: 'A' } });
    const b = repo.addNode({ pathId: p.id, resource: { resourceType: 'book', title: 'B' } });
    expect(a.canvasX).not.toBeNull();
    expect(b.canvasX).not.toBeNull();
    expect(`${a.canvasX},${a.canvasY}`).not.toBe(`${b.canvasX},${b.canvasY}`);
    repo.close();
  });

  it('bulk-adds resources as nodes', async () => {
    const repo = await fresh();
    const p = repo.createPath({ title: 'Bulk import' });
    const nodes = repo.addResourcesBulk(p.id, [
      { resourceType: 'book', title: 'One' },
      { resourceType: 'video', title: 'Two', totalUnits: 30, unitKind: 'minutes' },
      { resourceType: 'checkpoint', title: 'Three', unitKind: 'binary' },
    ]);
    expect(nodes).toHaveLength(3);
    const detail = repo.getPathDetail(p.id);
    expect(detail?.nodes).toHaveLength(3);
    repo.close();
  });

  it('adds, dedupes, and removes lineage edges', async () => {
    const repo = await fresh();
    const p = repo.createPath({ title: 'Edges' });
    const a = repo.addNode({ pathId: p.id, resource: { resourceType: 'book', title: 'A' } });
    const b = repo.addNode({ pathId: p.id, resource: { resourceType: 'book', title: 'B' } });
    const edge = repo.addEdge({ pathId: p.id, sourceNodeId: a.id, targetNodeId: b.id });
    const dupe = repo.addEdge({ pathId: p.id, sourceNodeId: a.id, targetNodeId: b.id });
    expect(dupe.id).toBe(edge.id);
    expect(repo.getPathDetail(p.id)?.edges).toHaveLength(1);
    repo.removeEdge(edge.id);
    expect(repo.getPathDetail(p.id)?.edges).toHaveLength(0);
    repo.close();
  });

  it('updates a node canvas position', async () => {
    const repo = await fresh();
    const p = repo.createPath({ title: 'Move' });
    const a = repo.addNode({ pathId: p.id, resource: { resourceType: 'book', title: 'A' } });
    repo.updateNodePosition({ nodeId: a.id, canvasX: 123, canvasY: 456 });
    const detail = repo.getPathDetail(p.id);
    expect(detail?.nodes[0].node.canvasX).toBe(123);
    expect(detail?.nodes[0].node.canvasY).toBe(456);
    repo.close();
  });

  it('setPlan replaces edges and reorders nodes non-destructively', async () => {
    const repo = await fresh();
    const p = repo.createPath({ title: 'Plan' });
    const a = repo.addNode({ pathId: p.id, resource: { resourceType: 'book', title: 'Foundations' } });
    const b = repo.addNode({ pathId: p.id, resource: { resourceType: 'video', title: 'Applied' } });
    repo.addEdge({ pathId: p.id, sourceNodeId: b.id, targetNodeId: a.id });
    const detail = repo.setPlan({
      pathId: p.id,
      edges: [{ sourceNodeId: a.id, targetNodeId: b.id, kind: 'prereq' }],
      order: [a.id, b.id],
      layout: { [a.id]: { x: 40, y: 40 }, [b.id]: { x: 320, y: 40 } },
    });
    expect(detail?.edges).toHaveLength(1);
    expect(detail?.edges[0].sourceNodeId).toBe(a.id);
    expect(detail?.nodes[0].node.id).toBe(a.id);
    // Old edge is tombstoned, not deleted: still present in full export.
    const exported = repo.exportAll();
    expect(exported.edges.length).toBeGreaterThanOrEqual(2);
    expect(exported.edges.filter((e) => e.archivedAt == null)).toHaveLength(1);
    repo.close();
  });

  it('planWithAI chains same-topic tiles foundational-first without an API key', async () => {
    const prevA = process.env.ANTHROPIC_API_KEY;
    const prevO = process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    const repo = await fresh();
    const p = repo.createPath({ title: 'Auto plan' });
    const article = repo.addNode({ pathId: p.id, resource: { resourceType: 'article', title: 'Kalman Filter Blog' } });
    const book = repo.addNode({ pathId: p.id, resource: { resourceType: 'book', title: 'Kalman Filter Textbook' } });
    const detail = await repo.planWithAI(p.id);
    // Same keyword "kalman/filter" => one track; book (foundational) before article.
    expect(detail?.nodes[0].node.id).toBe(book.id);
    expect(detail?.edges).toHaveLength(1);
    expect(detail?.edges[0]).toMatchObject({ sourceNodeId: book.id, targetNodeId: article.id });
    repo.close();
    if (prevA) process.env.ANTHROPIC_API_KEY = prevA;
    if (prevO) process.env.OPENROUTER_API_KEY = prevO;
  });

  it('planWithAI builds parallel tracks that converge on a checkpoint', async () => {
    const prevA = process.env.ANTHROPIC_API_KEY;
    const prevO = process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    const repo = await fresh();
    const p = repo.createPath({ title: 'Parallel plan' });
    const rustBook = repo.addNode({ pathId: p.id, resource: { resourceType: 'book', title: 'Rust Programming Language' } });
    const rustVid = repo.addNode({ pathId: p.id, resource: { resourceType: 'video', title: 'Rust Async Deep Dive' } });
    const linalgBook = repo.addNode({ pathId: p.id, resource: { resourceType: 'book', title: 'Linear Algebra Done Right' } });
    const project = repo.addNode({ pathId: p.id, resource: { resourceType: 'checkpoint', title: 'Capstone Project' } });
    const detail = await repo.planWithAI(p.id);

    // Two parallel tracks (rust, linear-algebra) placed on different rows.
    const rustBookY = detail!.nodes.find((n) => n.node.id === rustBook.id)!.node.canvasY!;
    const linalgY = detail!.nodes.find((n) => n.node.id === linalgBook.id)!.node.canvasY!;
    expect(rustBookY).not.toBe(linalgY);
    // rust track chains internally: book -> video.
    expect(detail?.edges.some((e) => e.sourceNodeId === rustBook.id && e.targetNodeId === rustVid.id)).toBe(true);
    // checkpoint converges (fan-in) from both track tails.
    const intoProject = detail!.edges.filter((e) => e.targetNodeId === project.id);
    expect(intoProject.length).toBeGreaterThanOrEqual(2);
    repo.close();
    if (prevA) process.env.ANTHROPIC_API_KEY = prevA;
    if (prevO) process.env.OPENROUTER_API_KEY = prevO;
  });

  it('exports a portable snapshot including every canonical table', async () => {
    const repo = await fresh();
    const p = repo.createPath({ title: 'Export test' });
    const node = repo.addNode({ pathId: p.id, resource: { resourceType: 'article', title: 'A blog post', sourceUrl: 'https://example.com/post' } });
    repo.recordProgress({ nodeId: node.id, completionState: 'completed' });

    const exported = repo.exportAll();
    expect(exported.schemaVersion).toBe(STUDY_SCHEMA_VERSION);
    expect(exported.paths).toHaveLength(1);
    expect(exported.resources).toHaveLength(1);
    expect(exported.nodes).toHaveLength(1);
    expect(exported.progressEvents.length).toBeGreaterThanOrEqual(1);
    expect(exported.exportedAt).toBeGreaterThan(0);
    repo.close();
  });
});

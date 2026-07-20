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

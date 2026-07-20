import { describe, expect, it } from 'vitest';
import { parseResources } from './study-import';

describe('parseResources', () => {
  it('parses a plain TXT list, one title per line', () => {
    const resources = parseResources('The Rust Book\nAsync Rust\n# a comment\n\nTokio Course', 'list.txt');
    expect(resources.map((r) => r.title)).toEqual(['The Rust Book', 'Async Rust', 'Tokio Course']);
    expect(resources[0]!.resourceType).toBe('article');
  });

  it('parses a CSV with a header row and typed columns', () => {
    const csv = [
      'title,type,units,url',
      'Linear Algebra Done Right,book,300,https://example.com/axler',
      'Kalman Filter Intro,video,45,',
    ].join('\n');
    const resources = parseResources(csv, 'paths.csv');
    expect(resources).toHaveLength(2);
    expect(resources[0]).toMatchObject({ resourceType: 'book', title: 'Linear Algebra Done Right', totalUnits: 300, unitKind: 'pages' });
    expect(resources[1]).toMatchObject({ resourceType: 'video', totalUnits: 45, unitKind: 'minutes' });
    expect(resources[0]!.sourceUrl).toBe('https://example.com/axler');
  });

  it('handles quoted CSV cells containing commas', () => {
    const csv = 'title,type\n"Statistics, Vol 1",book';
    const resources = parseResources(csv, 'q.csv');
    expect(resources[0]!.title).toBe('Statistics, Vol 1');
  });

  it('falls back to first cell as title when no title header', () => {
    const csv = 'Foundations of ML\nDeep Learning';
    const resources = parseResources(csv);
    expect(resources.map((r) => r.title)).toEqual(['Foundations of ML', 'Deep Learning']);
  });

  it('defaults unknown types to article and keeps checkpoints unitless', () => {
    const csv = 'title,type\nBuild a CLI,checkpoint\nMystery,wat';
    const resources = parseResources(csv, 'x.csv');
    expect(resources[0]).toMatchObject({ resourceType: 'checkpoint', unitKind: 'binary', totalUnits: null });
    expect(resources[1]!.resourceType).toBe('article');
  });
});

import { describe, it, expect } from 'vitest';
import { classifyByDomain } from '../src/classifier/domain-rules';
import { classifyByTFIDF, updateCorpus } from '../src/classifier/tfidf';
import { matchGlob } from '../src/shared/utils';
import type { Workspace } from '../src/store/types';

const mockWorkspace = (id: string, patterns: string[]): Workspace => ({
  id,
  name: id,
  color: 'blue',
  domainPatterns: patterns,
  keywordPatterns: [],
  isActive: false,
  decayDays: 7,
  createdAt: Date.now(),
  sortOrder: 0,
});

describe('matchGlob', () => {
  it('matches exact domain', () => {
    expect(matchGlob('github.com', 'github.com')).toBe(true);
  });

  it('matches wildcard path', () => {
    expect(matchGlob('github.com/iamjakkie/*', 'github.com/iamjakkie/tabos')).toBe(true);
    expect(matchGlob('github.com/iamjakkie/*', 'github.com/other/tabos')).toBe(false);
  });

  it('does not match partial domain', () => {
    expect(matchGlob('github.com', 'notgithub.com')).toBe(false);
  });
});

describe('classifyByDomain (L1)', () => {
  const workspaces = [
    mockWorkspace('aviato', ['github.com/iamjakkie/*', 'docs.px4.io/**']),
    mockWorkspace('dataforce', ['databricks.com/*']),
  ];

  it('returns null for unmatched URL', () => {
    expect(classifyByDomain('https://google.com', workspaces)).toBeNull();
  });

  it('classifies exact domain match', () => {
    const result = classifyByDomain('https://docs.px4.io/en/guide', workspaces);
    expect(result?.workspaceId).toBe('aviato');
    expect(result?.confidence).toBeGreaterThan(0.7);
  });

  it('classifies glob path match', () => {
    const result = classifyByDomain('https://github.com/iamjakkie/swarm-loc', workspaces);
    expect(result?.workspaceId).toBe('aviato');
  });

  it('does not match wrong path', () => {
    const result = classifyByDomain('https://github.com/someone-else/project', workspaces);
    expect(result).toBeNull();
  });
});

describe('classifyByTFIDF (L2)', () => {
  it('returns null for empty corpus', () => {
    expect(classifyByTFIDF('Pixhawk EKF guide', {})).toBeNull();
  });

  it('matches workspace from title keywords', () => {
    let corpora = {};
    corpora = updateCorpus(corpora, 'aviato', 'Pixhawk EKF configuration');
    corpora = updateCorpus(corpora, 'aviato', 'MAVLink protocol reference');
    corpora = updateCorpus(corpora, 'dataforce', 'Apache Parquet columnar format');

    const result = classifyByTFIDF('Pixhawk MAVLink telemetry', corpora, 0.1);
    expect(result?.workspaceId).toBe('aviato');
  });

  it('scores 0 for unrelated title', () => {
    let corpora = {};
    corpora = updateCorpus(corpora, 'aviato', 'drone swarm navigation');
    const result = classifyByTFIDF('chocolate cake recipe', corpora, 0.5);
    expect(result).toBeNull();
  });
});

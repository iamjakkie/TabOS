import { describe, it, expect } from 'vitest';
import { validateArchive, ArchiveValidationError, CURRENT_FORMAT_VERSION } from '../src/portability/format';
import { migrateArchive } from '../src/portability/migrate';

describe('validateArchive', () => {
  it('accepts a valid v1 archive', () => {
    const archive = {
      version: 1,
      exportedAt: new Date().toISOString(),
      exportSource: { hostname: 'test', os: 'macos', chromeVersion: '125', tabosVersion: '0.1.0' },
      tabEntries: [],
      workspaces: [],
      userPrefs: null,
      classifierState: null,
      stats: { totalTabs: 0, byState: {}, byWorkspace: {}, archiveSizeBytes: 0 },
    };
    expect(() => validateArchive(archive)).not.toThrow();
  });

  it('throws for missing version', () => {
    expect(() => validateArchive({ exportedAt: 'x' })).toThrow(ArchiveValidationError);
  });

  it('throws when version is too new', () => {
    expect(() => validateArchive({ version: CURRENT_FORMAT_VERSION + 1, exportedAt: 'x', exportSource: {} })).toThrow(/newer version/);
  });

  it('throws for non-object input', () => {
    expect(() => validateArchive(null)).toThrow(ArchiveValidationError);
    expect(() => validateArchive('string')).toThrow(ArchiveValidationError);
  });
});

describe('migrateArchive', () => {
  it('passes through v1 archives unchanged', () => {
    const archive = { version: 1, exportedAt: 'x', exportSource: {} };
    expect(migrateArchive(archive)).toBe(archive);
  });

  it('throws for unknown version', () => {
    expect(() => migrateArchive({ version: 99 })).toThrow(/Unknown archive version/);
  });
});

import { describe, expect, it } from 'vitest';
import path from 'node:path';

function resolveRendererPath(compiledMainDir: string): string {
  return path.join(compiledMainDir, '../../renderer/index.html');
}

describe('compiled application paths', () => {
  it('resolves renderer HTML from dist/main/main to dist/renderer', () => {
    const root = '/tmp/tabos/app';
    expect(resolveRendererPath(path.join(root, 'dist/main/main'))).toBe(
      path.join(root, 'dist/renderer/index.html'),
    );
  });
});

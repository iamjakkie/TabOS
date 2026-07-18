import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

interface AppPackage {
  main: string;
}

describe('Electron application entry', () => {
  it('points package.json main to the compiled Electron entry', () => {
    const root = path.resolve(__dirname, '../..');
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as AppPackage;
    expect(packageJson.main).toBe('dist/main/main/main.js');
  });
});

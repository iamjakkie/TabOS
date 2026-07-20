import fs from 'node:fs';
import path from 'node:path';

/**
 * Minimal .env.local loader — no dependency. Reads KEY=VALUE lines from
 * `<appRoot>/.env.local` (git-ignored) and populates process.env without
 * overriding variables already set in the real environment. Used for local
 * secrets like the study planner API key.
 */
export function loadLocalEnv(appRoot: string): void {
  const candidates = [
    path.join(appRoot, '.env.local'),
    path.join(appRoot, '..', '.env.local'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }
}

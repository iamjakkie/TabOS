import type { TabOSArchive } from './format';
import { CURRENT_FORMAT_VERSION } from './format';

/** Migrate an archive from any supported older version to the current version */
export function migrateArchive(raw: unknown): TabOSArchive {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = raw as any;
  const version = obj.version as number;

  if (version === 1) {
    // Current version — no migration needed
    return obj as TabOSArchive;
  }

  // Future: chain migrations here
  // if (version === 1) return migrateV1toV2(obj);

  throw new Error(`Unknown archive version: ${version}. Current: ${CURRENT_FORMAT_VERSION}`);
}

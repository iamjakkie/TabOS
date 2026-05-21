import { matchGlob, extractDomain } from '../shared/utils';
import { L1_CONFIDENCE_EXACT, L1_CONFIDENCE_PREFIX } from '../shared/constants';
import { UNASSIGNED_WORKSPACE_ID } from '../store/types';
import type { Workspace } from '../store/types';
import type { Classification } from './types';

/**
 * L1 classifier: match URL against workspace domainPatterns (user-configured globs).
 * Returns the first matching workspace with high confidence, or null to fall through to L2.
 */
export function classifyByDomain(url: string, workspaces: Workspace[]): Classification | null {
  let hostname: string;
  let pathname: string;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    pathname = parsed.pathname;
  } catch {
    return null;
  }

  const hostAndPath = hostname + pathname;

  for (const ws of workspaces) {
    for (const pattern of ws.domainPatterns) {
      // Exact domain match (no wildcards) → highest confidence
      if (pattern === hostname) {
        return { workspaceId: ws.id, confidence: L1_CONFIDENCE_EXACT, level: 1 };
      }

      // Glob pattern match
      if (matchGlob(pattern, hostAndPath)) {
        const confidence = pattern.includes('*') ? L1_CONFIDENCE_PREFIX : L1_CONFIDENCE_EXACT;
        return { workspaceId: ws.id, confidence, level: 1 };
      }
    }
  }

  return null;
}

/**
 * Learn domain patterns from manually-assigned tabs.
 * Called when a user drags a tab into a workspace — builds the auto-suggest corpus.
 */
export function inferDomainPattern(url: string): string {
  const domain = extractDomain(url);
  return domain; // Start simple: just the domain. User can refine to glob later.
}

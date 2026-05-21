import { classifyByDomain } from './domain-rules';
import { classifyByTFIDF, loadCorpora } from './tfidf';
import { UNASSIGNED_WORKSPACE_ID } from '../store/types';
import { L2_CONFIDENCE_THRESHOLD } from '../shared/constants';
import type { TabEntry, Workspace } from '../store/types';
import type { Classification } from './types';

/**
 * Three-level classification cascade.
 * L1 (domain rules) → L2 (TF-IDF) → fallback to unassigned.
 * L3 (ONNX embeddings) is deferred to v0.2.
 */
export async function classifyTab(entry: TabEntry, workspaces: Workspace[]): Promise<Classification> {
  // L1: domain pattern match (instant)
  const l1 = classifyByDomain(entry.url, workspaces);
  if (l1) return l1;

  // L2: TF-IDF title similarity
  const corpora = await loadCorpora();
  const l2 = classifyByTFIDF(entry.title, corpora);
  if (l2 && l2.score >= L2_CONFIDENCE_THRESHOLD) {
    return { workspaceId: l2.workspaceId, confidence: l2.score, level: 2 };
  }

  // No match — leave unassigned, will be re-tried in next batch
  return { workspaceId: UNASSIGNED_WORKSPACE_ID, confidence: 0, level: 1 };
}

/**
 * Batch classify a list of entries (used for post-import classification).
 * Shares one corpus load across the batch.
 */
export async function classifyBatch(
  entries: TabEntry[],
  workspaces: Workspace[],
): Promise<Map<string, Classification>> {
  const corpora = await loadCorpora();
  const results = new Map<string, Classification>();

  for (const entry of entries) {
    const l1 = classifyByDomain(entry.url, workspaces);
    if (l1) {
      results.set(entry.id, l1);
      continue;
    }

    const l2 = classifyByTFIDF(entry.title, corpora);
    if (l2 && l2.score >= L2_CONFIDENCE_THRESHOLD) {
      results.set(entry.id, { workspaceId: l2.workspaceId, confidence: l2.score, level: 2 });
      continue;
    }

    results.set(entry.id, { workspaceId: UNASSIGNED_WORKSPACE_ID, confidence: 0, level: 1 });
  }

  return results;
}

import type { WorkspaceCorpora } from './types';

/** Tokenize a title into lowercase terms, removing stopwords */
function tokenize(text: string): string[] {
  const stopwords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'it', 'its', 'this', 'that', 'are',
    'was', 'be', 'been', 'has', 'have', 'had', 'do', 'does', 'did', 'will',
    'how', 'what', 'when', 'where', 'who', 'which', 'not', 'no', 'can',
  ]);
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !stopwords.has(t));
}

/** Compute term frequency (count of each term in the document) */
function termFrequency(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const t of tokens) {
    tf[t] = (tf[t] ?? 0) + 1;
  }
  return tf;
}

/** Add a new document's terms to a workspace corpus */
export function updateCorpus(corpora: WorkspaceCorpora, workspaceId: string, title: string): WorkspaceCorpora {
  const tokens = tokenize(title);
  const existing = corpora[workspaceId] ?? {};
  const updated = { ...existing };
  for (const token of tokens) {
    updated[token] = (updated[token] ?? 0) + 1;
  }
  return { ...corpora, [workspaceId]: updated };
}

/** Cosine similarity between two term-frequency vectors */
function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
  const keysA = Object.keys(a);
  if (keysA.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const key of keysA) {
    const va = a[key] ?? 0;
    const vb = b[key] ?? 0;
    dot += va * vb;
    normA += va * va;
  }
  for (const key of Object.keys(b)) {
    normB += (b[key] ?? 0) ** 2;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface TFIDFResult {
  workspaceId: string;
  score: number;
}

/**
 * L2 classifier: compute TF-IDF similarity between the tab title
 * and each workspace's term corpus. Returns the best match above threshold.
 */
export function classifyByTFIDF(
  title: string,
  corpora: WorkspaceCorpora,
  threshold: number = 0.15,
): TFIDFResult | null {
  const tokens = tokenize(title);
  if (tokens.length === 0) return null;

  const docTF = termFrequency(tokens);
  let best: TFIDFResult | null = null;

  for (const [workspaceId, corpusTF] of Object.entries(corpora)) {
    if (Object.keys(corpusTF).length === 0) continue;
    const score = cosineSimilarity(docTF, corpusTF);
    if (score >= threshold && (best === null || score > best.score)) {
      best = { workspaceId, score };
    }
  }

  return best;
}

/** Persist corpora in chrome.storage.local (small enough, fast reads) */
export async function loadCorpora(): Promise<WorkspaceCorpora> {
  return new Promise((resolve) => {
    chrome.storage.local.get('tfidfCorpora', (result) => {
      resolve((result['tfidfCorpora'] as WorkspaceCorpora) ?? {});
    });
  });
}

export async function saveCorpora(corpora: WorkspaceCorpora): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ tfidfCorpora: corpora }, resolve);
  });
}

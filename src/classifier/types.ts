export interface Classification {
  workspaceId: string;
  confidence: number;
  level: 1 | 2 | 3;
  tags?: string[];
}

export interface ClassifierBackend {
  classifyBatch(entries: import('../store/types').TabEntry[]): Promise<Classification[]>;
}

/** Per-workspace TF-IDF corpus: maps term → document frequency */
export type WorkspaceCorpora = Record<string, Record<string, number>>;

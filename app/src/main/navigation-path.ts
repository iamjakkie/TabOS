export interface PathEvent {
  id: string;
  tabId: string;
  url: string;
  title: string;
  visitedAt: number;
  parentVisitId?: string;
}

export function createPathEvent(event: PathEvent): PathEvent {
  return { ...event };
}

export function appendPathEvent(path: PathEvent[], event: PathEvent): PathEvent[] {
  if (path.some((existing) => existing.id === event.id)) return path;
  return [...path, event].sort((a, b) => a.visitedAt - b.visitedAt);
}

export function canonicalDocumentUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.split('#', 1)[0] ?? url;
  }
}

export function selectSettledNavigation(
  candidates: string[],
  lastRecordedUrl?: string,
): string | null {
  const finalUrl = candidates.at(-1);
  if (!finalUrl) return null;
  if (lastRecordedUrl && canonicalDocumentUrl(finalUrl) === canonicalDocumentUrl(lastRecordedUrl)) {
    return null;
  }
  return finalUrl;
}

export function resolveVisitParent(input: {
  previousVisitInTab?: string;
  openedFromVisit?: string;
  activeVisit?: string;
}): string | undefined {
  return input.previousVisitInTab ?? input.openedFromVisit ?? input.activeVisit;
}

export function buildPathRows(path: PathEvent[]): Array<{ event: PathEvent; depth: number }> {
  const byId = new Map(path.map((event) => [event.id, event]));
  const depthById = new Map<string, number>();

  const getDepth = (event: PathEvent, seen = new Set<string>()): number => {
    const cached = depthById.get(event.id);
    if (cached !== undefined) return cached;
    if (!event.parentVisitId || seen.has(event.id)) return 0;
    const parent = byId.get(event.parentVisitId);
    if (!parent) return 0;
    seen.add(event.id);
    const depth = getDepth(parent, seen) + (parent.tabId === event.tabId ? 0 : 1);
    depthById.set(event.id, depth);
    return depth;
  };

  return path.map((event) => ({ event, depth: getDepth(event) }));
}

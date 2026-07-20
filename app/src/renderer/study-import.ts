import type { CreateResourceInput, StudyResourceType, StudyUnitKind } from '../shared/study';

const RESOURCE_TYPES: StudyResourceType[] = ['book', 'pdf', 'article', 'video', 'course', 'tab', 'checkpoint'];
const UNIT_BY_TYPE: Record<StudyResourceType, StudyUnitKind> = {
  book: 'pages', pdf: 'pages', article: 'items', video: 'minutes', course: 'lessons', tab: 'items', checkpoint: 'binary',
};

function coerceType(raw: string | undefined): StudyResourceType {
  const value = (raw ?? '').trim().toLowerCase();
  return (RESOURCE_TYPES as string[]).includes(value) ? (value as StudyResourceType) : 'article';
}

// Split a single CSV line honoring simple double-quote quoting.
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i += 1; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current); current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/**
 * Parse resources from a pasted/uploaded file.
 *
 * TXT: one resource per line — just the title. Blank lines and lines starting
 * with `#` are ignored.
 *
 * CSV: header-driven. Recognized columns (case-insensitive):
 *   title (required), type, url/source_url, units/total_units, author, unit_kind
 * A header row is required for CSV; if the first row has no `title` column we
 * fall back to treating every line's first cell as a title.
 */
export function parseResources(text: string, filename = ''): CreateResourceInput[] {
  const lines = text.split(/\r?\n/).map((line) => line.trimEnd());
  const nonEmpty = lines.filter((line) => line.trim() && !line.trim().startsWith('#'));
  if (nonEmpty.length === 0) return [];

  const looksCsv = filename.toLowerCase().endsWith('.csv') || nonEmpty[0]!.includes(',');
  if (!looksCsv) {
    return nonEmpty.map((title) => buildResource({ title }));
  }

  const header = splitCsvLine(nonEmpty[0]!).map((cell) => cell.toLowerCase());
  const titleIdx = header.findIndex((cell) => cell === 'title' || cell === 'name');
  if (titleIdx === -1) {
    // No usable header: treat first cell of every row as a title.
    return nonEmpty.map((line) => buildResource({ title: splitCsvLine(line)[0] ?? '' }))
      .filter((resource) => resource.title.length > 0);
  }

  const idx = (names: string[]) => header.findIndex((cell) => names.includes(cell));
  const typeIdx = idx(['type', 'resource_type', 'kind']);
  const urlIdx = idx(['url', 'source_url', 'link']);
  const unitsIdx = idx(['units', 'total_units', 'total']);
  const authorIdx = idx(['author', 'provider', 'author_or_provider']);
  const unitKindIdx = idx(['unit_kind', 'unit']);

  return nonEmpty.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const title = cells[titleIdx] ?? '';
    const totalRaw = unitsIdx >= 0 ? Number(cells[unitsIdx]) : NaN;
    return buildResource({
      title,
      type: typeIdx >= 0 ? cells[typeIdx] : undefined,
      url: urlIdx >= 0 ? cells[urlIdx] : undefined,
      totalUnits: Number.isFinite(totalRaw) ? totalRaw : undefined,
      author: authorIdx >= 0 ? cells[authorIdx] : undefined,
      unitKind: unitKindIdx >= 0 ? cells[unitKindIdx] : undefined,
    });
  }).filter((resource) => resource.title.length > 0);
}

function buildResource(input: {
  title: string; type?: string; url?: string; totalUnits?: number; author?: string; unitKind?: string;
}): CreateResourceInput {
  const resourceType = coerceType(input.type);
  const unitKind = (input.unitKind?.trim() as StudyUnitKind) || UNIT_BY_TYPE[resourceType];
  return {
    resourceType,
    title: input.title.trim(),
    sourceUrl: input.url?.trim() || null,
    authorOrProvider: input.author?.trim() || null,
    unitKind,
    totalUnits: unitKind !== 'binary' && input.totalUnits != null ? input.totalUnits : null,
  };
}

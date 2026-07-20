# Study Mode — Developer Notes

Durability-first learning subsystem inside the TabOS Electron app. This note
explains the data model contract so future UI/feature work does not destroy real
study progress.

## Where things live

| Concern | File |
|---------|------|
| Shared typed contracts | `src/shared/study.ts` |
| Persistence + derivation | `src/main/study-repository.ts` |
| Typed IPC handlers | `src/main/main.ts` (`study:*` channels) |
| Preload bridge | `src/preload/preload.ts` (`window.study`) |
| UI | `src/renderer/StudyView.tsx` |
| Tests | `src/main/study-repository.test.ts` |

Study data is stored in its own SQLite file (`<userData>/tabos-study.db`),
completely separate from ephemeral browser/tab snapshot state
(`SnapshotRepository`). Losing or resetting browser state never touches study
data.

## Canonical data (source of truth — never destroy)

These tables are the only source of truth. Treat their rows as immutable
history where possible.

- `study_paths` — learning paths
- `study_resources` — the underlying thing (book, pdf, article, video, course,
  tab, checkpoint)
- `study_path_nodes` — a resource placed into a path (a resource can appear in
  many paths)
- `study_progress_events` — **append-only** progress log. We never mutate a
  percentage in place; we append deltas and completion events.
- `study_sessions` — time actually spent studying
- `study_deliverables` — proof artifacts (takeaway, note, exercise, code, summary)
- `study_schema_migrations` — applied schema versions

Every user-owned entity has a stable UUID and `created_at`/`updated_at`
timestamps. Entities that can be retired carry a nullable `archived_at`
(soft-delete / tombstone) instead of being hard-deleted.

## Derived data (recomputed — safe to change/throw away)

Never persisted as source of truth; always recomputed on read:

- `StudyNodeProgress` — folded from a node's `study_progress_events`
  (units completed, total, completion state, fraction).
- `StudyPathStats` — aggregated per path (completed nodes, overall fraction,
  total time, session count, last studied).
- `study_path_nodes.status` — a convenience mirror of completion for the UI.
  It is derived; the events remain authoritative.

Because progress is event-sourced, we can freely redesign how progress is
displayed or aggregated without migrating or losing anything: just change the
derivation in `deriveNodeProgress` / `computeStats`.

## How future UI changes avoid data loss

1. Add new fields as nullable columns via a new migration step; never rewrite or
   drop existing canonical columns.
2. Prefer appending new event rows over mutating existing ones.
3. Keep derived projections in the repository layer, not persisted. Redesign
   them at will.
4. Use `archived_at` for removals so history and stats stay recomputable.
5. Bump `STUDY_SCHEMA_VERSION` and add an `if (current < N)` block in
   `migrate()`. Migrations are additive and non-destructive by policy.

## Migrations

`migrate()` runs on every `StudyRepository.open`. It creates the migrations
table, checks the max applied version, and applies only the missing forward
steps. It never performs a silent destructive migration. Writes are flushed
atomically (temp file + rename) so a crash can't corrupt the DB.

## Export / portability

`exportAll()` (UI: "Export JSON") produces a `StudyExport` containing every
canonical table plus `schemaVersion` and `exportedAt`. This is the portable
backup/interchange format and is designed to be the seed for future import and
sync.

## What's next (sync / mobile — not built yet)

The model is already sync-friendly: stable UUIDs, timestamps everywhere,
append-only progress, no denormalized blob as the single source of truth. To add
sync later:

- Add a `study_import` path that merges a `StudyExport` (upsert by UUID,
  last-writer-wins on `updated_at`, union of append-only event rows by id).
- Consider per-row `updated_at` + a device/site id for conflict resolution.
- Progress events are naturally CRDT-friendly (append-only, commutative deltas),
  so multi-device merge is tractable without redesigning the schema.
- For mobile, reuse `src/shared/study.ts` contracts and reimplement the
  repository against the target platform's SQLite; the export format is the
  interchange contract.

# TabOS Backlog

Non-urgent ideas and next steps, newest additions at the bottom of each section.
Items are pulled from here when we decide to work on them. "Now" work is not
tracked here — this is the parking lot so nothing gets lost.

## Open

### DB persistence optimization (raised 2026-07-21)
Problem: the browser snapshot uses sql.js (WASM). Every `save()` serializes the
**entire** database to a buffer and rewrites the whole `.db` file (temp + rename).
That is O(total db size) per mutation. Fine at ~1k tabs, but it will get slow as
tabs + 30 days of visit history grow (10k+ rows), because a single tab activate
rewrites megabytes.

Proposed solutions, in order of preference:

1. **Debounce + coalesce writes.** Cheapest win. Don't flush on every mutation;
   batch mutations and flush at most every ~500ms–1s (and always on quit). Keeps
   sql.js but removes the write amplification from rapid tab switching.
2. **Split hot vs. cold state into separate files.** Tabs/active-state change
   constantly; visit history is append-only. Put visits in their own db (or table
   flushed on a slower cadence) so churny tab updates don't rewrite history bytes.
3. **Move to a real embedded SQLite with incremental writes** (`better-sqlite3`
   or node:sqlite) so only changed pages are written, not the whole file. Blocked
   earlier by the broken Xcode toolchain / native ABI mismatch; revisit when the
   toolchain is fixed or a prebuilt arm64 Electron binary is available. `node:sqlite`
   (Node 22+/Electron bundled) may avoid the native-addon build entirely — evaluate.
4. **WAL-style append log for visits.** Append new visits to a log and compact
   periodically, instead of rewriting. Overkill unless (1)+(2) prove insufficient.

Recommendation: do (1) now-ish, then (2); keep (3) as the real fix once tooling
allows. Add a small perf test (e.g. 10k tabs, time a single activate save).

### Cross-device sync + accounts — "TabOS as a platform" (raised 2026-07-21)
Goal: log in, sync tabs / history / study / pins across devices, nothing lost.

How Chrome does it (reference): a dedicated server-side Sync service keyed to the
Google account (NOT gDrive). Per-datatype, versioned, **delta** sync — clients send
only changed typed entities since a server version token and merge, rather than
uploading snapshots. Open tabs are published as per-device "session" entities that
other devices read ("tabs from other devices"); history/bookmarks are merged/unioned.
Conflict resolution is per-field last-writer-wins or datatype-specific merge.
Optional client-side passphrase = E2E encryption.

Key lesson: the magic is the **sync protocol + data model**, not the storage backend.
"Nothing gets lost" requires, in the local data model (do this regardless of when a
server ships):
  - stable global IDs (have UUIDs already)
  - per-record `updated_at` + soft-delete tombstones (never hard-delete syncable
    rows, or deletions won't propagate). Study entities have `archived_at`; tabs and
    visits need the same.
  - a change log / dirty flag so a client can compute "what changed since last sync"
    without diffing the whole DB.

This is the SAME underlying problem as the DB optimization above: move from
whole-file snapshots to per-record, append-friendly, tombstoned changes. Whole-file
upload sync is wrong — it clobbers concurrent devices (last upload wins) and has the
same write amplification. Solve delta/tombstone once → both restart-persistence and
multi-device sync fall out.

Backend options, cheapest first:
1. **CRDT (Automerge/Yjs) or LWW-per-field log synced through a dumb blob store**
   (S3/R2, small Postgres, or even user's Dropbox/iCloud). Merge client-side →
   local-first, no lock-in, guaranteed no-loss. Recommended start.
2. **Managed sync backend**: Turso/libSQL (SQLite-compatible, least schema rework),
   Supabase, Electric-SQL, or PowerSync.
3. **Full custom sync service** (Chrome-style). Only at real product scale.
Auth: use a provider (Clerk/Supabase Auth/WorkOS/Auth0), don't hand-roll.

Sequencing: land tombstones + change-log in the data model first (small, do it
alongside the DB optimization), then pick option 1 for a first sync MVP (start with
one datatype, e.g. study paths or pinned tabs), expand datatype by datatype like
Chrome does.

### DuckDB for storage? — decision (raised 2026-07-21)
Considered DuckDB since the workload looks like OLTP + OLAP. Decision: **no, keep
SQLite.** The write pattern (tab activate/freeze/pin/favicon/visit-append) is
high-frequency tiny point writes = OLTP, which columnar DuckDB handles poorly; and
the "analytics" (Journey graph over 7–30 days) is only a few-thousand-row windowed
scan that SQLite aggregates in single-digit ms — not real OLAP. DuckDB Node bindings
are also native addons (same build problem as better-sqlite3), heavier binary/memory.
The real issue is sql.js rewriting the whole file per mutation, which incremental
SQLite fixes directly. Keep DuckDB in back pocket as a future *secondary, read-only*
analytics store fed from SQLite IF a heavy analytical feature appears (e.g. multi-year,
10M+ visit rollups) — ETL pattern, never the primary transactional store.

## Done
(empty)

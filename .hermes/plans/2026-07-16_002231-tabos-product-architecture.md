# TabOS Product Architecture and Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Turn TabOS into a local-first intelligent tab workspace that safely ingests thousands of tabs, organizes them semantically, keeps only a small active set in the browser, and continuously helps the user decide what to resume, defer, archive, or discard.

**Architecture:** Build TabOS as a standalone Chromium browser/workspace from the start. An Electron shell owns the native window, persistent browser profile, and isolated `WebContentsView` instances; a Rust sidecar/core owns SQLite storage, imports, sessions, semantic embeddings, clustering, search, decay scoring, and backups. The UI manages thousands of tab records while a bounded pool of Chromium renderers keeps only active/recent tabs live. Suspended tabs remain inside TabOS and are recreated in an internal renderer when selected—never redirected to Chrome.

**Tech Stack:** Electron with `BaseWindow`/`WebContentsView`, Svelte or React/TypeScript browser chrome, a Rust core (Tokio, SQLx/rusqlite, SQLite), local embedding runtime (fastembed or Candle/ONNX Runtime with MiniLM), SQLite FTS5 or Tantivy, Cargo test, Vitest, and Electron integration tests.

---

## 1. Product decision

### Recommended direction: Electron browser shell + local Rust brain

The project has explored three products:

1. A Chrome extension that virtualizes tabs.
2. A standalone browser with one/few webviews.
3. A knowledge/work-queue system for tabs.

The product requirement is now explicit: opening a saved item outside TabOS is unacceptable. TabOS must therefore be a real browser shell as well as the intelligence layer. To maximize website compatibility across macOS and Linux, bundle Chromium through Electron instead of relying on Tauri's platform webviews (WKWebView on macOS and WebKitGTK on Linux). One rendering engine also makes behavior and testing consistent across devices.

The v1 experience should therefore be:

- TabOS owns a persistent Chromium profile containing cookies, cache, service workers, permissions, and site storage.
- Every item opens inside TabOS in an isolated `WebContentsView`.
- Only a bounded active/recent renderer pool remains alive; other tabs are durable records and are recreated internally on demand.
- TabOS captures title, favicon, navigation state, scroll position, and snapshots before suspension when possible.
- TabOS uses local embeddings to cluster, label, search, and rank records.
- A workspace activates only a bounded renderer set, not every record in it.
- All semantic/durable state lives in portable SQLite, while browser-profile state is backed up separately because cookies/cache are engine-managed.

Electron is not literally guaranteed to support every site. Google explicitly disallows OAuth authorization in developer-controlled embedded user agents, and DRM/proprietary integrations or anti-automation checks can also fail. The acceptance target is normal Chromium site compatibility, with a measured compatibility suite built from the user's real top domains. No normal navigation should intentionally redirect to Chrome.

This also respects the strongest requirement from `conversation.json`: embedding-first classification, not a domain-rule/TF-IDF cascade as the primary intelligence.

### What to keep from the current extension

- Chrome event tracking logic as reference for the internal browser event model.
- Great Suspender URL unwrapping.
- Tab/sidebar interaction model and existing React components where useful.
- Virtualize/restore and snooze concepts.
- Typed message boundary.
- Existing TabEntry/Workspace concepts as migration input.

### What to replace or demote

- IndexedDB as the long-term source of truth: migrate authority to SQLite.
- L1/L2 classifier: keep domain rules only as explicit user overrides; remove TF-IDF as the main classifier.
- “Restore every tab in workspace”: replace with a renderer working-set budget.
- Browser memory estimation promises: enforce renderer-pool and active-tab limits first, then measure actual process memory.
- Chrome-extension runtime: keep it only as an optional importer/capture bridge, not the product UI.

---

## 2. Product model

A URL is not merely a bookmark. Each saved item is a piece of working memory with lifecycle and intent.

### Core entities

#### Item

A canonical resource record:

- stable UUID
- canonical URL and original URL
- title, domain, favicon
- source device and import batch
- created, last seen, last opened, last focused timestamps
- visit count and active duration
- lifecycle state: `inbox`, `active`, `snoozed`, `library`, `archived`, `trash`
- item kind: `article`, `video`, `book`, `course`, `product`, `job`, `tool`, `communication`, `unknown`
- user importance and completion status
- embedding vector reference/model version
- duplicate group/canonical item ID
- security-sensitive flag

#### Space

A durable project or area such as AVIATO, Data engineering, Job search, Home, Learning, or Personal.

- name, icon, color
- centroid embedding
- optional positive/negative examples
- explicit domain/path overrides
- active-tab budget
- decay policy

#### Collection

A curated list within or across spaces: “Courses to finish,” “September demo,” “Furniture shortlist.” Unlike a space, an item may belong to multiple collections.

#### Session

A snapshot of an actual working set: ordered items, Chrome window/group metadata, device, opened/closed timestamps. Sessions make context switching reversible without making every saved item live.

#### Reminder / lifecycle rule

- wake at an absolute time
- review after inactivity
- archive after inactivity
- ask before deletion
- recurrence and grace period

#### Import batch

Tracks provenance and makes every import reversible:

- source file/device/format
- checksum and import time
- parsed/skipped/duplicate counts
- warnings
- rollback status

#### Decision event

Append-only feedback such as assigned space, archived, restored, marked complete, or ignored recommendation. This is the learning signal for future ranking and centroid updates.

---

## 3. UX design

### Inbox

Every newly captured/imported item enters Inbox unless confidently assigned. The user sees grouped suggestions, not 2,000 individual cards.

Example group:

- “257 Amazon product pages”
- suggested collection: Shopping research
- actions: Keep group, archive old items, inspect, split

### Focus

The daily landing screen:

- Resume recent sessions.
- Top 3–10 recommended items.
- Snoozed items due now.
- Spaces with deadlines or unusual growth.
- A small “still relevant?” queue.

### Spaces

Semantic project areas with:

- current working set
- saved library
- suggested related items
- stale items
- sessions/history

Opening a space restores only its configured active budget, sorted by recency/importance, and leaves the remainder as metadata.

### Library

Long-lived books, courses, videos, and references. It needs progress and “next action,” not decay rules designed for disposable tabs.

### Review

A Tinder-like or batch review queue:

- Keep
- Snooze
- Move
- Mark complete
- Archive
- Trash

Review should support domain/topic batches and undo.

### Search / command palette

Hybrid search:

- exact URL/title via FTS
- semantic retrieval via embeddings
- filters for state, space, device, date, kind
- actions directly from results

### Sessions

“Save this working context” and “switch context” are first-class. Switching closes/virtualizes the old bounded set and restores the next bounded set.

### Import preview

Never write immediately after file selection. Show:

- total entries
- recoverable suspended URLs
- invalid entries
- exact duplicates
- probable duplicates after canonicalization
- sensitive/session URLs
- domain and item-kind distribution
- strategy: merge, separate source collection, or clean migration

Every import is reversible by batch.

---

## 4. System architecture

```text
Chrome / Chromium
  ├─ MV3 background worker
  │    tab capture, restore, groups, alarms, context menu
  ├─ side panel UI
  │    inbox, focus, spaces, review, search, settings
  └─ native messaging client
           │ authenticated local protocol
           ▼
TabOS Core (Rust daemon)
  ├─ import pipeline
  ├─ canonicalization + deduplication
  ├─ item/session/workspace services
  ├─ embedding queue
  ├─ clustering + semantic assignment
  ├─ hybrid search
  ├─ lifecycle/decay engine
  ├─ recommendation engine
  └─ backup/export
           │
           ▼
SQLite (`tabos.db`)
  ├─ relational metadata
  ├─ FTS5 index
  ├─ embeddings (BLOB initially)
  ├─ decision/event log
  └─ schema migrations
```

### Extension-to-core transport

Prefer Chrome Native Messaging for the installed product:

- no open localhost port
- Chrome identifies the native host explicitly
- newline/length-framed JSON protocol
- local-only security boundary

For development, expose an optional loopback HTTP API from Axum behind a random token. Keep the transport behind a TypeScript `CoreClient` and Rust command dispatcher so production can use native messaging without changing business logic.

### Source of truth transition

Phase 0–1 can continue using IndexedDB while importing the current tabs. Phase 2 introduces SQLite and a dual-read migration:

1. Export IndexedDB to a versioned migration payload.
2. Import into SQLite transactionally.
3. Compare counts/checksums.
4. Switch reads to Rust core.
5. Keep IndexedDB as a rebuildable UI cache only.

---

## 5. Intelligence design

### Embedding-first, with deterministic overrides

The classification sequence should be:

1. Explicit user rule/assignment: deterministic and authoritative.
2. Semantic nearest-space centroid using local embeddings.
3. Unsupervised cluster suggestion when no space is confident.
4. Inbox when confidence/margin is too low.

Domain rules are useful as user-authored overrides, not as the “AI.” TF-IDF can remain only as an optional fallback when the model is unavailable.

### Embedding text

Use normalized, privacy-preserving metadata:

```text
<title> [SEP] <registrable-domain> [SEP] <decoded path tokens>
```

Do not fetch page content in v1. It creates privacy, authentication, prompt-injection, latency, and storage problems. Add explicit page capture later as an opt-in feature.

### Model

Start with a small local sentence-transformer:

- `all-MiniLM-L6-v2` or a multilingual equivalent if Polish/English titles need equal quality
- model version stored with each vector
- batched background inference
- quantized model if runtime/size warrants it

Before locking the model, create a labeled evaluation set from a representative sample of the 2,031 unique imported URLs and compare at least one English MiniLM model and one multilingual model.

### Bootstrap clustering

For the first import:

1. Canonicalize/deduplicate.
2. Embed all items.
3. Cluster with HDBSCAN or agglomerative clustering; do not force a fixed `k` globally.
4. Generate cluster labels from top domains/title terms locally.
5. Let the user merge, split, and name clusters.
6. Compute space centroids from accepted items.

No cloud LLM is required. Optional local/cloud naming can be added later, but clustering must work without it.

### Confidence

Use both similarity and margin:

- accept only if best centroid similarity exceeds threshold
- and the gap to second best exceeds margin
- calibrate thresholds on the labeled dataset
- send uncertain items to Inbox

### Recommendations

Keep v1 ranking explainable:

```text
priority =
  recency_weight
  + explicit_importance
  + reminder_urgency
  + space_activity
  + unfinished_progress
  - staleness
  - repeated_ignore_penalty
```

Display reasons: “Due today,” “part of AVIATO,” “opened 4 times,” or “ignored in 3 reviews.” Do not invent opaque AI priority scores initially.

---

## 6. Importing the current `tabs` file safely

The existing file is a plain URL list containing Great Suspender wrappers. It must not be fed directly to the current parser.

Pipeline:

1. Parse every non-empty line.
2. Detect `chrome-extension://.../suspended.html`.
3. Decode fragment parameters `uri`/`url`, `ttl`, and `pos`.
4. Preserve the wrapper as `original_url`; store real destination as `url`.
5. Reject non-HTTP(S) records with a reason.
6. Remove tracking parameters conservatively; preserve parameters known to identify content.
7. Canonicalize host casing/default ports/fragments where safe.
8. Exact-deduplicate by canonical URL.
9. Flag session/account/logout/checkout URLs as sensitive or ephemeral.
10. Write an import-preview JSON report.
11. Require user confirmation before database insertion.
12. Insert in one transaction under an import batch.
13. Verify persisted counts and allow rollback.

Expected initial baseline from inspection:

- 2,389 non-empty records
- 2,376 recoverable HTTP(S) records
- 2,274 suspended URLs to unwrap
- 2,031 unique exact URLs before deeper canonicalization
- 13 invalid/skipped records

Do not run reachability checks against all URLs automatically. It leaks browsing history to remote servers, triggers authenticated/session endpoints, produces false negatives, and can cause side effects. Offer an explicit, rate-limited check only for selected public links using `HEAD`/safe `GET` with no cookies.

---

## 7. Repository strategy

Do not rewrite the current project in place immediately.

Recommended structure:

```text
TabOS/
  extension/                 # move current TS extension here later
  core/                      # Rust workspace / daemon
    Cargo.toml
    crates/
      tabos-domain/
      tabos-store/
      tabos-import/
      tabos-intelligence/
      tabos-search/
      tabos-service/
  protocol/                  # versioned JSON schemas / generated TS types
  fixtures/                  # synthetic, non-private test fixtures only
  docs/
  .hermes/plans/
```

First add `core/` and `protocol/` without moving the existing extension, to avoid a destabilizing rename. Move the extension only after the native core is integrated.

Immediately add private raw files to `.gitignore`:

```gitignore
/tabs
/conversation.json
*.tabos
*.db
*.db-shm
*.db-wal
/imports-private/
```

If project-history decisions should live in Git, summarize them in a sanitized ADR rather than committing the raw conversation.

---

## 8. Delivery roadmap

## Milestone 0: Protect data and establish baseline

**Outcome:** Private source files are safe, current changes are understood, and behavior has regression coverage.

### Task 0.1: Ignore private data

**Files:**
- Modify: `.gitignore`
- Create: `fixtures/tabs-small.txt` with synthetic suspended and plain URLs

**Steps:**
1. Add private import/database patterns to `.gitignore`.
2. Verify `git status` no longer lists `tabs` or `conversation.json`.
3. Add only synthetic fixtures.
4. Commit: `chore: protect private TabOS data`.

### Task 0.2: Preserve current uncommitted suspender work

**Files:**
- Modify: `tests/tracker.test.ts` or create it
- Existing modifications: `src/background/tracker.ts`, `src/background/service-worker.ts`, `src/ui/sidepanel/SettingsView.tsx`

**TDD steps:**
1. Add tests for `uri`, `url`, encoded title, malformed wrapper, plain URL, and non-importable extension page.
2. Run targeted test and verify RED where behavior is missing.
3. Refactor URL unwrapping into a pure shared function.
4. Reuse it in tracker and diagnostics.
5. Run `npm test`, `npm run typecheck`, `npm run build`.
6. Commit: `fix: unwrap suspended Chrome tabs consistently`.

### Task 0.3: Restore linting

**Files:**
- Create: `.eslintrc.cjs` (or migrate deliberately to ESLint flat config)
- Modify: `package.json` only if command changes

**Steps:**
1. Add configuration matching TypeScript/React conventions.
2. Run `npm run lint` and fix violations without behavior changes.
3. Run all existing checks.
4. Commit: `chore: restore ESLint configuration`.

---

## Milestone 1: Safe import into the existing extension

**Outcome:** The user can import the current file today without wrapper pollution, inspect the result, and undo it.

### Task 1.1: Build pure URL-list parser

**Files:**
- Create: `src/portability/url-list.ts`
- Create: `tests/url-list.test.ts`
- Modify: `src/portability/importer.ts`

**Required tests:**
- unwraps Great Suspender `uri`
- falls back to `url`
- decodes `ttl`
- keeps plain HTTP(S)
- rejects unsupported schemes with reason
- retains original URL and scroll position in parsed metadata
- exact-deduplicates deterministically
- reports malformed lines

**Verification:** `npm test -- tests/url-list.test.ts`, then full suite.

### Task 1.2: Introduce import preview types

**Files:**
- Modify: `src/shared/messages.ts`
- Create: `src/portability/import-preview.ts`
- Create: `tests/import-preview.test.ts`

Preview includes counts, domains, duplicate count, sensitive flags, and sample warnings. No database write occurs during preview.

### Task 1.3: Add reversible import batches to IndexedDB

**Files:**
- Modify: `src/store/types.ts`
- Modify: `src/store/schema.ts` with a versioned Dexie migration
- Modify: `src/store/db.ts`
- Modify: `src/portability/importer.ts`
- Create: `tests/importer.test.ts`

Add `importBatchId` to imported entries and an `importBatches` table. Implement rollback by batch. Ensure clean import requires an explicit second confirmation in UI.

### Task 1.4: Fix import message result and refresh

**Files:**
- Modify: `src/background/service-worker.ts`
- Modify: `src/ui/sidepanel/ImportExportView.tsx`
- Modify: `src/ui/store.ts`

Return `{tabsImported, conflicts, skipped, batchId}` and broadcast refreshed tabs/workspaces after success.

### Task 1.5: Build import preview UI

**Files:**
- Modify: `src/ui/sidepanel/ImportExportView.tsx`
- Create supporting components under `src/ui/components/import/`

Flow: select file → preview → choose merge/source collection → confirm → progress → verified summary → undo button.

### Task 1.6: Import the real file

**Operational verification:**
1. Back up current extension data.
2. Preview `/Users/jakkie/Dev/TabOS/tabs`.
3. Compare preview counts to the known baseline.
4. Import as merge into source collection “MBP import 2026-06.”
5. Read back IndexedDB counts through diagnostics.
6. Search and restore several known suspended records.
7. Test rollback on a synthetic batch before retaining the real import.

---

## Milestone 2: Rust core and portable SQLite

**Outcome:** Durable portable storage and import logic exist independently of Chrome.

### Task 2.1: Initialize Rust workspace

**Files:**
- Create: `core/Cargo.toml`
- Create crates listed in repository strategy
- Create: `rust-toolchain.toml`

Set formatting, Clippy, unit-test, and migration commands. Keep domain crate free of IO/framework dependencies.

### Task 2.2: Define versioned protocol

**Files:**
- Create: `protocol/schema/*.json`
- Create: `core/crates/tabos-domain/src/*.rs`
- Create: `src/core-client/types.ts` or generated equivalents

Commands include health, import preview/commit/rollback, item CRUD, search, session save/restore, space operations, and embedding status. Include protocol version in every envelope.

### Task 2.3: Build SQLite schema

**Files:**
- Create migrations under `core/crates/tabos-store/migrations/`
- Create repository tests using temporary databases

Tables: items, spaces, item_spaces, collections, collection_items, sessions, session_items, reminders, import_batches, decisions, embeddings, settings, schema_meta. Add FTS5 virtual table and indexes.

### Task 2.4: Port canonicalization/import pipeline

**Files:**
- Create modules in `tabos-import`
- Reuse shared fixtures as golden tests

The Rust and TypeScript preview outputs must match for the same fixture. Once integrated, Rust becomes authoritative.

### Task 2.5: Add backups

Implement consistent SQLite online backup to timestamped files, integrity check, restore preview, and retention. Never market raw file copy while the database is open as the supported backup process.

### Task 2.6: Add local transport

Implement command dispatcher first, then adapters:

- stdio/native messaging adapter for production
- optional token-protected Axum loopback adapter for development

Add integration tests that send framed messages and validate responses.

---

## Milestone 3: Semantic organization

**Outcome:** Imported tabs become useful spaces and searchable knowledge without cloud APIs.

### Task 3.1: Create evaluation dataset tool

Sample several hundred private records locally and provide a UI/CLI to label target spaces/kinds. Store labels outside Git. Metrics: top-1 accuracy, top-3 recall, unassigned rate, and cluster coherence.

### Task 3.2: Benchmark embedding models

Compare an English and multilingual compact model on the labeled set. Record model size, inference time on target Mac/Linux machines, and retrieval/classification metrics in `docs/adr/`.

### Task 3.3: Implement embedding queue

Batch, resume after restart, store model version, and re-embed only when normalized text or model changes. Never block import/UI on embeddings.

### Task 3.4: Implement hybrid search

Combine normalized FTS rank and cosine similarity. Start with an in-process vector scan because ~2k–20k items is small; avoid a vector database until measurements justify it.

### Task 3.5: Implement bootstrap clustering

Generate cluster suggestions, domain/title descriptors, representative examples, and outliers. User acceptance creates spaces and centroids.

### Task 3.6: Implement ongoing assignment

Use explicit overrides → centroid similarity+margin → Inbox. Record every correction as a decision event and update centroids asynchronously.

---

## Milestone 4: Lifecycle and working sets

**Outcome:** TabOS actively reduces browser load and cognitive backlog.

### Task 4.1: Sessions

Capture ordered live tabs/window/group context and restore only a bounded active set. A session is reversible and independent of spaces.

### Task 4.2: Working-set budgets

Per-space and global active limits. Never close pinned/audible/form-sensitive tabs automatically in v1. Present a proposed virtualization list when confidence is low.

### Task 4.3: Snooze/reminders

Persist reminders in SQLite; mirror near-term wakeups to Chrome alarms. Rehydrate alarms after extension/service restart.

### Task 4.4: Review queue

Implement explainable scoring and batched actions with undo. Separate “library backlog” from “stale disposable tabs” so books/courses do not get treated as trash.

### Task 4.5: Daily focus view

Resume session, due reminders, top recommendations, and review count. Keep it intentionally small.

---

## Milestone 5: Packaging and optional desktop shell

**Outcome:** One installer works on macOS and Linux; desktop browsing is evaluated only after core value exists.

1. Package native host/service and Chrome extension installer.
2. Add first-run connection diagnostics.
3. Test database portability across macOS/Linux.
4. Sign/notarize packages when distribution begins.
5. Measure how often users leave TabOS to open Chrome and whether that friction is material.
6. Only then prototype a Tauri shell as another client of the same Rust core.
7. Do not move cookie databases or promise universal browser compatibility in the initial shell.

---

## 9. Validation gates

### Data correctness

- Import preview never mutates data.
- Every committed import has a batch ID and rollback.
- Counts and checksums verified after import.
- Suspender wrapper URL never becomes canonical destination.
- Duplicate policy is deterministic and tested.
- SQLite passes `PRAGMA integrity_check` after migration/backup restore.

### Performance

Target initial dataset and 10x synthetic dataset:

- 2k import preview under 1 second excluding embeddings.
- UI remains responsive during import/embedding.
- FTS search under 50 ms at 20k items.
- Hybrid search under 150 ms at 20k items on target laptops.
- Background embedding is batched and pauseable.

### Privacy/security

- No network call is needed for classification/search.
- Raw conversation and tab exports remain ignored/private.
- No automatic URL reachability crawl.
- Sensitive URLs are flagged and excluded from screenshots/logging.
- Native messaging commands are schema-validated and size-limited.
- Page content, if added later, is treated as untrusted data and never as instructions.

### Cross-platform

- Unit/integration tests on macOS and Linux.
- Extension works on Chrome/Chromium.
- Database produced on one OS opens and validates on the other.
- Model/runtime packaged for both architectures in scope.

---

## 10. Risks and tradeoffs

### Rust companion increases installation complexity

Mitigation: prove import UX inside the extension first, keep protocol narrow, and ship a guided installer/native-host diagnostic.

### Embeddings may not map cleanly to personal intent

Mitigation: evaluate on the user’s own labels; use uncertainty thresholds; keep correction cheap; use explicit overrides and collections.

### URL canonicalization can merge distinct resources

Mitigation: conservative rules, retain original URL, preview probable duplicates separately, never merge ambiguous URLs automatically.

### Browser automation can destroy work

Mitigation: no automatic closure of pinned/audible/recent/form-sensitive tabs; bounded batches; undo; sessions before switching.

### Standalone-browser temptation can derail delivery

Mitigation: the Rust core and protocol make a future Tauri shell possible without coupling v1 to browser-engine work. Require usage evidence before starting it.

---

## 11. Immediate next execution sequence

1. Protect `tabs` and `conversation.json` in `.gitignore`.
2. Test/refactor the existing suspended-URL unwrapping changes.
3. Restore ESLint.
4. Implement import preview + reversible batches in the extension using TDD.
5. Import the real `tabs` file safely and verify read-back.
6. Use the imported corpus to build a private semantic-classification evaluation set.
7. Scaffold Rust core and SQLite only after the data is safely available in TabOS.
8. Integrate embedding-first search/classification.
9. Add sessions, working-set budgets, and daily review.
10. Revisit Tauri only after several weeks of real usage.

This order delivers immediate value while keeping the long-term Rust/local-first architecture intact.

# TabOS Development Log

Last updated: 2026-07-20 (study durability session)

## 0. Current state — 2026-07-20

Reconciliation note: earlier checkpoints in this file (sections 12–14) described a
point where persistence was still failing under TDD. That is historical. The
committed codebase is well past it. As of this update the following are all
implemented, committed, and green:

- `SnapshotRepository` (sql.js WASM): browser tabs/order/active tab/navigation path
  round-trip through `<userData>/tabos.db`; restore on launch, autosave on mutation,
  save on close/quit. Integrated in `main.ts` and `browser-manager.ts`.
- Knowledge graph: `knowledge-graph.ts` projection + `KnowledgeGraphView.tsx`
  (d3-force, pan/zoom, inspector, filters); wired into Brain → Path.
- Study Mode (schema v2): full canonical domain in `<userData>/tabos-study.db` —
  paths, resources, path nodes, append-only progress events, sessions,
  deliverables, lineage edges, schema migrations. `StudyRepository` with derived
  progress/stats projections. `study-planner.ts` sequences tiles into parallel
  difficulty-ordered tracks with an OpenRouter/Anthropic backend and a
  deterministic keyword-clustering fallback. `StudyView.tsx` + `StudyGraphCanvas.tsx`
  provide path list, path detail, canvas graph (drag, link, zoom), quick progress,
  session logging, CSV/TXT import, and JSON export.
- Verified this session: 53/53 tests pass, typecheck clean, production build clean.

Latest git history (most recent first): planner orphan/linearity fixes, drag
region fix, difficulty-driven planning, parallel tracks, OpenRouter support, Edit
menu clipboard shortcuts, Study Mode graph/import/AI-plan, inline Study forms,
full-screen Study overlay, Study data layer + browser snapshot persistence,
standalone Electron browser with knowledge graph and SQLite persistence.

## 0b. Study durability session — 2026-07-20

Added the missing half of study portability plus non-destructive path removal.
All TDD-first, no existing tests weakened.

- `StudyRepository.importAll(export)`: imports a full portable export into any
  repository. Idempotent by primary key (`INSERT OR IGNORE`), so re-importing the
  same file never duplicates rows; returns per-table insert counts. Canonical data
  only — derived progress/stats are recomputed on read.
- `StudyRepository.archivePath(pathId)`: tombstones a path (`archived_at`) so it
  leaves `listPaths()` but survives in `getPathDetail` and `exportAll` and can be
  recovered.
- Shared contract (`shared/study.ts`): added `StudyImportResult`, and
  `archivePath` / `importAll` to `StudyBridge`.
- IPC + preload: added `study:archive-path` and `study:import` channels/bridge.
- UI (`StudyView.tsx`): "Import JSON" button (file picker + validation + result
  notice) beside "Export JSON"; per-card archive control with confirm; transient
  notice banner. CSS for `.study-notice` and `.study-path-archive`.
- New tests: full export → `importAll` round-trip with idempotency, and archive
  visibility/tombstone survival. Suite: 51 → 53 tests, all green.

## 0c. Navigation + quick-add + stress harness — 2026-07-21

- Quick-add to study path from the browser (`QuickAddToStudy.tsx`, `detect-resource.ts`):
  "+ Path" toolbar button opens a popover over the current tab (no mode switch),
  guesses resource type from the URL, picks/creates a path, and can re-run the AI
  arranger so the new tile lands in the graph. Collapses the native web view while
  open (same pattern as the Study overlay).
- Left tab sidebar (`Sidebar.tsx`, `tab-list.ts`): toggle in the toolbar and
  Cmd/Ctrl+B. Count header, title/URL search (AND terms), and a virtualized list
  (only the visible slice is in the DOM) so 1000+ tabs scroll smoothly. Per-tab
  load dot: gray for cold/suspended, green->red by live CPU%.
- Live usage stream: main process samples `app.getAppMetrics()` every 1.5s, maps
  renderer OS pids -> tabIds via `getLiveProcessMap()`, and pushes `browser:usage`.
  `BrowserLayout.leftInset` added so the web view sits beside the sidebar.
- Note: the sidebar toggle was first placed as a floating button near the macOS
  traffic lights and was unclickable because the window drag region swallowed the
  click. Fixed by moving it into the `.chrome-actions` toolbar cluster.
- Stress harness (`app/scripts/seed-stress.mjs`): parses the gitignored `tabs`
  export (unwraps Great Suspender wrappers), seeds N cold tabs into `tabos.db`.
  Verified 1000 real tabs: 5 renderer processes, ~1.15 GB total RSS, 997 cold tabs
  at zero renderer cost; only the active tab spins up on launch.
- Tests: pure helpers `filterTabs`/`usageColor`/`visibleWindow` and
  `detectResourceType` unit-tested. Suite: 58 -> 68 tests, all green; typecheck and
  build clean.

This file records the work completed in the current development effort, including architectural pivots, implementation details, verification, failures, and unresolved work. It is intentionally more historical than `context.md`.

## 1. Starting point

The repository began as a Chrome Manifest V3 extension located at `/Users/jakkie/Dev/TabOS`.

Original extension stack:

- TypeScript
- React
- Zustand
- Dexie / IndexedDB
- Fuse.js
- Webpack
- Vitest
- Chrome MV3 background service worker and side panel

Original extension features already present:

- Chrome tab tracking
- tab virtualization and restoration
- active-tab budget enforcement
- snoozing and conditional expiry
- workspaces
- fuzzy search
- `.tabos` export/import scaffolding
- L1 domain and L2 TF-IDF classification

Initial repository verification:

- 28 existing extension tests passed
- TypeScript typecheck passed
- production extension build passed
- lint failed because the repository had no ESLint configuration
- Git was on `main` aligned with `origin/main`

Existing uncommitted extension changes were found in:

- `src/background/service-worker.ts`
- `src/background/tracker.ts`
- `src/ui/sidepanel/SettingsView.tsx`

Those changes add support for extracting real URLs and titles from Great Suspender wrapper pages and improve diagnostics.

## 2. Private source material and project history

Two important private files were added to the repository root:

- `tabs`
- `conversation.json`

They are now ignored by Git through `.gitignore`.

### `tabs` analysis

The file is a plain-text browser tab export, mostly containing Great Suspender wrapper URLs.

Measured baseline:

- 2,389 non-empty records
- 2,376 recoverable HTTP(S) records
- 2,274 suspended URLs that can be unwrapped
- 2,031 exact unique URLs before deeper canonicalization
- 345 duplicates beyond the first
- 13 invalid or unsupported entries

Important constraint discovered:

- the old extension importer must not consume this raw file directly because it would store suspended `chrome-extension://` wrapper URLs rather than real destination URLs

### `conversation.json` analysis

The file is valid JSON containing the complete product-design conversation:

- title: `Managing thousands of browser tabs efficiently`
- 46 messages
- 23 human messages
- 23 assistant messages
- time range: 2026-05-04 through 2026-06-29

The conversation established that the project vision evolved far beyond the extension:

- TabOS must render websites inside the app
- redirecting to Chrome is unacceptable
- the user is framework/language agnostic
- TabOS must be AI-native
- users should be able to connect OpenRouter or an OpenAI-compatible local model
- AI should group tabs, create notes, reminders, tasks, and improve workflows
- TabOS should preserve provenance and the path through web work
- the domain is an Obsidian-like graph of pages, visits, sessions, projects, notes, people, decisions, tasks, and relationships
- embeddings should be first-class; L1/L2 rules are not sufficient as the final intelligence layer

## 3. Architecture decisions

Several alternatives were considered:

- continuing as a Chrome extension
- Tauri with platform webviews
- raw Wry/Dioxus
- a standalone Electron browser
- Rust versus an all-TypeScript application

Final current direction:

- standalone Electron application
- bundled Chromium for consistent macOS/Linux website compatibility
- React + TypeScript for the trusted browser UI
- `WebContentsView` for isolated remote websites
- bounded live renderer pool; most tabs remain logical/frozen records
- graph-shaped durable model
- SQLite as the initial embedded storage implementation
- portable Markdown note vault for human-owned notes
- pluggable AI provider gateway for OpenRouter and local OpenAI-compatible endpoints

Why Electron was selected:

- websites must render inside TabOS
- Chromium compatibility is more important than small binary size
- Tauri would use WKWebView on macOS and WebKitGTK on Linux, creating compatibility differences
- Electron exposes sessions, cookies, downloads, permissions, renderer lifecycle, and navigation APIs directly
- a bounded renderer pool addresses the largest resource issue even though Electron itself has baseline overhead

Important limitation documented:

- no embedded browser can guarantee literally every website
- Google OAuth policies can reject embedded user agents
- DRM, anti-automation, enterprise policies, or hardware integrations can still be exceptions

## 4. Architecture documents created

Plans were written under `.hermes/plans/`:

- `.hermes/plans/2026-07-16_002231-tabos-product-architecture.md`
- `.hermes/plans/2026-07-16_002231-tabos-product-architecture-v2.md`

The v2 plan is the authoritative current design. It covers:

- Electron browser shell
- graph-shaped domain on SQLite
- hybrid Markdown vault
- node and edge ontology
- append-only events and provenance
- AI provider gateway
- permissioned AI tools
- prompt-injection boundaries
- AI-native workflows
- delivery milestones

## 5. Private-data protection

`.gitignore` was extended to exclude:

- `/tabs`
- `/conversation.json`
- `/imports-private/`
- `*.tabos`
- `*.db`
- `*.db-shm`
- `*.db-wal`
- browser profile data
- backups
- standalone app build output

This prevents private browsing history, raw conversations, databases, and browser profile material from entering Git.

## 6. Standalone Electron application scaffold

A new application was created under:

`/Users/jakkie/Dev/TabOS/app`

Current stack:

- Electron 39
- React 19
- TypeScript
- Vite
- Vitest
- sql.js WASM dependency added for upcoming persistence

Main build artifacts:

- Electron main: `app/dist/main/main/main.js`
- preload: `app/dist/main/preload/preload.js`
- renderer: `app/dist/renderer/index.html`

A path mismatch initially caused Electron startup failures:

- configured entry was `dist/main/main.js`
- actual compiled entry was `dist/main/main/main.js`

That was corrected in `app/package.json` and covered by `app-entry.test.ts`.

A second path issue initially looked for renderer HTML under `dist/main/renderer/index.html`; it was corrected to `dist/renderer/index.html` and covered by `app-paths.test.ts`.

## 7. Browser shell implemented

Implemented files include:

- `app/src/main/main.ts`
- `app/src/main/browser-manager.ts`
- `app/src/main/tab-state.ts`
- `app/src/main/freeze-policy.ts`
- `app/src/main/keyboard-shortcuts.ts`
- `app/src/main/navigation-path.ts`
- `app/src/preload/preload.ts`
- `app/src/shared/browser.ts`
- `app/src/renderer/main.tsx`
- `app/src/renderer/styles.css`
- `app/src/renderer/hover-wake.ts`

Implemented browser behavior:

- websites render inside TabOS using Chromium `WebContentsView`
- persistent Chromium session partition: `persist:tabos-browser`
- multiple logical tabs
- new, close, activate, reorder tabs
- internal popup/new-window handling
- back, forward, reload, stop
- visible compact address/search bar
- address input normalizes domains and search text
- clicking/focusing address selects the entire value
- Cmd/Ctrl+L focuses and selects address
- Cmd/Ctrl+T creates a tab
- Cmd/Ctrl+W closes the active tab
- compact browser chrome integrated with macOS hidden-inset title bar
- macOS traffic lights positioned inside the toolbar
- no left sidebar/ribbon
- top tab strip
- mouse-wheel/trackpad horizontal tab scrolling without a visible scrollbar
- fixed readable tab width rather than collapsing to one letter
- pinned add-tab button outside the scroll region
- drag/drop tab reordering

## 8. Renderer lifecycle and freezing

Tabs have runtime states:

- `hot`: active renderer
- `warm`: inactive live renderer
- `cold`: no renderer

Current live-renderer budget:

- maximum six live Chromium views
- active renderer is never frozen
- excess inactive renderers are frozen in least-recently-used order
- selecting a cold tab recreates its renderer internally
- hovering a non-hot tab for two seconds activates/wakes it

Tests cover:

- LRU freezing
- never freezing active renderer
- no freezing within budget
- two-second hover wake
- cancelling hover wake when pointer leaves early

## 9. Brain split UI

A Brain button in the upper-right opens a bottom split pane while leaving the current website visible above it.

Current modes:

- Ask
- Path
- Groups
- Activity

Current interactions are prototype scaffolding, not real AI yet:

- Context opens Path
- Group open tabs opens Groups
- Summarize opens Activity
- Review last hour opens Activity
- Ask submission transitions visibly rather than doing nothing

The browser view dynamically resizes when the Brain pane opens/closes.

## 10. Navigation path / graph behavior

Path tracking was iterated several times based on user feedback.

### Initial problem: path always had two nodes

The first implementation only depicted `Session start -> current page`.

Fix:

- introduced `BrowserPathEvent`
- record committed visits across tabs
- preserve parent visit IDs
- expose path in browser snapshots

### Second problem: path recorded every redirect/intermediate URL

The implementation committed every `did-navigate` and `did-navigate-in-page` immediately, producing noise such as:

`google.com -> www.google.com -> final Google URL`

Fix:

- collect candidate URLs while a page is loading
- commit only the settled final URL after `did-stop-loading`
- ignore hash-only same-document churn
- retain genuine document navigations

### Third problem: a new tab appeared as a disconnected graph

Root cause:

- opener visit was incorrectly stored as if it were already the new tab's own previous visit

Fix:

- explicit `openedFromVisitByTab`
- first settled visit in a new tab links to its opener
- later navigation in that tab continues from its own prior visit
- path rendering uses branch depth
- cross-tab branches are indented and shown with `↳`

Current path model records:

- stable visit ID
- logical tab ID
- URL
- title
- timestamp
- optional parent visit ID

Tests cover:

- chronological cross-tab visits
- same-tab continuation
- duplicate delivery
- redirect-chain collapse
- hash-only churn suppression
- new-tab opener linkage
- same-tab continuation after a branch
- branch-depth rendering

## 11. UI iteration history

The first desktop UI had a large left sidebar. User feedback rejected it.

The design was changed to:

- browser-style top tabs
- compact top utilities
- transient then later permanently visible address bar
- Brain button in the top-right
- split Brain pane at the bottom

Further user feedback led to:

- removing visible tab scrollbar but retaining wheel scrolling
- selecting all address text on click/focus
- fixed readable tab widths
- external add button that cannot scroll away
- compacting toolbar from 72px to 52px
- integrating native title bar to eliminate duplicate gaps
- increasing contrast of tabs, buttons, and address bar

Current design direction is minimal, dark, Linear-inspired, with subtle violet accents.

## 12. Tests and verification history

The standalone app test suite grew incrementally under TDD.

At the last fully passing point before persistence work:

- 25/25 app tests passed
- TypeScript checks passed
- production build passed

Current test files:

- `app-entry.test.ts`
- `app-paths.test.ts`
- `tab-state.test.ts`
- `freeze-policy.test.ts`
- `keyboard-shortcuts.test.ts`
- `navigation-path.test.ts`
- `hover-wake.test.ts`

A new persistence test was added but its implementation is not yet complete:

- `snapshot-repository.test.ts`

Therefore the current test command is intentionally red:

- 25 existing tests pass
- persistence suite fails because `snapshot-repository.ts` does not yet exist

This is the expected TDD RED state for the next feature.

## 13. Persistence attempt and blocker

The next milestone was started: durable restart persistence.

Planned persistent state:

- logical tabs
- tab order
- active tab
- path events and parent relationships
- runtime states normalized on restore

An attempt was made to install `better-sqlite3`.

It failed because:

- current shell Node is x64 Node 20.14
- Electron is arm64
- no matching prebuilt native binary was available
- local compilation invoked node-gyp
- the configured Xcode installation is broken (`libxcodebuildLoader.dylib` / missing symbol)

Decision:

- use `sql.js` WASM for this milestone to avoid native ABI and Xcode dependencies
- `sql.js` and `@types/sql.js` were installed successfully

A failing round-trip persistence test now exists in:

`app/src/main/snapshot-repository.test.ts`

It expects:

- fresh DB returns `null`
- save snapshot
- close DB
- reopen file
- tabs, order, active tab, and path round-trip exactly

Implementation of `SnapshotRepository` is still pending.

## 14. OpenCode attempt

The user invoked the OpenCode skill.

Readiness checks showed:

- `opencode` was not installed

Global install attempt failed due to permission error under `/usr/local/lib/node_modules`.

A user-local install command was proposed, but the user denied the command. Per tool safety rules it was not retried.

No OpenCode agent work was performed.

## 15. Environment notes

Host:

- macOS 26.5.2
- Apple Silicon host
- repository: `/Users/jakkie/Dev/TabOS`

Known environment problems:

- Xcode installation is broken; use `DEVELOPER_DIR=/Library/Developer/CommandLineTools` for Git
- native Node module compilation may fail until Xcode/toolchain is repaired
- shell prints a noisy Conda activation traceback whenever Electron starts; this is unrelated to the app
- development Electron binary prints Bluetooth/FIDO metadata warnings; packaging should add proper Info.plist metadata
- old Electron background process termination notifications are expected because rebuilds intentionally kill and restart the previous app

## 16. Git status at this checkpoint

Tracked modifications:

- `.gitignore`
- `src/background/service-worker.ts`
- `src/background/tracker.ts`
- `src/ui/sidepanel/SettingsView.tsx`

Untracked major additions:

- `.hermes/`
- `app/`

No commits were created during this work.

## 17. Commands

Standalone app:

```bash
cd /Users/jakkie/Dev/TabOS/app
npm install
npm test
npm run typecheck
npm run build
npm start
```

If Git fails due to Xcode selection:

```bash
DEVELOPER_DIR=/Library/Developer/CommandLineTools git status
```

Private source files remain at:

- `/Users/jakkie/Dev/TabOS/tabs`
- `/Users/jakkie/Dev/TabOS/conversation.json`

Do not commit them.

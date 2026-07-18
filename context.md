# TabOS Current Context

Last updated: 2026-07-18 (takeover session)

This is the working handoff document for continuing TabOS development. For chronological history and implementation details, read `log.md`. For the long-form architecture, read `.hermes/plans/2026-07-16_002231-tabos-product-architecture-v2.md`.

## 0. Status update — 2026-07-18

The persistence milestone (section 5/6 below) and the knowledge-graph visualization are now COMPLETE and verified:

- 30/30 tests pass, typecheck passes, production build passes
- `SnapshotRepository` (sql.js) round-trips tabs/order/active/path through `<userData>/tabos.db`
- restore on launch, autosave on mutations, save on close/quit
- Brain → Path renders an interactive force-directed knowledge graph (d3-force): canonical page nodes sized by visits, typed navigated/opened-from edges, pan/zoom, search filter, edge toggles, node inspector, double-click opens the page

The next milestone is section 7 Milestone 2: safe import of the real `tabs` export (preview + batch + rollback), then the model gateway.

## 1. Product vision

TabOS is an AI-native standalone browser and durable brain for web work.

It must:

- render websites inside TabOS; redirecting to Chrome is unacceptable
- support thousands of logical tabs while keeping only a bounded number of live renderers
- preserve the user's path through pages, tabs, sessions, searches, notes, projects, people, decisions, tasks, and reminders
- present that memory as a serious Obsidian-like interactive knowledge graph/brain map, not a chronological list or decorative path mockup; nodes and typed edges must be explorable, filterable, selectable, and able to reveal/open source context
- treat provenance and relationships as first-class data
- support OpenRouter and OpenAI-compatible local providers such as Ollama, LM Studio, and vLLM
- let AI group tabs, generate cited notes, create tasks/reminders, reconstruct context, and improve from explicit user feedback
- remain functional without an AI provider
- keep generated knowledge inspectable, editable, cited, and reversible
- keep user data local and portable

The domain is an Obsidian-like graph. SQLite is the initial embedded implementation of that graph; Markdown files will hold portable note bodies.

## 2. Current architecture

```text
Electron main process
  ├─ BaseWindow
  ├─ trusted React shell in WebContentsView
  ├─ isolated remote websites in WebContentsView pool
  ├─ persistent Chromium session/profile
  ├─ BrowserManager
  ├─ navigation path graph in memory
  └─ upcoming SQLite/sql.js repository

React renderer
  ├─ compact top tab strip
  ├─ address/search bar
  ├─ browser controls
  └─ bottom Brain split pane

Shared typed IPC
  └─ browser snapshot, commands, layout and focus events
```

Technology:

- Electron 39
- Chromium `WebContentsView`
- React 19
- TypeScript
- Vite
- Vitest
- sql.js WASM selected for persistence

## 3. What is already working

### Internal browser

- websites render inside TabOS
- persistent Chromium profile/session
- multiple logical tabs
- internal new-window/popup handling
- back/forward/reload/stop
- address/search normalization
- visible compact address bar
- click/focus selects entire address
- Cmd/Ctrl+L focuses address
- Cmd/Ctrl+T creates tab
- Cmd/Ctrl+W closes active tab
- tab closing and activation
- drag/drop ordering
- horizontal wheel/trackpad scrolling without visible scrollbar
- fixed readable tab widths
- add button remains visible outside scrolling region

### Resource management

- hot/warm/cold runtime states
- maximum six live renderers
- active renderer is protected
- inactive LRU views are automatically frozen
- cold tab selection recreates the renderer
- two-second hover activates/wakes a non-hot tab

### Browser UI

- no left sidebar
- compact 52px integrated macOS toolbar
- native traffic lights inside the toolbar
- dark minimal design with improved contrast
- Brain button in upper-right
- Brain opens as a bottom split while browser stays visible

### Navigation graph

- settled top-level page visits are recorded
- redirect chains collapse to one final visit
- hash-only URL churn is ignored
- same-tab navigation appends rather than overwrites
- new tabs preserve an explicit `OPENED_FROM` parent
- further navigation in the child tab continues from that child
- branches are rendered as an indented tree
- path data includes IDs, tab IDs, URL, title, time, and parent visit ID

### Brain prototype

- modes: Ask, Path, Groups, Activity
- controls visibly switch modes
- Path renders the current in-memory navigation tree
- model calls, durable notes, grouping, reminders, and statistics are not implemented yet

## 4. Current test status

Before persistence work, all 25 implemented tests passed, typecheck passed, and production build passed.

A new persistence test has been added first under TDD:

`app/src/main/snapshot-repository.test.ts`

Current expected state:

- 25 existing tests pass
- persistence suite fails because `app/src/main/snapshot-repository.ts` is not implemented

Do not remove or weaken the failing test. Implement the repository to make it pass.

## 5. Immediate task: durable restart persistence

### Goal

Closing and reopening TabOS must restore:

- all logical tabs
- tab order
- active tab
- titles, favicons, URLs and timestamps
- navigation path events
- parent/opened-from relationships

Only a bounded set of views should be made live after restore; all other tabs should be cold.

### Dependency choice

`better-sqlite3` was attempted and failed because the environment could not build its native addon:

- Node architecture/runtime mismatch
- no suitable prebuilt binary
- broken Xcode installation

`sql.js` and `@types/sql.js` are installed and should be used for this milestone. It provides SQLite in WASM and avoids native ABI problems.

### Required repository API

Implement:

```ts
class SnapshotRepository {
  static open(filename: string): Promise<SnapshotRepository>;
  load(): BrowserSnapshot | null;
  save(snapshot: BrowserSnapshot): void;
  close(): void;
}
```

The existing test expects file-backed round-trip behavior.

### Suggested schema for the first vertical slice

Keep the first persistence slice deliberately small:

```sql
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tabs (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  favicon TEXT,
  runtime_state TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  tab_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  visited_at INTEGER NOT NULL,
  parent_visit_id TEXT
);
```

Store `activeTabId` in `app_state`.

On save:

- use one transaction
- replace/materialize current tabs and visits
- export sql.js database bytes
- write atomically via temporary file + rename

On load:

- preserve tab ordering
- normalize `isLoading` to false
- normalize `canGoBack`/`canGoForward` to false because Chromium navigation history is not restored in this slice
- normalize exactly one restored active tab to `hot`
- normalize every other tab to `cold`
- preserve path event parent IDs

The current test currently expects an exact snapshot round-trip. It may need to be adjusted first if runtime normalization is introduced; do so using TDD and explicit expected behavior, not by weakening assertions.

## 6. BrowserManager integration plan

After `SnapshotRepository` passes its isolated tests:

1. Open repository in `main.ts` under Electron `app.getPath('userData')`:

   ```text
   <userData>/tabos.db
   ```

2. Inject repository or a persistence interface into `BrowserManager`.

3. Update `BrowserManager.initialize()`:
   - load snapshot
   - if none, create default tab
   - if present, restore logical state
   - create only the active WebContentsView initially
   - load active URL
   - keep all inactive restored tabs cold

4. Autosave after meaningful mutations:
   - new tab
   - close tab
   - activate tab
   - reorder tabs
   - settled navigation commit
   - freeze/restore state changes
   - title/favicon update, preferably debounced

5. Save before destroy/quit.

6. Close repository cleanly on app shutdown.

7. Add an integration-style restart test using a temporary database and a storage-independent BrowserManager state hydration function if Electron objects are hard to mock.

## 7. After persistence

### Milestone 2: safe real-tab import

Build import preview and rollback before writing private data.

Requirements:

- parse `/Users/jakkie/Dev/TabOS/tabs`
- unwrap Great Suspender `uri`/`url`
- decode `ttl`
- preserve original wrapper for provenance
- conservative URL canonicalization
- exact deduplication
- sensitive/session URL flags
- preview counts and warnings
- one import batch ID
- atomic commit
- complete rollback
- import all pages cold/frozen
- source collection such as `MBP migration`

Expected source baseline:

- 2,389 non-empty
- 2,376 recoverable
- 2,274 wrappers
- about 2,031 exact unique
- 13 invalid

Do not crawl all imported URLs automatically.

### Milestone 3: graph foundation

Evolve persistence from current-state tables toward explicit graph/event storage:

- nodes
- edges
- append-only events
- sessions
- collections/spaces
- tasks
- reminders
- notes
- AI runs
- import batches

Important node types:

- Page
- Visit
- Tab
- Session
- Space
- Collection
- Note
- Task
- Reminder
- Concept
- Person
- Organization
- Decision
- AI Run
- Import Batch

Important edges:

- NAVIGATED_FROM
- OPENED_FROM
- CREATED_IN_SESSION
- BELONGS_TO_SPACE
- IN_COLLECTION
- MENTIONS
- RELATED_TO
- DERIVED_FROM
- SUMMARIZES
- CREATED_TASK
- HAS_REMINDER
- DECIDED_FROM

### Milestone 4: model gateway

Implement one provider interface with adapters:

- OpenRouter
- generic OpenAI-compatible endpoint
- Ollama preset
- LM Studio preset
- vLLM preset
- optional bundled local embeddings

Store secrets in OS credentials, not SQLite.

Separate model roles:

- fast organizer
- reasoning/chat
- note generation
- embedding

### Milestone 5: first complete AI workflow

Implement one end-to-end feature before adding many AI buttons:

`Group open/imported tabs`

Flow:

1. collect title/domain/path metadata
2. embed or send through configured model
3. propose groups and outliers
4. show a diff
5. rename/merge/split
6. accept/reject
7. persist groups, provenance, model/run metadata
8. learn from corrections

### Milestone 6: cited notes and reminders

- readability-based page capture
- selected-text capture
- source chunk hashes
- Markdown notes in vault
- wikilinks and backlinks
- DERIVED_FROM edges
- natural-language reminders converted to structured rules
- user confirmation before writes/destructive actions

## 8. AI-native design rules

The model must use typed tools, not arbitrary database access.

Candidate tools:

- `search_graph`
- `read_nodes`
- `get_neighbors`
- `get_work_path`
- `group_items`
- `create_note`
- `link_nodes`
- `create_task`
- `create_reminder`
- `save_session`
- `summarize_session`
- `extract_decisions`
- `propose_archive`

Permission tiers:

1. read
2. draft/propose
3. confirmed write
4. explicit destructive action

Every AI artifact must record:

- provider/model
- input source node/chunk IDs
- output artifact IDs
- prompt/tool schema version
- cost/tokens/latency when available
- acceptance/edit/rejection

Remote webpage content is untrusted data and must never override system/tool instructions.

## 9. Important files

Repository root:

- `log.md` — chronological work history
- `context.md` — this handoff/current plan
- `tabs` — private export, ignored
- `conversation.json` — private project history, ignored
- `.hermes/plans/2026-07-16_002231-tabos-product-architecture-v2.md` — authoritative architecture

Standalone app:

- `app/src/main/main.ts` — Electron setup, window, menu, IPC
- `app/src/main/browser-manager.ts` — tab/view lifecycle and path state
- `app/src/main/tab-state.ts` — pure tab-state logic
- `app/src/main/navigation-path.ts` — path filtering, parents, branch rows
- `app/src/main/freeze-policy.ts` — LRU freeze selection
- `app/src/main/keyboard-shortcuts.ts` — shortcut resolution tests/reference
- `app/src/main/snapshot-repository.test.ts` — current RED persistence test
- `app/src/shared/browser.ts` — typed snapshot/commands/bridge
- `app/src/preload/preload.ts` — safe renderer API
- `app/src/renderer/main.tsx` — browser chrome and Brain prototype
- `app/src/renderer/styles.css` — visual system

Legacy extension:

- `src/background/tracker.ts`
- `src/background/service-worker.ts`
- `src/ui/sidepanel/SettingsView.tsx`

Do not discard legacy extension changes; they include useful suspended-URL parsing.

## 10. Environment and tool constraints

- macOS 26.5.2
- repository path: `/Users/jakkie/Dev/TabOS`
- Xcode application is broken
- Git works with `DEVELOPER_DIR=/Library/Developer/CommandLineTools`
- native Node addons may fail to compile
- prefer portable/WASM dependencies unless toolchain is repaired
- Electron launch prints unrelated Conda activation noise
- development Electron Bluetooth/FIDO warnings are expected until packaging metadata exists

OpenCode:

- not installed
- global install failed due to permissions
- user denied a user-local install command
- do not retry installation without explicit user request

## 11. Current Git state

Current branch:

- `main`, tracking `origin/main`

Tracked uncommitted files:

- `.gitignore`
- legacy suspended-tab/diagnostic changes

Untracked:

- `.hermes/`
- `app/`
- `log.md`
- `context.md`

No commit has been created.

## 12. Commands

```bash
cd /Users/jakkie/Dev/TabOS/app
npm test
npm run typecheck
npm run build
npm start
```

Current `npm test` is expected to fail only on missing `SnapshotRepository` until persistence is implemented.

Git commands:

```bash
cd /Users/jakkie/Dev/TabOS
DEVELOPER_DIR=/Library/Developer/CommandLineTools git status --short --branch
```

## 13. Definition of done for the current milestone

The persistence milestone is complete only when:

1. repository round-trip tests pass
2. all prior tests still pass
3. typecheck passes
4. build passes
5. app writes `tabos.db` under user data
6. open several tabs and branches
7. close TabOS normally
8. reopen TabOS
9. tabs return in the same order
10. active tab returns
11. inactive tabs are cold
12. Path returns with parent-child branches intact
13. renderer budget remains enforced
14. database survives another save/reopen cycle

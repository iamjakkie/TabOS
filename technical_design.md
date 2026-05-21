# TabOS — Technical Design Document

## Project Overview

**TabOS** is a Chrome extension that replaces Chrome's broken tab model with an intelligent, resource-optimized tab management system. It virtualizes inactive tabs, clusters them semantically using local AI (no API keys, no accounts), enforces memory budgets, and provides workspace-based context switching — all from a single extension install.

### Core Philosophy

- Tabs are working memory, not browser chrome. Treat them as data, not DOM.
- Only active-context tabs deserve a renderer process. Everything else is metadata.
- Classification and search must work offline, locally, instantly.
- Zero configuration required at install. Smart defaults, progressive customization.

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Extension                      │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │  Background   │  │  Side Panel  │  │ Context Menu  │ │
│  │  Service      │  │  (Dashboard) │  │ + Popup       │ │
│  │  Worker       │  │              │  │               │ │
│  │              │  │  - Workspace  │  │ - Quick       │ │
│  │  - Tracker    │  │    view      │  │   snooze      │ │
│  │  - Scheduler  │  │  - Search    │  │ - Quick       │ │
│  │  - Budgeter   │  │  - Archive   │  │   classify    │ │
│  │  - Classifier │  │  - Settings  │  │ - Workspace   │ │
│  │              │  │              │  │   assign      │ │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘ │
│         │                 │                   │         │
│         └────────┬────────┴───────────────────┘         │
│                  │                                       │
│         ┌────────▼────────┐    ┌──────────────────────┐ │
│         │  State Store    │    │  Classifier Engine   │ │
│         │  (IndexedDB)    │    │                      │ │
│         │                 │    │  ┌────────────────┐  │ │
│         │  - Tab metadata │    │  │ L1: Domain     │  │ │
│         │  - Workspaces   │    │  │    heuristics  │  │ │
│         │  - Snooze queue │    │  ├────────────────┤  │ │
│         │  - Visit history│    │  │ L2: TF-IDF     │  │ │
│         │  - User prefs   │    │  │    title match  │  │ │
│         │  - Archive      │    │  ├────────────────┤  │ │
│         │                 │    │  │ L3: ONNX       │  │ │
│         └─────────────────┘    │  │    embeddings   │  │ │
│                                │  │    (lazy load)  │  │ │
│                                │  └────────────────┘  │ │
│                                └──────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### File Structure

```
tabos/
├── manifest.json                 # Extension manifest (Manifest V3)
├── CLAUDE.md                     # Claude Code instructions
├── TECHNICAL_DESIGN.md           # This document
├── package.json
├── tsconfig.json
├── webpack.config.js             # Bundles TS → JS for extension
│
├── src/
│   ├── background/
│   │   ├── service-worker.ts     # Main entry point, event listeners
│   │   ├── tracker.ts            # Tab activity tracking (lastActive, visitCount)
│   │   ├── scheduler.ts          # Snooze timers, expiry sweeps, alarms
│   │   ├── budgeter.ts           # Memory budget enforcement, LRU virtualization
│   │   ├── virtualizer.ts        # Tab close/restore with state preservation
│   │   └── digest.ts             # Periodic staleness digest notifications
│   │
│   ├── classifier/
│   │   ├── engine.ts             # Classifier orchestrator (L1 → L2 → L3 cascade)
│   │   ├── domain-rules.ts       # L1: URL/domain pattern matching
│   │   ├── tfidf.ts              # L2: TF-IDF on tab titles, lightweight clustering
│   │   ├── embeddings.ts         # L3: ONNX model wrapper (lazy-loaded)
│   │   ├── clustering.ts         # k-means / hierarchical clustering on embeddings
│   │   └── types.ts              # Shared classifier types
│   │
│   ├── search/
│   │   ├── fuzzy.ts              # Fuzzy search engine (Fuse.js initially, WASM later)
│   │   └── index.ts              # Search index maintenance
│   │
│   ├── store/
│   │   ├── db.ts                 # IndexedDB wrapper (Dexie.js)
│   │   ├── schema.ts             # Database schema and migrations
│   │   └── types.ts              # TabEntry, Workspace, SnoozeItem, etc.
│   │
│   ├── ui/
│   │   ├── sidepanel/
│   │   │   ├── index.html        # Side panel shell
│   │   │   ├── App.tsx           # Root React component
│   │   │   ├── WorkspaceView.tsx # Workspace tabs grouped by topic
│   │   │   ├── SearchBar.tsx     # Natural language tab search
│   │   │   ├── ArchiveView.tsx   # Archived/virtualized tabs browser
│   │   │   ├── SnoozeView.tsx    # Snoozed tabs with countdown timers
│   │   │   ├── SettingsView.tsx  # Budget, decay rules, workspace config
│   │   │   ├── ImportExportView.tsx # Import/export UI, merge conflict resolution
│   │   │   └── DigestView.tsx    # Staleness digest review
│   │   │
│   │   ├── popup/
│   │   │   ├── index.html        # Quick-action popup
│   │   │   └── Popup.tsx         # Snooze/classify/workspace quick actions
│   │   │
│   │   └── components/
│   │       ├── TabCard.tsx       # Single tab display (favicon, title, age, score)
│   │       ├── WorkspaceChip.tsx # Workspace selector pill
│   │       └── TimePicker.tsx    # Snooze duration selector
│   │
│   ├── portability/
│   │   ├── exporter.ts           # Full/selective export to TabOS archive format
│   │   ├── importer.ts           # Import + merge/overwrite strategy
│   │   ├── format.ts             # Archive format spec, versioning, validation
│   │   ├── differ.ts             # Diff/merge logic for conflicting entries
│   │   └── migrate.ts            # Format version migrations (v1 → v2, etc.)
│   │
│   ├── shared/
│   │   ├── messages.ts           # Message types for background ↔ UI
│   │   ├── constants.ts          # Default thresholds, workspace colors
│   │   └── utils.ts              # Shared utilities
│   │
│   └── wasm/                     # Future: Rust/WASM modules
│       ├── Cargo.toml            # Rust workspace (when added)
│       ├── src/
│       │   ├── lib.rs            # WASM entry, #[wasm_bindgen] exports
│       │   ├── search.rs         # Fuzzy search (replaces Fuse.js)
│       │   ├── cluster.rs        # k-means, DBSCAN clustering
│       │   └── scoring.rs        # Staleness scoring, decay functions
│       └── pkg/                  # wasm-pack output
│
├── models/                       # Bundled ONNX model (lazy-loaded)
│   └── minilm-l6-v2-quantized/
│       ├── model.onnx            # ~23MB int8 quantized
│       └── tokenizer.json        # Tokenizer config
│
├── assets/
│   ├── icons/                    # Extension icons (16, 32, 48, 128)
│   └── styles/
│       └── theme.css             # Shared CSS variables
│
└── tests/
    ├── classifier.test.ts
    ├── scheduler.test.ts
    ├── budgeter.test.ts
    └── virtualizer.test.ts
```

---

## Data Model

### IndexedDB Schema (via Dexie.js)

```typescript
// Core tab entry — exists for every tab TabOS has ever seen
interface TabEntry {
  id: string;                    // UUID, stable across close/reopen cycles
  chromeTabId?: number;          // Present only when tab is live in Chrome
  url: string;
  title: string;
  favicon: string;               // Cached favicon URL or data URI
  domain: string;                // Extracted from URL

  // Lifecycle
  state: 'active' | 'virtualized' | 'snoozed' | 'archived';
  createdAt: number;             // Timestamp: first seen
  lastActiveAt: number;          // Timestamp: last focused/interacted
  visitCount: number;            // Total focus events
  totalActiveMs: number;         // Cumulative active time

  // Classification
  workspaceId: string;           // Assigned workspace
  confidence: number;            // Classifier confidence (0-1)
  classifierLevel: 1 | 2 | 3;   // Which level assigned it (L1/L2/L3)
  tags: string[];                // Additional semantic tags
  embedding?: Float32Array;      // L3 embedding vector (if computed)

  // Snooze
  snoozeUntil?: number;          // Timestamp: when to wake
  snoozeRule?: SnoozeRule;       // Conditional snooze rule

  // Scoring
  stalenessScore: number;        // 0-1, computed by decay function
  lastScoredAt: number;          // When score was last recomputed

  // State preservation
  scrollPosition?: number;       // Y offset for restore
  formData?: Record<string, string>; // Captured form state (best-effort)
}

// Workspace definition
interface Workspace {
  id: string;
  name: string;                  // e.g., "AVIATO", "Google Contract", "Personal"
  color: string;                 // Chrome tab group color
  icon?: string;                 // Emoji or icon identifier
  domainPatterns: string[];      // Auto-assignment rules: "github.com/iamjakkie/*"
  keywordPatterns: string[];     // Title keyword rules: "pixhawk", "mavlink"
  isActive: boolean;             // Currently switched-to workspace
  tabLimit?: number;             // Per-workspace active tab cap
  decayDays: number;             // Days before virtualization (workspace-specific)
  createdAt: number;
  sortOrder: number;
}

// Snooze rules (simple and conditional)
interface SnoozeRule {
  type: 'duration' | 'conditional';

  // Duration-based: "remind me in 2 days"
  durationMs?: number;

  // Conditional: "if I don't visit for 4 days, archive it"
  condition?: {
    metric: 'consecutive_absent_days' | 'total_absent_days';
    threshold: number;
    action: 'archive' | 'delete' | 'notify';
  };
}

// User preferences
interface UserPrefs {
  maxActiveTabs: number;         // Memory budget: max live tabs (default: 50)
  maxMemoryMB: number;           // Memory budget: max Chrome memory (default: 2048)
  defaultDecayDays: number;      // Global default days before virtualization (default: 7)
  digestFrequency: 'daily' | 'weekly' | 'manual';
  digestTime: string;            // "09:00" — when to show digest
  enableL3Classifier: boolean;   // Whether to load ONNX model (default: true)
  enablePrefetch: boolean;       // Smart prefetch (default: false, v2)
  autoExportEnabled: boolean;    // Scheduled backup to synced folder
  autoExportFrequency: 'daily' | 'weekly';
  autoExportPath?: string;       // Directory path for auto-export backups
  theme: 'system' | 'light' | 'dark';
}
```

### IndexedDB Indexes

```
tabEntries:
  - [state]                      → fast filter by lifecycle state
  - [workspaceId]                → fast workspace view
  - [lastActiveAt]               → LRU ordering for budgeter
  - [stalenessScore]             → staleness-sorted views
  - [domain]                     → domain-based queries
  - [snoozeUntil]                → scheduler: find wake-ups

workspaces:
  - [sortOrder]                  → display ordering
  - [isActive]                   → current workspace lookup
```

---

## Core Systems

### 1. Tab Tracker

**Purpose:** Maintain accurate activity metadata for every tab.

**Events monitored:**
- `chrome.tabs.onActivated` → update `lastActiveAt`, increment `visitCount`
- `chrome.tabs.onUpdated` → capture URL/title changes, re-classify if changed
- `chrome.tabs.onRemoved` → if TabOS-initiated: expected; if user-initiated: mark archived
- `chrome.tabs.onCreated` → create TabEntry, run classifier, assign workspace
- `chrome.windows.onFocusChanged` → track active time accumulation

**Active time tracking:** When a tab gains focus, start a timer. When it loses focus, add elapsed time to `totalActiveMs`. This gives accurate "how much time have I actually spent on this tab" data, which is far more useful than visit count for staleness scoring.

### 2. Tab Virtualizer

**Purpose:** Close Chrome tabs while preserving the illusion they're still "open."

**Virtualization flow:**
1. Budgeter or scheduler triggers virtualization for a TabEntry
2. Capture current state: `scrollPosition` from content script (if accessible), tab index
3. Update TabEntry: `state = 'virtualized'`, clear `chromeTabId`
4. Call `chrome.tabs.remove(chromeTabId)`
5. Tab disappears from Chrome's tab bar, appears in TabOS side panel under its workspace

**Restoration flow:**
1. User clicks virtualized tab in side panel
2. `chrome.tabs.create({ url, active: true })`
3. Update TabEntry: `state = 'active'`, set new `chromeTabId`, update `lastActiveAt`
4. Attempt scroll position restore via content script injection

**What's preserved:** URL, title, favicon (cached), scroll position (best-effort), workspace assignment, all metadata.

**What's NOT preserved:** Session cookies requiring re-auth, JavaScript state, form inputs (best-effort capture via content script before close), WebSocket connections. This is acceptable — the alternative is 3,000 tabs eating 16GB of RAM.

### 3. Memory Budgeter

**Purpose:** Enforce resource limits by virtualizing least-important tabs.

**Budget enforcement algorithm:**
```
Every 60 seconds:
  activeTabs = query TabEntries where state == 'active'

  if activeTabs.count > maxActiveTabs:
    excess = activeTabs.count - maxActiveTabs
    candidates = activeTabs
      .filter(tab => tab.chromeTabId != currentlyFocusedTabId)
      .sort(tab => weightedScore(tab))  // lowest score = least important
    virtualize(candidates.slice(0, excess))

  // Optional: chrome.processes API (if available) for memory-based budgeting
```

**Weighted importance score:**
```
score = w1 * recency(lastActiveAt)       // 0-1, exponential decay
      + w2 * frequency(visitCount)        // 0-1, log-normalized
      + w3 * activeTime(totalActiveMs)    // 0-1, log-normalized
      + w4 * workspacePriority            // 1.0 for active workspace, 0.5 for others
      + w5 * pinnedBonus                  // 1.0 if Chrome-pinned

Default weights: w1=0.4, w2=0.2, w3=0.2, w4=0.15, w5=0.05
```

Tabs in the currently active workspace get a priority boost. Pinned tabs are never virtualized.

### 4. Scheduler (Snooze & Expiry Engine)

**Purpose:** Handle time-based and condition-based tab lifecycle rules.

**Uses `chrome.alarms` API** — survives service worker restarts.

**Alarm types:**
- `snooze:{tabId}` — fires at `snoozeUntil`, restores tab and sends notification
- `expiry-sweep` — runs every 6 hours, checks conditional rules
- `digest` — runs at configured digest time, generates staleness report
- `budget-check` — runs every 60 seconds, enforces memory budget
- `score-refresh` — runs every hour, recomputes staleness scores

**Conditional snooze evaluation (expiry-sweep):**
```
For each tab with a conditional snoozeRule:
  if rule.condition.metric == 'consecutive_absent_days':
    daysSinceActive = (now - tab.lastActiveAt) / MS_PER_DAY
    if daysSinceActive >= rule.condition.threshold:
      execute(rule.condition.action)  // archive, delete, or notify
```

**Notification on snooze wake:**
```
chrome.notifications.create({
  type: 'basic',
  title: 'Tab reminder',
  message: `Time to revisit: ${tab.title}`,
  buttons: [
    { title: 'Open now' },
    { title: 'Snooze again (1 day)' }
  ]
})
```

### 5. Classifier Engine

**Purpose:** Auto-assign tabs to workspaces and generate semantic tags.

**Three-level cascade — each level is tried in order, stops when confidence > threshold:**

#### Level 1: Domain Heuristics (instant, zero-cost)

Pattern matching on URL and domain. User configures workspace-to-domain mappings; defaults learned from first week of usage.

```typescript
// Built-in defaults
const domainRules: Record<string, string[]> = {
  // These are auto-detected from user's existing tab groups / bookmarks
};

// User-configured (via settings)
workspace.domainPatterns = [
  "github.com/iamjakkie/swarm-loc*",   // → AVIATO
  "github.com/iamjakkie/aviato-*",      // → AVIATO
  "docs.px4.io/*",                       // → AVIATO
  "console.cloud.google.com/*",          // → Google Contract
  "docs.databricks.com/*",              // → Google Contract
  "dataforce2.com/*",                    // → DataForce Two
];
```

Confidence: 0.95 for exact domain match, 0.8 for path prefix match.

#### Level 2: TF-IDF Title Matching (fast, <1ms per tab)

For tabs where domain alone is ambiguous (e.g., a Rust docs page could be AVIATO or DataForce Two), compute TF-IDF similarity between the tab title and a per-workspace title corpus (built from previously classified tabs).

```typescript
// Workspace title corpus (auto-maintained)
aviato_corpus: ["EKF", "kalman", "UWB", "pixhawk", "MAVLink", "swarm", "drone", "LoRa", "TDMA", ...]
dataforce_corpus: ["parquet", "arrow", "lineage", "streaming", "pipeline", "lakehouse", ...]
```

Confidence: cosine similarity score (0-1). Threshold for acceptance: 0.6.

#### Level 3: ONNX Embeddings (lazy-loaded, ~50ms per batch)

For tabs where L1 and L2 are inconclusive (confidence < 0.6), generate embeddings using bundled MiniLM-L6-v2 model and assign via nearest-centroid to workspace clusters.

- Model: `all-MiniLM-L6-v2`, quantized to int8 (~23MB)
- Runtime: `onnxruntime-web` with WASM backend
- Input: concatenation of `title + " " + domain + " " + pathSegments`
- Output: 384-dimensional embedding
- Assignment: cosine similarity to workspace centroid (mean of all workspace tab embeddings)

**Lazy loading strategy:** Model is NOT loaded at extension start. It's loaded on first L3 classification request. A loading indicator shows in the side panel. Once loaded, stays in memory for the session.

**Batch classification:** New tabs are queued. Every 30 seconds, unclassified tabs are batch-processed through L1 → L2 → L3 cascade.

### 6. Search Engine

**Purpose:** Find any tab (active, virtualized, archived) by natural language query.

**v1: Fuse.js** — fuzzy search over `title + url + tags`. Fast enough for 10k+ entries. Configurable fuzziness threshold.

**v2 (WASM upgrade):** Replace Fuse.js with Rust-based trigram index compiled to WASM. Sub-millisecond search over 50k+ entries with typo tolerance.

**v3 (semantic search):** Use L3 embeddings for semantic similarity search. User types "mesh networking article" → finds tab titled "Ad-hoc Wireless Network Topologies for UAV Swarms" even though no words overlap.

### 7. Workspace Manager

**Purpose:** Context-switch between task contexts, activating/deactivating groups of tabs.

**Workspace switch flow:**
1. User clicks "AVIATO" workspace in side panel
2. All tabs in current workspace that haven't been touched in last 5 min → virtualize
3. All virtualized tabs in AVIATO workspace → restore (up to workspace tab limit)
4. Chrome tab groups updated: AVIATO group expanded, others collapsed
5. Side panel view filters to show AVIATO workspace

**Auto-workspace based on time patterns (v2):**
- Track which workspace is active at each hour of the day
- After 2 weeks of data: suggest automatic workspace switch at pattern boundaries
- "It's 9 AM Monday — switch to Google Contract workspace?"

---

## Resource Optimization Details

### Memory Savings Model

```
Baseline (current): 3,000 tabs × ~50MB avg per renderer = ~150GB virtual memory
                    (Chrome swaps aggressively, but still ~8-16GB resident)

With TabOS (50 active tabs): 50 tabs × ~50MB = ~2.5GB virtual memory
                              + TabOS IndexedDB: ~10MB for 10k entries
                              + ONNX model (if loaded): ~50MB in WASM memory

Net savings: ~85-95% memory reduction
```

### CPU Optimization

- No renderer processes for virtualized tabs → no background JS execution, no timers, no repaints
- Service worker goes idle between alarm fires → near-zero CPU when not interacting
- Classifier batches process during idle periods (`requestIdleCallback` equivalent in service worker)
- ONNX inference runs in WASM thread, doesn't block main thread

### Storage Footprint

```
Per TabEntry (estimated): ~500 bytes without embedding, ~2KB with embedding
10,000 tabs archived: ~5-20MB in IndexedDB
ONNX model: ~23MB (loaded from extension bundle, not IndexedDB)
Total extension size: ~30MB (mostly the ONNX model)
```

---

## Portability & Cross-Device Transfer

### Problem

Tabs are trapped in a single Chrome profile on a single machine. Moving between a MacBook and a Linux workstation (or recovering from a crash) means losing everything. Chrome Sync handles bookmarks and history but NOT open tabs reliably at scale — and it certainly doesn't sync virtualized/archived/snoozed tabs or workspace assignments.

TabOS solves this because all tab state already lives as structured data in IndexedDB, not as Chrome-internal tab objects. Export is serialization; import is deserialization + merge.

### Archive Format: `.tabos`

A `.tabos` file is a gzipped JSON archive with a versioned schema:

```typescript
interface TabOSArchive {
  version: 1;                          // Format version, for migration compat
  exportedAt: string;                  // ISO timestamp
  exportSource: {
    hostname: string;                  // Machine name (for conflict UI)
    os: 'macos' | 'linux' | 'windows';
    chromeVersion: string;
    tabosVersion: string;
  };

  // Selective export: any subset can be null (partial export)
  tabEntries: TabEntry[] | null;       // All tabs (active, virtualized, snoozed, archived)
  workspaces: Workspace[] | null;      // Workspace definitions + domain/keyword rules
  userPrefs: UserPrefs | null;         // Settings, budgets, thresholds
  classifierState: {                   // Learned classifier data
    tfidfCorpora: Record<string, string[]>;  // Per-workspace term corpora
    workspaceCentroids: Record<string, number[]>;  // L3 embedding centroids
  } | null;

  // Metadata
  stats: {
    totalTabs: number;
    byState: Record<TabEntry['state'], number>;
    byWorkspace: Record<string, number>;
    archiveSizeBytes: number;
  };
}
```

**Why gzipped JSON, not SQLite or Protobuf:** JSON is human-readable (you can inspect a `.tabos` file), diff-able, and trivially parseable in every language. Gzip brings a 10k-entry archive from ~20MB to ~2-3MB. SQLite would be overkill for a flat export. Protobuf adds a build dependency for zero practical benefit at this scale.

**File size estimates:**
```
1,000 tabs (no embeddings): ~500KB raw → ~80KB gzipped
3,000 tabs (no embeddings): ~1.5MB raw → ~250KB gzipped
10,000 tabs (with embeddings): ~20MB raw → ~3MB gzipped
```

### Export System (`src/portability/exporter.ts`)

**Full export:** Dumps everything — all tabs, all workspaces, all settings, learned classifier state. This is the "I'm migrating to a new machine" flow.

**Selective export:** Export only specific workspaces (e.g., "export my AVIATO workspace to the field laptop"). The export includes only tabs belonging to selected workspaces, plus those workspace definitions and their classifier corpora.

**Auto-export (optional):** Scheduled export to a user-configured path (e.g., a Dropbox/Google Drive synced folder). Runs on the digest alarm cycle. This creates a rolling backup without any manual action. File named `tabos-backup-{hostname}-{date}.tabos`.

```typescript
interface ExportOptions {
  scope: 'full' | 'selective';
  workspaceIds?: string[];            // For selective export
  includeArchived: boolean;           // Skip archived tabs to reduce size
  includeEmbeddings: boolean;         // Skip L3 embeddings to reduce size (~10x smaller)
  includeClassifierState: boolean;    // Include learned TF-IDF corpora + centroids
  outputPath?: string;                // For auto-export; omit for download prompt
}
```

**Export flow:**
1. Query IndexedDB for selected data
2. Strip `chromeTabId` from all entries (meaningless on another machine)
3. Strip `embedding` fields if `includeEmbeddings: false`
4. Serialize to JSON, gzip compress
5. Trigger browser download dialog (or write to `outputPath` for auto-export)

### Import System (`src/portability/importer.ts`)

Import is where the complexity lives, because the target machine might already have its own tabs and workspaces.

**Three import strategies (user chooses):**

#### 1. Clean Import (Wipe & Replace)
- Clears all local TabOS data
- Loads everything from the archive
- Restores workspace definitions, settings, classifier state
- All imported tabs start as `virtualized` (not immediately opened in Chrome)
- User then selectively restores tabs or switches to a workspace

This is the "fresh machine setup" flow. Mac dies → install TabOS on Linux → import → everything's back.

#### 2. Merge Import (Non-destructive)
- Keeps all existing local data
- Adds new tabs from archive that don't exist locally (matched by URL)
- For duplicate URLs: keeps the entry with the most recent `lastActiveAt`
- Merges workspace definitions: if a workspace with the same name exists, merges their `domainPatterns` and `keywordPatterns`; if not, creates it
- Does NOT overwrite user preferences
- Merges classifier corpora (union of terms)

This is the "I use both machines and want to consolidate" flow.

#### 3. Workspace Import (Selective Merge)
- Imports only specific workspaces from the archive
- Creates workspace definitions if they don't exist locally
- Adds tabs from those workspaces, deduplicating by URL
- Leaves everything else untouched

This is the "I want my AVIATO workspace on the field laptop but nothing else" flow.

### Conflict Resolution (`src/portability/differ.ts`)

When merging, conflicts arise when the same URL exists on both machines with different metadata:

```typescript
interface MergeConflict {
  url: string;
  local: TabEntry;
  incoming: TabEntry;
  conflictFields: string[];  // Which fields differ (workspace, tags, snoozeRule, etc.)
}

interface MergeStrategy {
  // Per-field resolution
  lastActiveAt: 'newest';                // Always take the most recent
  visitCount: 'sum';                     // Combine visit counts
  totalActiveMs: 'sum';                  // Combine active time
  workspaceId: 'incoming' | 'local' | 'ask';  // Configurable
  tags: 'union';                         // Merge tag sets
  snoozeRule: 'incoming' | 'local' | 'ask';    // Configurable
  stalenessScore: 'recompute';           // Recalculate post-merge
}
```

**Default behavior:** Auto-resolve everything possible (newest timestamp, sum counts, union tags). Only surface conflicts to the user for workspace assignment if a tab is assigned to different workspaces on each machine. Show a simple conflict resolution UI in the side panel.

### Import UI Flow

1. User clicks "Import" in settings → file picker opens → selects `.tabos` file
2. TabOS parses and validates the archive (check `version`, run migrations if needed)
3. Shows summary: "This archive contains 2,847 tabs across 5 workspaces, exported from MacBook-Pro on 2026-05-18"
4. User picks strategy: Clean Import / Merge / Workspace Import
5. If Merge: shows conflict count. "47 tabs exist on both machines with different workspaces. Auto-resolve or review?"
6. Progress bar during import (batched IndexedDB writes, 500 entries per transaction)
7. Done → side panel refreshes, shows imported tabs as virtualized

### Format Versioning (`src/portability/migrate.ts`)

The `version` field in the archive enables forward compatibility:

```typescript
// When importing, check version and migrate if needed
function migrateArchive(archive: unknown): TabOSArchive {
  const version = (archive as any).version;

  if (version === 1) return archive as TabOSArchive;
  // Future: if (version === 1) return migrateV1toV2(archive);

  throw new Error(`Unknown archive version: ${version}`);
}
```

**Rule:** New fields added to TabEntry/Workspace get default values during import. Fields removed in newer versions are silently dropped. This means a v0.2 export can be imported into v0.3 without breaking.

### Cross-Browser Portability (Future)

The `.tabos` format is browser-agnostic — it's just URLs, titles, and metadata. A Firefox port of TabOS could import the same `.tabos` file. The only browser-specific data is `chromeTabId` (already stripped on export) and Chrome tab group colors (mapped to closest equivalent).

### Session Buddy / OneTab Import

For the initial migration from the current 3,000-tab setup:

```typescript
// Session Buddy exports as JSON with this structure:
interface SessionBuddyExport {
  windows: Array<{
    tabs: Array<{ url: string; title: string; }>;
  }>;
}

// OneTab exports as plain text: URL | Title per line
// TabOS parses both formats and creates TabEntries with state: 'virtualized'
```

This is in v0.1 scope — it's the bootstrap path for day one.

---

The following interfaces are designed for drop-in WASM replacement:

```typescript
// src/classifier/engine.ts — interface that both TS and WASM implement
interface ClassifierBackend {
  classifyBatch(entries: TabEntry[]): Promise<Classification[]>;
  computeEmbeddings(texts: string[]): Promise<Float32Array[]>;
  clusterEmbeddings(embeddings: Float32Array[], k: number): Promise<number[]>;
}

// src/search/fuzzy.ts — interface for search backend swap
interface SearchBackend {
  index(entries: TabEntry[]): void;
  search(query: string, limit: number): SearchResult[];
}

// src/background/budgeter.ts — interface for scoring
interface ScoringBackend {
  computeScores(entries: TabEntry[], weights: Weights): Float32Array;
}
```

When the WASM crate is ready, the `wasm-pack` output provides drop-in implementations of these interfaces. The rest of the extension code doesn't change.

### Rust/WASM Crate Structure

```rust
// src/wasm/src/lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn fuzzy_search(query: &str, entries_json: &str, limit: usize) -> String {
    // Trigram-based fuzzy search, returns JSON array of matches
}

#[wasm_bindgen]
pub fn compute_staleness_scores(entries_json: &str, weights_json: &str) -> Vec<f32> {
    // Batch staleness scoring with configurable decay functions
}

#[wasm_bindgen]
pub fn cluster_embeddings(embeddings: &[f32], dims: usize, k: usize) -> Vec<u32> {
    // k-means clustering on pre-computed embeddings
}
```

---

## Chrome APIs Used

| API | Permission | Purpose |
|-----|-----------|---------|
| `chrome.tabs` | `tabs` | Query, create, remove, update tabs |
| `chrome.tabGroups` | `tabGroups` | Color-coded workspace groups |
| `chrome.storage.local` | `storage` | Small preferences, quick state |
| `chrome.alarms` | `alarms` | Snooze timers, periodic sweeps |
| `chrome.sidePanel` | `sidePanel` | Main dashboard UI |
| `chrome.contextMenus` | `contextMenus` | Right-click snooze/classify |
| `chrome.notifications` | `notifications` | Snooze wake-ups, digest alerts |
| `chrome.windows` | — | Focus tracking for active time |
| `chrome.scripting` | `scripting` | Content script for scroll/form capture |
| `chrome.downloads` | `downloads` | Export .tabos archive file save |

### Manifest V3 Permissions

```json
{
  "manifest_version": 3,
  "permissions": [
    "tabs",
    "tabGroups",
    "storage",
    "alarms",
    "sidePanel",
    "contextMenus",
    "notifications",
    "scripting",
    "downloads"
  ],
  "host_permissions": [
    "<all_urls>"
  ]
}
```

`<all_urls>` is required for content script injection (scroll position capture). This is the most sensitive permission — document clearly in Chrome Web Store listing why it's needed.

---

## MVP Scope (v0.1)

### In Scope
- [ ] Tab tracking (lastActiveAt, visitCount, totalActiveMs)
- [ ] Tab virtualization with one-click restore
- [ ] Memory budget enforcement (max active tabs, LRU eviction)
- [ ] Snooze: right-click → snooze with preset durations (1h, 1d, 2d, 1w)
- [ ] Snooze: custom duration picker
- [ ] Conditional rules: "archive if not visited in N days"
- [ ] L1 classifier: domain-based workspace assignment
- [ ] L2 classifier: TF-IDF title matching
- [ ] Workspace switching: activate/deactivate tab groups
- [ ] Side panel: workspace view, search, snooze queue
- [ ] Context menu integration
- [ ] Notifications for snooze wake-ups
- [ ] Settings: budget limits, decay thresholds, workspace config
- [ ] Import from Session Buddy / OneTab (URL list paste)
- [ ] Export: full `.tabos` archive (all tabs, workspaces, settings)
- [ ] Export: selective by workspace
- [ ] Import: clean import (wipe & replace), all tabs restored as virtualized
- [ ] Import: merge import with auto-conflict resolution
- [ ] Import: workspace-selective import
- [ ] Import: conflict review UI for workspace assignment mismatches
- [ ] Auto-export: scheduled backup to user-configured path

### Deferred to v0.2
- [ ] L3 classifier: ONNX embedding model
- [ ] Semantic search via embeddings
- [ ] WASM modules (search, scoring, clustering)
- [ ] Smart prefetch based on usage patterns
- [ ] Auto-workspace switching based on time-of-day patterns
- [ ] Daily digest with actionable recommendations
- [ ] Scroll position / form state preservation
- [ ] Chrome Web Store listing

### Deferred to v1.0
- [ ] Real-time sync (cloud backend or P2P via WebRTC)
- [ ] Cross-browser portability (Firefox import/export)
- [ ] Tab sharing between workspaces
- [ ] Analytics dashboard (time per workspace, tab lifecycle visualization)
- [ ] Firefox port (WebExtensions API compatibility layer)

---

## Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Language | TypeScript | Type safety, Chrome API typings available |
| Build | webpack 5 | Standard for Chrome extensions, handles TS + assets |
| UI framework | React 18 | Side panel is an SPA; React is the pragmatic choice |
| UI styling | Tailwind CSS | Utility-first, small bundle, consistent with TabOS's fast iteration |
| State management | Zustand | Lightweight, no boilerplate, works with Chrome messaging |
| Database | Dexie.js (IndexedDB) | Typed IndexedDB wrapper, handles >10k entries, async |
| Fuzzy search | Fuse.js (v1) → WASM (v2) | Fuse.js is 12KB, good enough for v1 |
| ONNX runtime | onnxruntime-web | WASM backend for local model inference |
| Testing | Vitest | Fast TS testing, compatible with Chrome extension mocking |
| WASM (future) | Rust + wasm-pack | For search, scoring, clustering hot paths |

---

## Security & Privacy

- **All data stays local.** No telemetry, no API calls, no external servers.
- **No content reading.** TabOS only accesses tab URL, title, and favicon — never page content (except scroll position via opt-in content script).
- **IndexedDB is origin-isolated.** Only the extension can access its data.
- **ONNX model runs locally** in WASM sandbox. No data leaves the browser.
- **`<all_urls>` justification:** Required solely for content script injection to capture/restore scroll position. This permission is optional — TabOS works without it, just loses scroll restore.
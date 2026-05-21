# TabOS

> A Chrome extension that replaces Chrome's broken tab model with an intelligent, resource-optimized tab management system.

Most people have too many tabs open. Chrome's answer is to crash. TabOS's answer is to virtualize, classify, and forget — until you need them again.

---

## What it does

- **Virtualizes inactive tabs** — closes the renderer process, keeps all metadata. One click restores them exactly where you left off.
- **Classifies tabs into workspaces** using a three-level local AI cascade (domain rules → TF-IDF → ONNX embeddings). No API keys, no cloud, no accounts.
- **Enforces memory budgets** — configurable max active tabs, LRU eviction of least-important tabs when the budget is exceeded.
- **Snooze & expiry rules** — snooze a tab for 1 hour, 1 day, or 1 week. Or set a conditional rule: "archive this if I don't visit for 7 days."
- **Fuzzy search** across all tabs — active, virtualized, archived — by title, URL, or tag.
- **Workspace switching** — activate a workspace to restore its tabs, deactivate to virtualize them.
- **Portable archive format** — export your entire tab state to a `.tabos` file and import it on any machine. Supports clean import, merge, and workspace-selective import with auto conflict resolution.

---

## Install (development)

```bash
git clone https://github.com/iamjakkie/TabOS.git
cd TabOS
npm install
npm run build
```

Then load in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `dist/` folder
4. Click the TabOS icon in the toolbar → **Open panel →**

After code changes: `npm run build`, then click the refresh icon on the extension card.

---

## Development

```bash
npm run dev        # watch mode
npm run build      # production build → dist/
npm test           # run unit tests
npm run typecheck  # TypeScript strict check
npm run lint       # ESLint
```

---

## Architecture

```
src/
├── background/     # Service worker: tracker, virtualizer, budgeter, scheduler
├── classifier/     # L1 domain rules, L2 TF-IDF, L3 ONNX (v0.2)
├── search/         # Fuse.js fuzzy search, index maintenance
├── store/          # Dexie.js / IndexedDB schema and helpers
├── shared/         # Message types, constants, utilities
├── portability/    # .tabos archive export/import/merge
└── ui/             # React side panel + popup (Zustand state)
```

All tab state lives in IndexedDB — the service worker is stateless and restartable. The UI communicates with the background exclusively via typed `chrome.runtime` messages.

---

## Classifier

Classification runs as a cascade — each level only runs if the previous one is inconclusive:

| Level | Method | Latency | Trigger |
|-------|--------|---------|---------|
| L1 | Domain glob patterns (user-configured) | <1ms | Always |
| L2 | TF-IDF cosine similarity on tab title | <5ms | L1 confidence < threshold |
| L3 | ONNX MiniLM-L6-v2 embeddings *(v0.2)* | ~50ms batch | L2 confidence < threshold |

The TF-IDF corpus is updated every time a tab is manually reassigned — this is the learning loop.

---

## Portability

TabOS exports to `.tabos` — a gzipped, versioned JSON archive. Import supports:

- **Clean** — wipe and replace (new machine setup)
- **Merge** — non-destructive, deduplicates by URL, auto-resolves conflicts
- **Workspace-selective** — import only specific workspaces

Also accepts OneTab and plain URL list (one URL per line) pastes.

---

## Roadmap

### v0.1 (current)
- [x] Tab tracking and virtualization
- [x] Memory budget enforcement (LRU)
- [x] Snooze with preset and custom durations
- [x] Conditional expiry rules
- [x] L1 + L2 classifier
- [x] Workspace switching
- [x] Fuzzy search across all tab states
- [x] `.tabos` export / import (clean, merge, selective)
- [ ] Workspace creation and management UI
- [ ] First-run setup flow
- [ ] Staleness digest view

### v0.2
- [ ] L3 ONNX embedding classifier
- [ ] Semantic search via embeddings
- [ ] WASM modules for search and scoring
- [ ] Auto-workspace switching by time-of-day pattern
- [ ] Daily digest with actionable recommendations

### v1.0
- [ ] Real-time sync (cloud or P2P)
- [ ] Firefox port
- [ ] Chrome Web Store listing

---

## Tech stack

| | |
|---|---|
| Language | TypeScript (strict) |
| Build | Webpack 5 |
| UI | React 18 + Zustand |
| Styling | Tailwind CSS |
| Database | Dexie.js (IndexedDB) |
| Search | Fuse.js → WASM (v0.2) |
| Tests | Vitest |
| Manifest | Chrome MV3 |

---

## Privacy

All data stays local. No telemetry, no network requests, no accounts. The ONNX model runs entirely in a WASM sandbox inside the extension. `<all_urls>` host permission is used solely for scroll position capture via content script injection — TabOS never reads page content.

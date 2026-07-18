# TabOS AI-Native Browser and Knowledge Graph Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a standalone Chromium browser whose durable product is an AI-native, provenance-preserving graph of the user’s web work: pages, visits, sessions, projects, notes, tasks, reminders, people, concepts, decisions, and the relationships among them.

**Architecture:** Electron renders arbitrary websites internally with a bounded `WebContentsView` pool. A local TypeScript application core stores structured records, graph edges, event history, full-text indexes, and vectors in SQLite; user-authored/generated notes are portable Markdown files in a vault. AI providers are pluggable through one model gateway supporting OpenRouter and OpenAI-compatible local endpoints such as Ollama, LM Studio, and vLLM. Every AI output is an artifact with citations, provenance, model metadata, and an undoable event trail.

**Tech Stack:** Electron, Chromium `WebContentsView`, React + TypeScript, Node worker threads, SQLite (`better-sqlite3`, FTS5, vector extension or in-memory vector index), Markdown vault, OpenRouter/OpenAI-compatible adapters, local Transformers.js fallback, Vitest, Playwright Electron.

---

## 1. Product definition

TabOS is not “a browser with AI buttons.” It is the brain and durable memory of web work.

The browser records the path by which work happened, not only the final URLs. AI operates on that history to organize work, derive notes, schedule follow-ups, reconstruct context, and improve future suggestions.

Core promises:

1. Every website opens inside TabOS.
2. Every meaningful interaction can become durable memory.
3. Relationships and provenance are first-class.
4. The primary Path/Brain representation is a serious Obsidian-like interactive knowledge graph: pages, notes, sessions, spaces, people, decisions, tasks, reminders, and AI artifacts appear as typed nodes with meaningful edges. It must support pan/zoom, selection, filtering, local-neighborhood focus, inspection, and navigation back to source context; a linear timeline is only a secondary view.
5. AI can read and propose changes across that memory with explicit tools.
6. Users can choose OpenRouter or a local OpenAI-compatible model.
7. AI output is inspectable, cited, editable, and reversible.
8. Data remains portable and useful without TabOS.

---

## 2. Why the model is a graph but storage remains SQLite

The domain is unequivocally a graph. A page links to a note, which supports a decision, which belongs to a project, which produced a task and reminder, all within a browsing session.

A graph-shaped domain does not require a graph database initially.

Use SQLite as the durable embedded engine because it provides:

- transactional local writes and migrations
- one-file portability and mature backup/integrity tooling
- FTS5 for exact search
- recursive CTEs for graph traversal
- excellent Electron/Node integration
- predictable macOS/Linux packaging
- enough scale for tens or hundreds of thousands of personal nodes/edges

Represent the property graph explicitly:

```sql
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT,
  body_ref TEXT,
  properties_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE edges (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES nodes(id),
  to_id TEXT NOT NULL REFERENCES nodes(id),
  type TEXT NOT NULL,
  properties_json TEXT NOT NULL DEFAULT '{}',
  confidence REAL,
  origin TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX edges_from_type ON edges(from_id, type);
CREATE INDEX edges_to_type ON edges(to_id, type);
```

Avoid KuzuDB despite its attractive property-graph/vector features: its official repository was archived in October 2025 and its site says it is no longer actively supported. Do not make the product depend on an abandoned embedded database.

Introduce a graph database later only if measured multi-hop workloads exceed SQLite. Keep a repository/query interface so storage can be replaced without changing the domain.

---

## 3. Hybrid vault: structured graph plus portable notes

A TabOS vault is a directory:

```text
My TabOS/
  tabos.db                 # graph, events, indexes, settings
  notes/                   # human-readable Markdown
  attachments/             # images, PDFs, exports
  snapshots/               # optional page snapshots/screenshots
  models/                  # optional local model files
  browser-profile/         # cookies/cache/site storage; backed up separately
  backups/
```

Rules:

- SQLite is authoritative for graph identity, edges, events, visits, sessions, reminders, and indexes.
- Markdown is authoritative for note bodies so notes are editable and portable like an Obsidian vault.
- Each Markdown note has YAML frontmatter containing its stable node ID and metadata.
- `[[wikilinks]]` are parsed into graph edges.
- Graph edges are projected back into backlinks/related-items UI.
- File watcher updates the graph when notes are edited externally.
- Deleting or renaming a note never silently destroys its graph identity.

This provides Obsidian-style ownership without forcing every browser event into a Markdown file.

---

## 4. Graph ontology

### Node types

- `Page`: canonical web resource
- `Visit`: one navigation/load of a page
- `Tab`: logical tab identity across renderer suspension
- `Session`: bounded period or saved working context
- `Space`: project/area/workstream
- `Collection`: curated grouping
- `Note`: Markdown knowledge artifact
- `Task`: actionable item
- `Reminder`: scheduled action/review
- `Concept`: extracted topic/entity
- `Person`, `Organization`, `Repository`, `Document`
- `Decision`: conclusion and rationale
- `Query`: search or AI question
- `AI_RUN`: model execution record
- `ImportBatch`: provenance and rollback boundary

### Edge types

Interaction/path edges:

- `NAVIGATED_FROM`
- `OPENED_FROM`
- `CREATED_IN_SESSION`
- `VISITED_AS_TAB`
- `FOLLOWED_LINK`
- `SEARCH_RESULT_OF`
- `RESUMED_FROM`

Knowledge edges:

- `BELONGS_TO_SPACE`
- `IN_COLLECTION`
- `MENTIONS`
- `RELATED_TO`
- `SUPPORTS`
- `CONTRADICTS`
- `ANSWERED_BY`
- `DERIVED_FROM`
- `SUMMARIZES`
- `DECIDED_FROM`
- `BLOCKS`
- `DEPENDS_ON`

Workflow edges:

- `CREATED_TASK`
- `HAS_REMINDER`
- `COMPLETED_BY`
- `SUPERSEDES`
- `DUPLICATE_OF`

Every inferred edge stores confidence, origin (`user`, `browser`, `import`, `ai`), model/run ID where applicable, and creation time. User-created edges always outrank inferred edges.

---

## 5. Event-sourced memory and provenance

“Everything is remembered” should not mean uncontrolled screenshots or keylogging. It means every TabOS domain mutation and navigation relationship is represented as an append-only event.

```text
TAB_CREATED
NAVIGATION_STARTED
NAVIGATION_COMMITTED
TAB_SUSPENDED
TAB_RESTORED
SESSION_STARTED
PAGE_ASSIGNED_TO_SPACE
NOTE_CREATED
EDGE_ACCEPTED
AI_PROPOSAL_ACCEPTED
REMINDER_FIRED
TASK_COMPLETED
```

Current state is materialized in nodes/edges. The event log enables:

- undo and rollback
- reconstructing work paths
- explaining why an item is grouped or recommended
- learning from corrections
- syncing later without overwriting history
- debugging AI behavior

Each AI artifact records:

- provider and model
- prompt/tool schema version
- input node IDs and source chunk hashes
- output artifact IDs
- token/cost/latency metadata when available
- user acceptance/edit/rejection

No AI-generated note or relationship should appear without a `DERIVED_FROM` path to its sources.

---

## 6. AI-native model gateway

One internal API supports all providers:

```ts
interface ModelProvider {
  listModels(): Promise<ModelInfo[]>;
  chat(request: ChatRequest): Promise<ChatResponse>;
  stream(request: ChatRequest): AsyncIterable<ChatDelta>;
  embed?(request: EmbedRequest): Promise<EmbeddingResponse>;
  testConnection(): Promise<ConnectionResult>;
}
```

Adapters:

- OpenRouter
- generic OpenAI-compatible endpoint
- Ollama preset
- LM Studio preset
- vLLM preset
- optional bundled Transformers.js embeddings

Provider configuration separates roles:

- fast/cheap organizer model
- reasoning model
- summarization/note model
- embedding model

API keys are stored using OS credential storage, never in SQLite or Markdown. Local endpoint URLs and non-secret preferences can be stored in settings.

The application must remain functional without a chat model: browsing, graph editing, notes, reminders, exact search, and optionally bundled local embeddings still work.

---

## 7. AI tools, not hidden automation

The model interacts with TabOS through a typed tool layer:

- `search_graph`
- `read_nodes`
- `get_neighbors`
- `get_work_path`
- `create_note`
- `link_nodes`
- `suggest_space`
- `group_items`
- `create_task`
- `create_reminder`
- `save_session`
- `summarize_session`
- `extract_decisions`
- `propose_archive`

Permission tiers:

1. Read: search and inspect graph.
2. Draft: create preview artifacts/proposals.
3. Write with confirmation: notes, links, groups, reminders.
4. Destructive: archive/close/delete; always explicit or governed by a user-created rule.

Every multi-item AI action first creates a proposal diff. Acceptance commits one transaction and one undoable event group.

---

## 8. Content acquisition and prompt-injection boundary

To generate useful notes, TabOS needs more than titles and URLs. Capture should be explicit and layered:

- always: URL, title, favicon, navigation path, timestamps
- default when user invokes AI on a page: readability-extracted visible article text
- optional: selected text, PDF text, screenshot, full DOM snapshot
- never by default: passwords, form fields, payment fields, private inputs

Remote page content is untrusted data. It can contain instructions aimed at the model. Therefore:

- page text is always passed as quoted source material, never as system/tool instructions
- model tools are defined by TabOS, not by page content
- tool calls are permission-checked outside the model
- generated claims cite source node/chunk IDs
- sensitive origins can disable capture automatically
- users can inspect and delete captured content

---

## 9. AI-native workflows

### Group this browsing session

AI reviews the session graph and proposes spaces/collections, representative labels, and outliers. User accepts or edits the diff.

### Turn research into a note

AI creates a Markdown note with:

- question/objective
- synthesized findings
- disagreements and uncertainty
- next actions
- source citations/backlinks
- links to the session and project

### Remember where this came from

Every page preserves `OPENED_FROM`, search-query, parent tab, and session edges. A user can ask: “How did I end up at this paper?” and inspect the path.

### Resume work

AI reconstructs the last session: pages used, note changes, decisions, unresolved tasks, and recommended next step. Selecting it restores an internal bounded renderer set.

### Remind me intelligently

Natural language becomes a structured rule, shown before saving. Reminder is linked to page/note/project and includes context when it fires.

### Continuous improvement

Corrections become feedback events:

- moved item to another space
- rejected grouping
- edited generated note
- ignored recommendation
- completed or archived item

Models do not silently fine-tune. TabOS updates centroids, examples, routing, and prompts from explicit feedback; future optional training exports are user-controlled.

---

## 10. Browser shell

Use Electron with Chromium `WebContentsView` for cross-platform compatibility.

- trusted React application chrome
- remote sites in sandboxed views
- one persistent browser profile
- bounded hot/warm/prefetch renderer pool
- cold tabs retained as graph nodes and restored internally
- no Chrome redirect for normal navigation

Security for remote views:

- `nodeIntegration: false`
- `contextIsolation: true`
- sandbox enabled
- `webSecurity: true`
- no privileged preload bridge
- explicit origin-based permission handlers
- controlled popup/new-window behavior
- current Electron/Chromium releases

Normal Chromium compatibility is the target, not a literal claim that every service will work. Google OAuth policies disallow authorization requests in developer-controlled embedded user agents; DRM and anti-automation systems can also be exceptions. Maintain a real-site compatibility suite from the user’s top domains.

---

## 11. Delivery order

### Milestone 0: Browser viability spike

1. Electron window with trusted React chrome.
2. `WebContentsView` loads arbitrary HTTPS sites internally.
3. Back/forward/reload/address bar/new tab.
4. Shared persistent session and login across restart.
5. Popup, download, permission, auth, fullscreen, media handling.
6. Renderer destroy/recreate from logical tab state.
7. Test representative sites on macOS and Linux.
8. Measure 1/5/10/50 live renderers.

Gate: do not build the knowledge system until internal browsing is credible.

### Milestone 1: Durable graph foundation

1. SQLite nodes/edges/events schema.
2. Markdown vault and file watcher.
3. Tab/page/visit/session path capture.
4. Graph explorer, backlinks, local graph.
5. Undo/replay and backup/integrity checks.

### Milestone 2: Safe import

1. Great Suspender unwrapping.
2. Preview and conservative canonicalization.
3. Reversible import batches.
4. Import current `tabs` as page nodes and source collection.
5. Verify counts and restore sample pages internally.

### Milestone 3: Model gateway

1. OpenRouter adapter.
2. Generic OpenAI-compatible adapter.
3. Ollama/LM Studio presets.
4. OS credential storage.
5. connection/model test UI.
6. cost/token telemetry and budgets.

### Milestone 4: AI artifacts and tools

1. Source capture/chunking.
2. AI run/provenance nodes.
3. Tool permission layer.
4. “Group session” proposal.
5. “Create cited note” workflow.
6. Natural-language reminder workflow.
7. Proposal diff, acceptance, undo.

### Milestone 5: Semantic memory

1. Embedding pipeline.
2. Hybrid FTS/vector search.
3. Space centroid suggestions.
4. Cluster discovery.
5. Work-path and related-context retrieval.
6. Feedback-driven improvement.

### Milestone 6: Daily brain

1. Resume-work briefing.
2. Due reminders and tasks.
3. unresolved-decision view.
4. stale-work review.
5. project/session summaries.
6. user-configurable scheduled agents with strict permissions.

---

## 12. Immediate next action

Build the browser viability spike in a new application directory without deleting the current extension. The spike must prove internal website rendering, persistent login, renderer lifecycle, and representative-site compatibility. In parallel, preserve the current private tab export and conversation history outside Git. Once the spike passes, create the SQLite graph/event schema and import pipeline before adding model providers.

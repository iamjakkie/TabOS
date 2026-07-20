You are working inside the existing TabOS repository. Your task is to design and implement a new Study Mode / Learning Graph subsystem inside the current Electron desktop app without breaking the existing browser, persistence, or graph features. The implementation must be durability-first: the user wants to start using TabOS for real learning progress, so future UI or feature changes must not destroy or invalidate existing study data.[Attachment +1]
Product intent
TabOS is already evolving from a browser/tab manager into a durable local-first brain. The user now wants Study Mode as part of TabOS, not as a separate throwaway app. Study Mode should support learning paths composed of heterogeneous materials: physical books, PDFs, blog posts, articles, videos, courses, tabs, and manual checkpoints. Each path should render as a graph or structured progression view with persistent nodes, completion state, and quantitative micro-progress indicators. Data must be stored forever locally, remain portable, and be safe against future feature rewrites.[Attachment]
Current verified state of the codebase
Assume the current active app is the standalone Electron app under  /Users/jakkie/Dev/TabOS/app . The current stack and behavior are already working and verified:
•	Electron 39
•	React 19
•	TypeScript
•	Vite
•	Vitest
•	sql.js WASM for persistence
•	websites render inside TabOS via  WebContentsView 
•	compact browser shell is working
•	 SnapshotRepository  persistence is already integrated and verified in the latest handoff/log state
•	logical tabs restore on launch
•	autosave works
•	Brain → Path already renders an interactive force-directed graph
•	tests/typecheck/build are passing in the latest verified state[Attachment +1]
Do not regress any of that.
Non-goals
Do not:
•	rewrite the app shell,
•	replace Electron,
•	build mobile now,
•	build sync now,
•	add AI workflows now,
•	weaken or remove existing tests,
•	store secrets in SQLite,
•	introduce native Node addons that require a repaired Xcode toolchain.[Attachment +1]
Main objective
Design and implement the first durable vertical slice of Study Mode. This should introduce a canonical learning-domain model into SQLite and expose a usable UI in the existing TabOS desktop app.
The vertical slice must support:
1.	defining paths,
2.	attaching resources to paths as nodes,
3.	tracking per-node progress,
4.	logging study sessions,
5.	showing per-path statistics,
6.	preserving all study data across app restarts and future feature changes.[Attachment]
Durability-first requirements
This is the most important part.
You must separate ephemeral browser/app state from durable study data.
Study data must be modeled so that:
•	feature/UI changes do not require destructive rewrites,
•	historical progress is never lost,
•	derived statistics can be recomputed,
•	records are exportable,
•	future multi-device sync remains possible,
•	soft-delete/tombstone patterns can be introduced cleanly.[Attachment]
Use these principles:
•	stable immutable IDs for all user-owned entities,
•	explicit schema versioning/migrations,
•	append-friendly event modeling where appropriate,
•	no silent destructive migration,
•	canonical data separated from derived projections,
•	portable export path designed from the start.[Attachment]
Required domain model
Implement the first canonical study schema in SQLite. At minimum, design and implement tables/entities for:
•	 study_paths 
•	 study_resources 
•	 study_path_nodes 
•	 study_progress 
•	 study_sessions 
•	 study_deliverables  (or equivalent proof artifacts)
•	 study_schema_migrations  or equivalent migration/version tracking
Recommended semantics:
study_paths
Represents a learning path such as:
•	Advanced Linear Algebra
•	Astrodynamics Foundations
•	Kalman Filtering for UAV Navigation
•	Rust Systems Track
Fields should include:
•	id
•	title
•	description
•	status
•	created_at
•	updated_at
•	archived_at nullable
study_resources
Represents the underlying thing:
•	physical book
•	PDF
•	article/blog post
•	video
•	course
•	tab/page
•	manual checkpoint
Fields should include:
•	id
•	resource_type
•	title
•	source_url nullable
•	local_ref nullable
•	author_or_provider nullable
•	total_units nullable
•	unit_kind nullable ( pages ,  lessons ,  minutes ,  items , etc.)
•	metadata JSON/text if helpful
•	created_at
•	updated_at
•	archived_at nullable
study_path_nodes
Represents a resource placed into a path, with path-specific ordering and semantics. A single resource may appear in multiple paths.
Fields should include:
•	id
•	path_id
•	resource_id
•	parent_node_id nullable
•	position
•	title_override nullable
•	status
•	target_units nullable
•	notes nullable
•	created_at
•	updated_at
•	archived_at nullable
study_progress
Represents canonical progress records for a node. Do not rely only on a mutable percentage field. Prefer event-like or history-preserving structure if practical.
At minimum support:
•	current_units_completed
•	total_units_snapshot nullable
•	completion_state
•	updated_at
If you can do it cleanly, implement  study_progress_events  instead and derive current totals from events.
study_sessions
Represents time actually spent studying, tied to a path/node/resource.
Fields should include:
•	id
•	path_id nullable
•	node_id nullable
•	resource_id nullable
•	started_at
•	ended_at
•	duration_seconds
•	note nullable
•	created_at
study_deliverables
Represents proof/evidence:
•	handwritten note summary
•	typed takeaway
•	solved exercise note
•	code snippet ref
•	photo path ref later
•	summary text
Fields should include:
•	id
•	session_id nullable
•	node_id nullable
•	deliverable_type
•	content or reference
•	created_at
Progress model requirements
Each node must support a tiny progress indicator suitable for UI:
•	books/PDFs: pages read / total pages
•	courses: lessons completed / total lessons or watched minutes / total minutes
•	videos: watched / total
•	articles/blogs: unread / skimmed / read / summarized
•	checkpoints/tasks: done / not done
Design this in a generic way. Do not hardcode only books or only courses.
UI requirements
Add a first UI slice inside the current TabOS app, integrated with the existing Brain/graph direction rather than as a disconnected toy.
At minimum implement:
1.	Study Mode entry point in the existing UI.
2.	Path list view showing all study paths with top-level stats.
3.	Path detail view showing nodes/resources in a graph or structured path representation.
4.	Node cards with:
•	title,
•	type,
•	status,
•	tiny progress indicator,
•	quick action to update progress.
5.	Session logging UI:
•	quick-add study session,
•	duration,
•	optional note,
•	optional deliverable/proof.
6.	Path statistics header:
•	total nodes,
•	completed nodes,
•	overall progress,
•	time logged,
•	active streak placeholder if easy.
This first UI can be simple, but it must be real and usable.
UX constraints
Optimize for the user’s actual learning style:
•	multiple tracks in parallel,
•	small 15–60 minute windows,
•	visible progress,
•	lightweight gamification later,
•	strong need for proof and continuity,
•	does not want to redo basics unnecessarily,
•	wants selective, high-quality path progression.
That means the UX should emphasize:
•	“what next,”
•	short session logging,
•	visible completion,
•	path-level progress summaries,
•	minimal friction.
Architecture constraints
Respect the current architecture:
•	Electron main process
•	React renderer
•	typed IPC
•	sql.js persistence
•	no native addon dependencies[Attachment +1]
Add the study module cleanly:
•	repository layer for study persistence,
•	shared typed contracts,
•	renderer hooks/components,
•	no direct untyped DB access from arbitrary UI code.
Testing requirements
Work TDD-style where reasonable.
Add tests for:
•	schema creation/migration,
•	repository round-trips,
•	path/resource/node creation,
•	progress updates,
•	session logging,
•	derived path stats.
Do not weaken existing tests. Ensure all prior tests still pass.[Attachment +1]
Migration and safety requirements
Implement migration/version handling for the new study schema.
Also implement at least one safe export format for study data, even if minimal:
•	JSON export is acceptable for the first slice.
The export should include enough data to preserve:
•	paths,
•	resources,
•	nodes,
•	progress,
•	sessions,
•	deliverables.
Sync awareness
Do not implement sync now, but make the design sync-friendly:
•	stable IDs,
•	timestamps,
•	no assumptions that only one device will ever write,
•	no irreversible denormalized blobs as the only source of truth.[github +1]
Deliverables expected from you
Produce the work in this order:
1.	Brief implementation plan.
2.	Canonical SQLite schema proposal.
3.	Migration/versioning approach.
4.	Repository/API layer.
5.	UI implementation.
6.	Tests.
7.	Short developer note explaining:
•	what is canonical data,
•	what is derived,
•	how future UI changes can avoid data loss,
•	what should be done next for sync/mobile later.
Code quality bar
•	Keep the solution modular and boring rather than clever.
•	Prefer explicit types over magic.
•	Do not overbuild AI-specific abstractions yet.
•	Do not overdesign for every future use case.
•	But do ensure the data model is durable enough that the user can start storing real study progress safely.
Important repo/context notes
Repository root:
•	 /Users/jakkie/Dev/TabOS 
Important files:
•	 log.md 
•	 context.md 
•	 .hermes/plans/2026-07-16_002231-tabos-product-architecture-v2.md 
•	 app/src/main/main.ts 
•	 app/src/main/browser-manager.ts 
•	 app/src/shared/browser.ts 
•	 app/src/preload/preload.ts 
•	 app/src/renderer/main.tsx 
•	 app/src/renderer/styles.css 
Environment constraints:
•	macOS 26.5.2
•	Xcode is broken
•	prefer portable/WASM dependencies
•	Git may need  DEVELOPER_DIR=/Library/Developer/CommandLineTools 
•	do not retry installing OpenCode or native addons unless explicitly requested.[Attachment +1]
Definition of done
This task is done only when:
•	the app still builds and runs,
•	all existing tests pass,
•	new study tests pass,
•	study data survives restart,
•	a user can create a path,
•	attach at least several resource types,
•	update node progress,
•	log sessions,
•	see path stats,
•	and the implementation clearly separates durable learning data from ephemeral browser UI state.[Attachment +1]

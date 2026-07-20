import type { SetPlanInput, StudyPathDetail } from '../shared/study';

// A learning plan: an ordered lineage of nodes plus prerequisite edges.
export interface PlannedStep {
  nodeId: string;
  dependsOn: string[]; // nodeIds that should be studied first
}

export interface StudyPlan {
  order: string[];
  steps: PlannedStep[];
  // Optional parallel-track assignment: nodeId -> lane index. Nodes in different
  // lanes at the same depth are studied in parallel and laid out on separate rows.
  lanes?: Record<string, number>;
}

// Difficulty heuristic used by the deterministic fallback: foundational material
// (books/courses) is scheduled before applied material (articles/videos/checkpoints).
const TYPE_RANK: Record<string, number> = {
  book: 0, course: 1, pdf: 2, article: 3, video: 4, tab: 5, checkpoint: 6,
};

/**
 * Produce a step-by-step plan for a path. If an LLM is configured via
 * ANTHROPIC_API_KEY (or STUDY_PLANNER_API_KEY) we ask it to sequence the tiles;
 * otherwise we fall back to a deterministic foundational-first linear chain.
 * The plan is always validated against the actual node ids before use.
 */
export async function planPath(detail: StudyPathDetail): Promise<SetPlanInput> {
  const nodes = detail.nodes.map(({ node, resource }) => ({
    id: node.id,
    title: node.titleOverride ?? resource.title,
    type: resource.resourceType,
    units: resource.totalUnits,
    unitKind: resource.unitKind,
  }));
  const validIds = new Set(nodes.map((n) => n.id));

  let plan: StudyPlan | null = null;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? process.env.STUDY_PLANNER_API_KEY;
  if (nodes.length > 1) {
    try {
      if (openRouterKey) plan = await planWithOpenRouter(openRouterKey, detail.path.title, nodes);
      else if (anthropicKey) plan = await planWithAnthropic(anthropicKey, detail.path.title, nodes);
    } catch (error) {
      console.warn('[study-planner] AI planning failed, using fallback:', error);
      plan = null;
    }
  }

  if (!plan) plan = fallbackPlan(nodes);

  const lanes = plan.lanes ?? inferLanes(plan);

  // Sanitize: keep only edges/order referencing real nodes.
  const order = plan.order.filter((nodeId) => validIds.has(nodeId));
  for (const nodeId of validIds) if (!order.includes(nodeId)) order.push(nodeId);

  const edges: SetPlanInput['edges'] = [];
  const seen = new Set<string>();
  for (const step of plan.steps) {
    if (!validIds.has(step.nodeId)) continue;
    for (const dep of step.dependsOn) {
      if (!validIds.has(dep) || dep === step.nodeId) continue;
      const key = `${dep}->${step.nodeId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ sourceNodeId: dep, targetNodeId: step.nodeId, kind: 'prereq' });
    }
  }

  return {
    pathId: detail.path.id,
    edges,
    order,
    layout: layoutFromOrder(order, edges, lanes),
  };
}

type PlanNode = { id: string; title: string; type: string; units: number | null };

// Deterministic fallback that produces PARALLEL tracks instead of one long chain:
//  1. Cluster learning material into tracks by shared title keywords (union-find).
//  2. Order and chain each track internally (foundational -> advanced).
//  3. Treat checkpoints/projects as convergence nodes that depend on every
//     track's tail (fan-in), so independent tracks run side by side.
function fallbackPlan(nodes: PlanNode[]): StudyPlan {
  const checkpoints = nodes.filter((n) => n.type === 'checkpoint');
  const material = nodes.filter((n) => n.type !== 'checkpoint');

  const tracks = material.length ? clusterByKeyword(material) : [];
  const steps: PlannedStep[] = [];
  const lanes: Record<string, number> = {};
  const order: string[] = [];
  const trackTails: string[] = [];

  tracks.forEach((track, laneIndex) => {
    const sorted = [...track].sort(compareMaterial);
    sorted.forEach((node, index) => {
      lanes[node.id] = laneIndex;
      order.push(node.id);
      steps.push({ nodeId: node.id, dependsOn: index === 0 ? [] : [sorted[index - 1]!.id] });
    });
    if (sorted.length) trackTails.push(sorted[sorted.length - 1]!.id);
  });

  // Checkpoints converge from all track tails; stack them in their own lane.
  const checkpointLane = tracks.length;
  checkpoints.sort(compareMaterial).forEach((node) => {
    lanes[node.id] = checkpointLane;
    order.push(node.id);
    steps.push({ nodeId: node.id, dependsOn: [...trackTails] });
  });

  return { order, steps, lanes };
}

function compareMaterial(a: PlanNode, b: PlanNode): number {
  const rank = (TYPE_RANK[a.type] ?? 9) - (TYPE_RANK[b.type] ?? 9);
  if (rank !== 0) return rank;
  const units = (b.units ?? 0) - (a.units ?? 0);
  if (units !== 0) return units;
  return a.title.localeCompare(b.title);
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with', 'from',
  'intro', 'introduction', 'guide', 'course', 'book', 'video', 'part', 'vol',
  'volume', 'basics', 'fundamentals', 'advanced', 'beginner', 'complete',
  'learn', 'learning', 'tutorial', 'series', 'how', 'your', 'you',
]);

function tokenize(title: string): string[] {
  return title.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

// Union-find clustering: nodes sharing a significant title keyword join the same
// track. Unrelated titles form separate (parallel) tracks.
function clusterByKeyword(nodes: PlanNode[]): PlanNode[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => { parent.set(find(a), find(b)); };
  for (const node of nodes) parent.set(node.id, node.id);

  const byToken = new Map<string, string[]>();
  for (const node of nodes) {
    for (const token of tokenize(node.title)) {
      const list = byToken.get(token) ?? [];
      list.push(node.id);
      byToken.set(token, list);
    }
  }
  for (const ids of byToken.values()) {
    for (let i = 1; i < ids.length; i += 1) union(ids[0]!, ids[i]!);
  }

  const groups = new Map<string, PlanNode[]>();
  for (const node of nodes) {
    const root = find(node.id);
    const list = groups.get(root) ?? [];
    list.push(node);
    groups.set(root, list);
  }
  // Largest tracks first for stable lane ordering.
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

// When lanes aren't provided (e.g. from the LLM), derive them from weakly
// connected components of the dependency graph so disjoint chains get their own row.
function inferLanes(plan: StudyPlan): Record<string, number> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    parent.set(x, parent.get(x) ?? x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => { parent.set(find(a), find(b)); };
  for (const id of plan.order) find(id);
  for (const step of plan.steps) for (const dep of step.dependsOn) union(dep, step.nodeId);

  const laneByRoot = new Map<string, number>();
  const lanes: Record<string, number> = {};
  let next = 0;
  for (const id of plan.order) {
    const root = find(id);
    if (!laneByRoot.has(root)) laneByRoot.set(root, next++);
    lanes[id] = laneByRoot.get(root)!;
  }
  return lanes;
}

// Re-layout an existing path from its current edges/order, without changing the
// lineage. Used by the "Tidy" button to compact a sprawling manual graph.
export function tidyLayout(detail: StudyPathDetail): SetPlanInput {
  const order = [...detail.nodes]
    .sort((a, b) => a.node.position - b.node.position)
    .map((n) => n.node.id);
  const edges: SetPlanInput['edges'] = detail.edges.map((edge) => ({
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    kind: edge.kind,
  }));
  // No lineage yet: just pack tiles into a tidy grid.
  if (edges.length === 0) {
    return { pathId: detail.path.id, edges, order, layout: gridLayout(order) };
  }
  const plan: StudyPlan = { order, steps: order.map((nodeId) => ({ nodeId, dependsOn: [] })) };
  for (const edge of edges) {
    plan.steps.find((s) => s.nodeId === edge.targetNodeId)?.dependsOn.push(edge.sourceNodeId);
  }
  const lanes = inferLanes(plan);
  return { pathId: detail.path.id, edges, order, layout: layoutFromOrder(order, edges, lanes) };
}

// Simple wrapped grid for graphs with no lineage.
function gridLayout(order: string[]): Record<string, { x: number; y: number }> {
  const COL_W = 250; const ROW_H = 160; const MARGIN = 40; const COLS = 4;
  const layout: Record<string, { x: number; y: number }> = {};
  order.forEach((nodeId, index) => {
    layout[nodeId] = { x: MARGIN + (index % COLS) * COL_W, y: MARGIN + Math.floor(index / COLS) * ROW_H };
  });
  return layout;
}

// Lay out nodes so the graph reads left-to-right by dependency depth (X) and
// stacks parallel tracks on separate rows (Y = lane). This keeps DAGs compact
// instead of stretching every node into one long diagonal.
function layoutFromOrder(
  order: string[],
  edges: SetPlanInput['edges'],
  lanes: Record<string, number>,
): Record<string, { x: number; y: number }> {
  const COL_W = 250;
  const ROW_H = 150;
  const MARGIN = 40;
  const depth = new Map<string, number>();
  for (const nodeId of order) depth.set(nodeId, 0);
  // Relax depths a few passes (DAG assumed; chain is safe).
  for (let pass = 0; pass < order.length; pass += 1) {
    let changed = false;
    for (const edge of edges) {
      const d = Math.max(depth.get(edge.targetNodeId) ?? 0, (depth.get(edge.sourceNodeId) ?? 0) + 1);
      if (d !== depth.get(edge.targetNodeId)) { depth.set(edge.targetNodeId, d); changed = true; }
    }
    if (!changed) break;
  }

  // Compact lane indices to consecutive rows.
  const laneValues = [...new Set(order.map((id) => lanes[id] ?? 0))].sort((a, b) => a - b);
  const rowByLane = new Map<number, number>();
  laneValues.forEach((lane, index) => rowByLane.set(lane, index));

  const layout: Record<string, { x: number; y: number }> = {};
  const usedCell = new Map<string, number>(); // "col,row" -> stack offset for collisions
  for (const nodeId of order) {
    const col = depth.get(nodeId) ?? 0;
    let row = rowByLane.get(lanes[nodeId] ?? 0) ?? 0;
    // Resolve two nodes landing on the same (col,row) by nudging down.
    let cell = `${col},${row}`;
    while (usedCell.has(cell)) { row += laneValues.length || 1; cell = `${col},${row}`; }
    usedCell.set(cell, 1);
    layout[nodeId] = { x: MARGIN + col * COL_W, y: MARGIN + row * ROW_H };
  }
  return layout;
}

interface PlannerNode { id: string; title: string; type: string; units: number | null; unitKind: string | null }

function buildPrompt(pathTitle: string, nodes: PlannerNode[]): string {
  const catalog = nodes.map((n) => `- id=${n.id} | ${n.type} | "${n.title}"${n.units ? ` (${n.units} ${n.unitKind ?? 'units'})` : ''}`).join('\n');
  return `You are sequencing a personal learning path titled "${pathTitle}".\n`
    + `Here are the learning resources (tiles). Build a dependency graph (DAG), not a single line.\n`
    + `Group resources on the same topic into a track; different topics are separate PARALLEL tracks that can be studied at the same time.\n`
    + `A resource may depend on multiple prerequisites. Checkpoints/projects should depend on the tracks they build on.\n\n`
    + `${catalog}\n\n`
    + `Return ONLY compact JSON of this exact shape, using the given ids. "lane" is the parallel-track index (0,1,2,...) for layout:\n`
    + `{"order":["id",...],"steps":[{"nodeId":"id","dependsOn":["id",...],"lane":0}]}`;
}

function parsePlan(text: string): StudyPlan {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON in response');
  // Tolerate common LLM JSON glitches: trailing commas and truncated tails.
  const parsed = JSON.parse(repairJson(match[0])) as StudyPlan & { steps: Array<PlannedStep & { lane?: number }> };
  if (!Array.isArray(parsed.order) || !Array.isArray(parsed.steps)) throw new Error('bad plan shape');
  // Lift per-step lane hints into a lanes map if present.
  const lanes: Record<string, number> = {};
  let hasLanes = false;
  for (const step of parsed.steps) {
    if (typeof step.lane === 'number') { lanes[step.nodeId] = step.lane; hasLanes = true; }
  }
  if (hasLanes) parsed.lanes = lanes;
  return parsed;
}

async function planWithOpenRouter(apiKey: string, pathTitle: string, nodes: PlannerNode[]): Promise<StudyPlan> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://tabos.local',
      'X-Title': 'TabOS Study Mode',
    },
    body: JSON.stringify({
      model: process.env.STUDY_PLANNER_MODEL ?? 'anthropic/claude-3-haiku',
      max_tokens: 4096,
      messages: [{ role: 'user', content: buildPrompt(pathTitle, nodes) }],
    }),
  });
  if (!response.ok) throw new Error(`openrouter ${response.status}: ${await response.text()}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content ?? '';
  return parsePlan(text);
}

async function planWithAnthropic(apiKey: string, pathTitle: string, nodes: PlannerNode[]): Promise<StudyPlan> {
  const catalog = nodes.map((n) => `- id=${n.id} | ${n.type} | "${n.title}"${n.units ? ` (${n.units} ${n.unitKind ?? 'units'})` : ''}`).join('\n');
  const prompt = `You are sequencing a personal learning path titled "${pathTitle}".\n`
    + `Here are the learning resources (tiles). Order them from foundational to advanced and declare prerequisites.\n\n`
    + `${catalog}\n\n`
    + `Return ONLY compact JSON of this exact shape, using the given ids:\n`
    + `{"order":["id",...],"steps":[{"nodeId":"id","dependsOn":["id",...]}]}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.STUDY_PLANNER_MODEL ?? 'claude-3-5-haiku-latest',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`anthropic ${response.status}`);
  const data = (await response.json()) as { content?: Array<{ text?: string }> };
  const text = data.content?.map((part) => part.text ?? '').join('') ?? '';
  return parsePlan(text);
}

// Best-effort repair of small JSON defects from LLM output: strip trailing
// commas before } or ], and drop a dangling comma at the very end.
function repairJson(input: string): string {
  return input
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/,\s*$/, '');
}

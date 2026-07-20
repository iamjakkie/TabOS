import type { SetPlanInput, StudyPathDetail } from '../shared/study';

// A learning plan: an ordered lineage of nodes plus prerequisite edges.
export interface PlannedStep {
  nodeId: string;
  dependsOn: string[]; // nodeIds that should be studied first
}

export interface StudyPlan {
  order: string[];
  steps: PlannedStep[];
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
    layout: layoutFromOrder(order, edges),
  };
}

// Deterministic fallback: sort by (type rank, larger units first, title) and
// chain each node to the previous one as a prerequisite.
function fallbackPlan(nodes: Array<{ id: string; title: string; type: string; units: number | null }>): StudyPlan {
  const sorted = [...nodes].sort((a, b) => {
    const rank = (TYPE_RANK[a.type] ?? 9) - (TYPE_RANK[b.type] ?? 9);
    if (rank !== 0) return rank;
    const units = (b.units ?? 0) - (a.units ?? 0);
    if (units !== 0) return units;
    return a.title.localeCompare(b.title);
  });
  const order = sorted.map((n) => n.id);
  const steps: PlannedStep[] = sorted.map((node, index) => ({
    nodeId: node.id,
    dependsOn: index === 0 ? [] : [sorted[index - 1]!.id],
  }));
  return { order, steps };
}

// Lay out nodes along their topological depth so the graph reads left-to-right.
function layoutFromOrder(order: string[], edges: SetPlanInput['edges']): Record<string, { x: number; y: number }> {
  const COL_W = 280;
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
  const rowByCol = new Map<number, number>();
  const layout: Record<string, { x: number; y: number }> = {};
  for (const nodeId of order) {
    const col = depth.get(nodeId) ?? 0;
    const row = rowByCol.get(col) ?? 0;
    rowByCol.set(col, row + 1);
    layout[nodeId] = { x: MARGIN + col * COL_W, y: MARGIN + row * ROW_H };
  }
  return layout;
}

interface PlannerNode { id: string; title: string; type: string; units: number | null; unitKind: string | null }

function buildPrompt(pathTitle: string, nodes: PlannerNode[]): string {
  const catalog = nodes.map((n) => `- id=${n.id} | ${n.type} | "${n.title}"${n.units ? ` (${n.units} ${n.unitKind ?? 'units'})` : ''}`).join('\n');
  return `You are sequencing a personal learning path titled "${pathTitle}".\n`
    + `Here are the learning resources (tiles). Order them from foundational to advanced and declare prerequisites.\n\n`
    + `${catalog}\n\n`
    + `Return ONLY compact JSON of this exact shape, using the given ids:\n`
    + `{"order":["id",...],"steps":[{"nodeId":"id","dependsOn":["id",...]}]}`;
}

function parsePlan(text: string): StudyPlan {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON in response');
  const parsed = JSON.parse(match[0]) as StudyPlan;
  if (!Array.isArray(parsed.order) || !Array.isArray(parsed.steps)) throw new Error('bad plan shape');
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
      max_tokens: 1024,
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
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`anthropic ${response.status}`);
  const data = (await response.json()) as { content?: Array<{ text?: string }> };
  const text = data.content?.map((part) => part.text ?? '').join('') ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON in response');
  const parsed = JSON.parse(match[0]) as StudyPlan;
  if (!Array.isArray(parsed.order) || !Array.isArray(parsed.steps)) throw new Error('bad plan shape');
  return parsed;
}

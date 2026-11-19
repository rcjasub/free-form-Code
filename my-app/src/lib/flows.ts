import { parseArrow, parseShape } from "./shapes";

// Guided flows (Phase 2c): the AI's key journeys through the system ("A user
// signs in"), played step by step on the diagram. Each step names two
// sections; these find their boxes and the arrow between them on the canvas.

interface BlockLike {
  id: string;
  type?: string;
  content: string;
}

export interface FlowStep {
  from: string;
  to: string;
  text: string;
}

export interface Flow {
  title: string;
  steps: FlowStep[];
}

// Each section's box on the canvas, for the diagram read from this repo and
// commit. If the same diagram is on the canvas twice, the newest copy (last
// on the page) wins.
export function sectionBoxes(nodes: readonly BlockLike[], repo: { url: string; commitSha: string }): Map<string, string> {
  const boxes = new Map<string, string>();
  for (const n of nodes) {
    if (n.type !== "shape") continue;
    const meta = parseShape(n.content).meta;
    if (!meta?.repo || meta.repo.url !== repo.url || meta.repo.commitSha !== repo.commitSha) continue;
    boxes.set(meta.sectionId, n.id);
  }
  return boxes;
}

// The flows that can be shown here: their steps whose boxes are on the
// canvas (a step whose box was deleted is skipped), and only flows with a
// step left.
export function playableFlows(flows: readonly Flow[], boxes: ReadonlyMap<string, string>): Flow[] {
  return flows
    .map((f) => ({ ...f, steps: f.steps.filter((s) => boxes.has(s.from) && boxes.has(s.to)) }))
    .filter((f) => f.steps.length > 0);
}

export interface StepView {
  // the step's boxes (one, when it happens inside a section)
  boxes: string[];
  // the box the step arrives at
  target: string;
  // the arrow drawn between them, either way round, if there is one
  arrow: string | null;
}

export function stepView(step: FlowStep, boxes: ReadonlyMap<string, string>, nodes: readonly BlockLike[]): StepView | null {
  const from = boxes.get(step.from);
  const to = boxes.get(step.to);
  if (!from || !to) return null;
  let arrow: string | null = null;
  if (from !== to) {
    for (const n of nodes) {
      if (n.type !== "arrow") continue;
      const a = parseArrow(n.content);
      if (a.fromId === from && a.toId === to) {
        arrow = n.id;
        break;
      }
      // the arrow the other way round, if that's all there is
      if (!arrow && a.fromId === to && a.toId === from) arrow = n.id;
    }
  }
  return { boxes: from === to ? [from] : [from, to], target: to, arrow };
}

// The arrows between two AI-diagram boxes: their labels show only when
// they're lit or hovered, unless all labels are switched on.
export function diagramArrows(nodes: readonly BlockLike[]): Set<string> {
  const sections = new Set(nodes.filter((n) => n.type === "shape" && parseShape(n.content).meta).map((n) => n.id));
  const ids = new Set<string>();
  for (const n of nodes) {
    if (n.type !== "arrow") continue;
    const { fromId, toId } = parseArrow(n.content);
    if (fromId && toId && sections.has(fromId) && sections.has(toId)) ids.add(n.id);
  }
  return ids;
}

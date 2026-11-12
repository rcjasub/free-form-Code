import type { ElkExtendedEdge, ElkNode, LayoutOptions } from "elkjs/lib/elk-api";
import { anchorPoint, heightForLabel, LABEL_PAD, shapeCenter, type ShapeBox } from "./shapes";

// Where each part of an AI-drawn architecture goes on the canvas (Phase 2,
// step 6). The AI only says what the sections are and how they connect;
// this works out the positions, so the picture is always readable however
// the AI ordered things.
//
// It uses ELK's layered layout: sections flow left to right in the
// direction of their edges (frontend → API → database), with as few
// crossings as it can find, and sections nested in another (an auth module
// in the API) are laid out inside their parent's box.
//
// Arrows on the canvas follow their shapes: each end is worked out from
// where its shape is. A straight arrow does that perfectly, so an edge
// stays straight unless the straight line would cut through another box;
// only then does it get ELK's route around them as bend points. (A layered
// layout can put a box in the way of an edge that spans several layers: on
// the two diagrams of this repo, 1 or 2 edges in each.)
//
// ELK is large (about 1.6 MB), so it's loaded the first time a diagram is
// laid out, not with the app.

export interface LayoutSection {
  id: string;
  title: string;
  parentId?: string | null;
}

export interface LayoutEdge {
  from: string;
  to: string;
  label: string;
}

export interface LayoutModel {
  sections: LayoutSection[];
  edges: LayoutEdge[];
}

export interface SectionBox {
  id: string;
  // canvas coordinates of the top-left corner, with the diagram's top-left
  // at (0, 0)
  x: number;
  y: number;
  w: number;
  h: number;
  // 0 for top-level sections, 1 inside one, and so on
  depth: number;
  // holds other sections: drawn as a frame with its title at the top
  isGroup: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface RoutedEdge extends LayoutEdge {
  // where the arrow bends, in canvas coordinates; empty for a straight one
  bends: Point[];
}

export interface ArchitectureLayout {
  // parents before their children, so drawing in order puts frames behind
  boxes: SectionBox[];
  // the edges worth drawing (see layoutArchitecture)
  edges: RoutedEdge[];
  width: number;
  height: number;
}

export interface Size {
  w: number;
  h: number;
}

// Box sizes as the canvas will draw them: a rect's label at the default 14px.
export const LABEL_FONT_SIZE = 14;
const LINE_HEIGHT = 20;
// the average width of a character, as a share of the font size
const CHAR_WIDTH = 0.56;
const MIN_W = 140;
const MAX_W = 240;
const MIN_H = 64;
// room around a title, beyond the label's own padding
const SIDE_ROOM = 24;
// a group's title sits in this band at its top; its children go below
export const GROUP_HEADER = 44;
const GROUP_PAD = 24;
// how far each of two opposite arrows bows from the line between their boxes
const PAIR_BOW = 18;

function textWidth(text: string, fontSize = LABEL_FONT_SIZE) {
  return Math.ceil(text.length * fontSize * CHAR_WIDTH);
}

// A section's box, sized to its title: as wide as the title (within
// limits), and tall enough for the lines it wraps to.
export function estimateBoxSize(title: string): Size {
  const text = textWidth(title);
  const w = Math.min(MAX_W, Math.max(MIN_W, text + 2 * LABEL_PAD + SIDE_ROOM));
  const lines = Math.max(1, Math.ceil(text / (w - 2 * LABEL_PAD - SIDE_ROOM)));
  return { w, h: Math.max(MIN_H, heightForLabel("rect", lines * LINE_HEIGHT)) };
}

// How the layout reads: left to right, with room between layers for edge
// labels and between boxes for arrows to pass.
const ROOT_OPTIONS: LayoutOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  // lay nested sections out together with the rest, so edges into and out
  // of a group are taken into account on both sides
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.spacing.nodeNode": "48",
  "elk.layered.spacing.nodeNodeBetweenLayers": "64",
  "elk.spacing.edgeLabel": "8",
  "elk.edgeLabels.placement": "CENTER",
  // Chosen by measuring (layoutQuality) on two AI diagrams of this repo:
  // 0 arrows through boxes, 0 and 1 crossings, and the narrowest of the
  // settings tried (network simplex placement had up to 6 crossings).
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.thoroughness": "50",
  // routes that don't pass through boxes, used for the edges that need them
  "elk.edgeRouting": "POLYLINE",
  "elk.spacing.componentComponent": "80",
};

type ElkConstructor = new () => { layout(graph: ElkNode): Promise<ElkNode> };
let elkLoad: Promise<ElkConstructor> | null = null;
function loadElk(): Promise<ElkConstructor> {
  elkLoad ??= import("elkjs/lib/elk.bundled.js").then((m) => m.default as unknown as ElkConstructor);
  return elkLoad;
}

export interface LayoutOptionsArg {
  // box sizes; defaults to estimateBoxSize of each title
  sizeOf?: (section: LayoutSection) => Size;
  // ELK options on top of the defaults, for trying alternatives
  elkOptions?: LayoutOptions;
}

// Lays out the sections and returns each one's box. Edges between a
// section and one nested inside it are left out: the child is drawn inside
// its parent, so an arrow between them would only cross the frame.
export async function layoutArchitecture(model: LayoutModel, options: LayoutOptionsArg = {}): Promise<ArchitectureLayout> {
  const sizeOf = options.sizeOf ?? ((s: LayoutSection) => estimateBoxSize(s.title));
  const byId = new Map(model.sections.map((s) => [s.id, s]));
  // A parent that isn't a section counts as none, so a bad reference can't
  // drop a section from the picture.
  const parentOf = (s: LayoutSection) => (s.parentId && byId.has(s.parentId) && s.parentId !== s.id ? s.parentId : null);
  const childrenOf = new Map<string | null, LayoutSection[]>();
  for (const s of model.sections) {
    const parent = parentOf(s);
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), s]);
  }

  const ancestors = (id: string) => {
    const seen = new Set<string>();
    let current = byId.get(id);
    while (current && parentOf(current) && !seen.has(parentOf(current)!)) {
      seen.add(parentOf(current)!);
      current = byId.get(parentOf(current)!);
    }
    return seen;
  };

  const toNode = (s: LayoutSection): ElkNode => {
    const kids = childrenOf.get(s.id) ?? [];
    if (kids.length === 0) {
      const { w, h } = sizeOf(s);
      return { id: s.id, width: w, height: h };
    }
    // A group: ELK sizes it to fit its children, at least as wide as its
    // title, with a band at the top for the title.
    const titleW = Math.min(textWidth(s.title) + 2 * GROUP_PAD, 600);
    return {
      id: s.id,
      children: kids.map(toNode),
      layoutOptions: {
        "elk.padding": `[top=${GROUP_HEADER},left=${GROUP_PAD},bottom=${GROUP_PAD},right=${GROUP_PAD}]`,
        "elk.nodeSize.constraints": "MINIMUM_SIZE",
        "elk.nodeSize.minimum": `(${titleW}, ${GROUP_HEADER + MIN_H})`,
      },
    };
  };

  const edges = model.edges.filter(
    (e) => byId.has(e.from) && byId.has(e.to) && e.from !== e.to && !ancestors(e.from).has(e.to) && !ancestors(e.to).has(e.from),
  );
  const elkEdges: ElkExtendedEdge[] = edges.map((e, i) => ({
    id: `e${i}`,
    sources: [e.from],
    targets: [e.to],
    // Given to ELK so it leaves room for the label between the layers.
    labels: e.label ? [{ text: e.label, width: textWidth(e.label, 12) + 8, height: 16 }] : [],
  }));

  const ELK = await loadElk();
  const result = await new ELK().layout({
    id: "root",
    layoutOptions: { ...ROOT_OPTIONS, ...options.elkOptions },
    children: (childrenOf.get(null) ?? []).map(toNode),
    edges: elkEdges,
  });

  // ELK gives each node's position relative to its parent, and each edge's
  // route relative to its container (the root or a group).
  const boxes: SectionBox[] = [];
  const origin = new Map<string, Point>([["root", { x: 0, y: 0 }]]);
  const elkRoutes: ElkExtendedEdge[] = [...(result.edges ?? [])];
  const walk = (nodes: ElkNode[] | undefined, offsetX: number, offsetY: number, depth: number) => {
    for (const node of nodes ?? []) {
      const x = offsetX + (node.x ?? 0);
      const y = offsetY + (node.y ?? 0);
      origin.set(node.id, { x, y });
      elkRoutes.push(...(node.edges ?? []));
      boxes.push({
        id: node.id,
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(node.width ?? 0),
        h: Math.round(node.height ?? 0),
        depth,
        isGroup: (node.children?.length ?? 0) > 0,
      });
      walk(node.children, x, y, depth + 1);
    }
  };
  walk(result.children, 0, 0, 0);

  const bendsOf = new Map<string, Point[]>();
  for (const route of elkRoutes) {
    const at = origin.get((route as ElkExtendedEdge & { container?: string }).container ?? "root") ?? { x: 0, y: 0 };
    const bends = (route.sections ?? []).flatMap((s) => s.bendPoints ?? []);
    bendsOf.set(route.id, bends.map((p) => ({ x: Math.round(at.x + p.x), y: Math.round(at.y + p.y) })));
  }

  const lineage = lineageOf(model);
  const boxById = new Map(boxes.map((b) => [b.id, b]));
  const routed: RoutedEdge[] = edges.map((e, i) => {
    const straight = { ...e, bends: [] };
    const route = { ...e, bends: bendsOf.get(`e${i}`) ?? [] };
    return route.bends.length > 0 && boxesCrossed(straight, boxes, boxById, lineage) > 0 ? route : straight;
  });

  // Arrows both ways between two boxes (or between a box and a group, and
  // something inside that group) would lie on about the same line, their
  // labels on top of each other. Each one bows a little to its own side
  // instead: the side to the left of its direction, so the pair split.
  const related = (x: string, y: string) => lineage(x).has(y) || lineage(y).has(x);
  const straight = routed.filter((e) => e.bends.length === 0);
  const opposed = straight.filter((e) => straight.some((o) => o !== e && related(e.from, o.to) && related(e.to, o.from)));
  for (const edge of opposed) {
    const a = shapeCenter({ ...boxById.get(edge.from)!, kind: "rect" });
    const b = shapeCenter({ ...boxById.get(edge.to)!, kind: "rect" });
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    edge.bends = [{ x: Math.round((a.x + b.x) / 2 + ((b.y - a.y) / length) * PAIR_BOW), y: Math.round((a.y + b.y) / 2 - ((b.x - a.x) / length) * PAIR_BOW) }];
  }

  return { boxes, edges: routed, width: Math.round(result.width ?? 0), height: Math.round(result.height ?? 0) };
}

// For each section, itself and every section it's nested in: an arrow may
// pass through those (it starts or ends inside them).
function lineageOf(model: LayoutModel): (id: string) => Set<string> {
  const parent = new Map(model.sections.map((s) => [s.id, s.parentId ?? null]));
  return (id) => {
    const ids = new Set([id]);
    for (let p = parent.get(id); p && !ids.has(p); p = parent.get(p)) ids.add(p);
    return ids;
  };
}

// The line an arrow is drawn along, the way the canvas draws it
// (resolveArrow in shapes.ts): each end on its box's border, aimed at the
// next point along (its first bend, or the other box's center), with the
// bends between.
function pathOf(edge: RoutedEdge, boxById: Map<string, SectionBox>): Point[] | null {
  const a = boxById.get(edge.from);
  const b = boxById.get(edge.to);
  if (!a || !b) return null;
  const toBox = (box: SectionBox): ShapeBox => ({ ...box, kind: "rect" });
  const aimStart = edge.bends[0] ?? shapeCenter(toBox(b));
  const aimEnd = edge.bends[edge.bends.length - 1] ?? shapeCenter(toBox(a));
  return [anchorPoint(toBox(a), aimStart), ...edge.bends, anchorPoint(toBox(b), aimEnd)];
}

// How many boxes the arrow passes through, other than its own ends' boxes
// and the groups they're in.
function boxesCrossed(edge: RoutedEdge, boxes: SectionBox[], boxById: Map<string, SectionBox>, lineage: (id: string) => Set<string>): number {
  const path = pathOf(edge, boxById);
  if (!path) return 0;
  const skip = new Set([...lineage(edge.from), ...lineage(edge.to)]);
  return boxes.filter((box) => !skip.has(box.id) && path.some((p, i) => i > 0 && segmentHitsBox(path[i - 1], p, box))).length;
}

export interface LayoutQuality {
  // arrows passing through a box they don't start or end in (one count per
  // box crossed)
  edgesThroughBoxes: number;
  // pairs of arrows that cross each other
  edgeCrossings: number;
  // arrows that needed bends to get around boxes
  bentEdges: number;
}

// How readable a layout is, as numbers, measured on the arrows as the
// canvas will draw them (straight, or through their bends). Used to pick the
// layout options and to keep them from getting worse.
export function layoutQuality(model: LayoutModel, layout: ArchitectureLayout): LayoutQuality {
  const boxById = new Map(layout.boxes.map((b) => [b.id, b]));
  const lineage = lineageOf(model);

  let edgesThroughBoxes = 0;
  for (const edge of layout.edges) edgesThroughBoxes += boxesCrossed(edge, layout.boxes, boxById, lineage);

  const paths = layout.edges.map((e) => ({ e, path: pathOf(e, boxById) ?? [] }));
  let edgeCrossings = 0;
  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++) {
      const a = paths[i];
      const b = paths[j];
      if ([a.e.from, a.e.to].some((id) => id === b.e.from || id === b.e.to)) continue;
      const crosses = a.path.some((p, m) => m > 0 && b.path.some((q, n) => n > 0 && segmentsCross(a.path[m - 1], p, b.path[n - 1], q)));
      if (crosses) edgeCrossings++;
    }
  }
  return { edgesThroughBoxes, edgeCrossings, bentEdges: layout.edges.filter((e) => e.bends.length > 0).length };
}

type P = Point;

// Liang–Barsky: does the segment p→q enter the box (shrunk a little, so
// grazing a corner doesn't count)?
function segmentHitsBox(p: P, q: P, box: SectionBox): boolean {
  const m = 2;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  let t0 = 0;
  let t1 = 1;
  const checks: [number, number][] = [
    [-dx, p.x - (box.x + m)],
    [dx, box.x + box.w - m - p.x],
    [-dy, p.y - (box.y + m)],
    [dy, box.y + box.h - m - p.y],
  ];
  for (const [pk, qk] of checks) {
    if (pk === 0) {
      if (qk < 0) return false;
    } else {
      const t = qk / pk;
      if (pk < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

function segmentsCross(a: P, b: P, c: P, d: P): boolean {
  const cross = (o: P, p: P, q: P) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

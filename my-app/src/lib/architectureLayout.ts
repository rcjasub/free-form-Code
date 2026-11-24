import type { ElkExtendedEdge, ElkNode, LayoutOptions } from "elkjs/lib/elk-api";
import { elbowAnchor, type ShapeBox, type ShapeKind } from "./shapes";

// Where each part of an AI-drawn architecture goes on the canvas (Phase 2,
// step 6). The AI only says what the sections are and how they connect;
// this works out the positions, so the picture is always readable however
// the AI ordered things.
//
// It uses ELK's layered layout: sections flow left to right in the
// direction of their edges (browser, then server, then its data and
// workers), with as few crossings as it can find, and sections nested in
// another (an auth module in the API) are laid out inside their parent's box.
// Each section is a tile (an icon, its name underneath); the layout leaves
// room for the names.
//
// Arrows are right-angled, routed by ELK around the boxes, and drawn as
// elbow arrows (shapes.ts): their bends stay where ELK put them and each end
// meets its box straight on, so they read as tidy lines rather than
// diagonals at every angle.
//
// ELK is large (about 1.6 MB), so it's loaded the first time a diagram is
// laid out, not with the app.

export interface LayoutSection {
  id: string;
  title: string;
  parentId?: string | null;
  shape?: "rect" | "circle" | "diamond";
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
  // the tile's outline (a group's is a rect)
  kind: ShapeKind;
  // a tile's name, under it (not for a group)
  label?: { x: number; y: number; w: number; h: number };
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

// A section's tile, as the canvas draws it (ShapeNode, labelAlign "below"):
// a square with its kind's icon, its name in 16px handwriting underneath, wrapping
// at the tile's width plus TILE_LABEL_SPILL a side.
export const TILE = 64;
export const LABEL_FONT_SIZE = 16;
const TILE_LABEL_GAP = 8;
const TILE_LABEL_SPILL = 48;
const LABEL_LINE = LABEL_FONT_SIZE * 1.25;
// a character's width as a share of the font size (the handwriting font),
// a little generous so a name never wraps more than planned
const CHAR_WIDTH = 0.62;
// a group's title sits in this band at its top; its children go below
export const GROUP_HEADER = 44;
const GROUP_PAD = 24;

function textWidth(text: string, fontSize = LABEL_FONT_SIZE) {
  return Math.ceil(text.length * fontSize * CHAR_WIDTH);
}

// The room a tile's name takes under it.
export function tileLabelSize(title: string): Size {
  const max = TILE + 2 * TILE_LABEL_SPILL;
  const text = textWidth(title);
  const lines = Math.max(1, Math.ceil(text / max));
  return { w: Math.min(max, Math.max(TILE, text)), h: Math.ceil(lines * LABEL_LINE) };
}

// How the layout reads: left to right, with room between layers and tiles
// for the arrows to pass.
const ROOT_OPTIONS: LayoutOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  // lay nested sections out together with the rest, so edges into and out
  // of a group are taken into account on both sides
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.spacing.nodeNode": "48",
  "elk.layered.spacing.nodeNodeBetweenLayers": "80",
  "elk.spacing.edgeLabel": "8",
  "elk.edgeLabels.placement": "CENTER",
  // Chosen by measuring (layoutQuality) on two AI diagrams of this repo:
  // 0 arrows through boxes, 0 and 1 crossings, and the narrowest of the
  // settings tried (network simplex placement had up to 6 crossings).
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.thoroughness": "50",
  // right angles only, around the boxes
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.spacing.edgeNode": "20",
  "elk.spacing.edgeEdge": "12",
  "elk.layered.spacing.edgeNodeBetweenLayers": "20",
  "elk.layered.spacing.edgeEdgeBetweenLayers": "12",
  "elk.spacing.componentComponent": "80",
};

type ElkConstructor = new () => { layout(graph: ElkNode): Promise<ElkNode> };
let elkLoad: Promise<ElkConstructor> | null = null;
function loadElk(): Promise<ElkConstructor> {
  elkLoad ??= import("elkjs/lib/elk.bundled.js").then((m) => m.default as unknown as ElkConstructor);
  return elkLoad;
}

export interface LayoutOptionsArg {
  // ELK options on top of the defaults, for trying alternatives
  elkOptions?: LayoutOptions;
}

// Lays out the sections and returns each one's box. Edges between a
// section and one nested inside it are left out: the child is drawn inside
// its parent, so an arrow between them would only cross the frame.
export async function layoutArchitecture(model: LayoutModel, options: LayoutOptionsArg = {}): Promise<ArchitectureLayout> {
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
      // the name as an outside label, so ELK keeps other tiles and arrows
      // clear of it
      const name = tileLabelSize(s.title);
      const round = kindOf(s) !== "rect";
      return {
        id: s.id,
        width: TILE,
        height: TILE,
        labels: [{ text: s.title, width: name.w, height: name.h }],
        // A circle or diamond is met in the middle of a side: its arrows
        // attach at one point on its left and one on its right, where its
        // outline is furthest out.
        ...(round && {
          ports: [
            { id: `${s.id}:in`, x: 0, y: TILE / 2, width: 0, height: 0, layoutOptions: { "elk.port.side": "WEST" } },
            { id: `${s.id}:out`, x: TILE, y: TILE / 2, width: 0, height: 0, layoutOptions: { "elk.port.side": "EAST" } },
          ],
        }),
        layoutOptions: {
          "elk.nodeLabels.placement": "[H_CENTER, V_BOTTOM, OUTSIDE]",
          "elk.spacing.labelNode": `${TILE_LABEL_GAP}`,
          ...(round && { "elk.portConstraints": "FIXED_POS" }),
        },
      };
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
        "elk.nodeSize.minimum": `(${titleW}, ${GROUP_HEADER + TILE})`,
      },
    };
  };

  const edges = model.edges.filter(
    (e) => byId.has(e.from) && byId.has(e.to) && e.from !== e.to && !ancestors(e.from).has(e.to) && !ancestors(e.to).has(e.from),
  );
  // an edge leaves a circle or diamond from its right and arrives on its left
  const leafRound = (id: string) => !childrenOf.get(id)?.length && kindOf(byId.get(id)!) !== "rect";
  const elkEdges: ElkExtendedEdge[] = edges.map((e, i) => ({
    id: `e${i}`,
    sources: [leafRound(e.from) ? `${e.from}:out` : e.from],
    targets: [leafRound(e.to) ? `${e.to}:in` : e.to],
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
      const isGroup = (node.children?.length ?? 0) > 0;
      const w = Math.round(node.width ?? 0);
      const h = Math.round(node.height ?? 0);
      const name = isGroup ? null : tileLabelSize(byId.get(node.id)?.title ?? "");
      const section = byId.get(node.id);
      boxes.push({
        id: node.id,
        x: Math.round(x),
        y: Math.round(y),
        w,
        h,
        depth,
        isGroup,
        kind: isGroup || !section ? "rect" : kindOf(section),
        ...(name && { label: { x: Math.round(x + w / 2 - name.w / 2), y: Math.round(y + h + TILE_LABEL_GAP), w: name.w, h: name.h } }),
      });
      walk(node.children, x, y, depth + 1);
    }
  };
  walk(result.children, 0, 0, 0);

  // Each edge's bends. A route with none (ELK's straight drop from one box
  // to the one below) gets one halfway along it, as an elbow arrow's ends
  // only meet their boxes square when there's a bend to line up with.
  const bendsOf = new Map<string, Point[]>();
  for (const route of elkRoutes) {
    const at = origin.get((route as ElkExtendedEdge & { container?: string }).container ?? "root") ?? { x: 0, y: 0 };
    const points = (route.sections ?? []).flatMap((s) =>
      s.bendPoints?.length ? s.bendPoints : [{ x: (s.startPoint.x + s.endPoint.x) / 2, y: (s.startPoint.y + s.endPoint.y) / 2 }],
    );
    bendsOf.set(route.id, points.map((p) => ({ x: Math.round(at.x + p.x), y: Math.round(at.y + p.y) })));
  }
  const routed: RoutedEdge[] = edges.map((e, i) => ({ ...e, bends: bendsOf.get(`e${i}`) ?? [] }));

  return { boxes, edges: routed, width: Math.round(result.width ?? 0), height: Math.round(result.height ?? 0) };
}

// The outline a section's tile is drawn with, from its shape.
export function kindOf(section: LayoutSection): ShapeKind {
  return section.shape === "circle" ? "ellipse" : section.shape === "diamond" ? "diamond" : "rect";
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

// The line an arrow is drawn along, the way the canvas draws an elbow
// arrow (resolveArrow in shapes.ts): each end on its box's border, straight
// across from its nearest bend, with the bends between.
export function pathOf(edge: RoutedEdge, boxById: ReadonlyMap<string, SectionBox>): Point[] | null {
  const a = boxById.get(edge.from);
  const b = boxById.get(edge.to);
  if (!a || !b || edge.bends.length === 0) return null;
  const toBox = (box: SectionBox): ShapeBox => ({ ...box });
  return [elbowAnchor(toBox(a), edge.bends[0]), ...edge.bends, elbowAnchor(toBox(b), edge.bends[edge.bends.length - 1])];
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

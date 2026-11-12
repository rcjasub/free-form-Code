import type { ArchitectureModel, SectionKind } from "../API/architecture";
import { GROUP_HEADER, type ArchitectureLayout, type Point } from "./architectureLayout";
import { AUTO, TRANSPARENT } from "./colors";
import type { RestorePayload } from "./restore";
import {
  anchorPoint,
  DEFAULT_ARROW,
  DEFAULT_STYLE,
  newSeed,
  pointAlong,
  serializeArrow,
  shapeLabelSize,
  serializeShape,
  shapeCenter,
  type ArrowData,
  type DiagramStyle,
  type ShapeBox,
  type ShapeData,
} from "./shapes";

// Turns an AI-described architecture, once laid out (architectureLayout),
// into canvas blocks (Phase 2, step 7): a shape per section and an arrow per
// edge. They're ordinary shapes and arrows, so people can move, restyle and
// relabel them like anything they drew; each shape also carries its
// section's summary and files in `meta`, for the section's chat later.
//
// Arrows attach to shapes by block id, which the server only assigns when
// the shapes are saved, so the arrows are built afterwards from those ids.

// How each kind of section looks: a color from the canvas palette (a deep
// line and a pale fill of the same hue), so a diagram reads at a glance and
// stays editable from the properties panel.
const KIND_STYLE: Record<SectionKind, Pick<DiagramStyle, "stroke" | "fill" | "strokeStyle">> = {
  frontend: { stroke: "blue", fill: "blue", strokeStyle: "solid" },
  backend: { stroke: "green", fill: "green", strokeStyle: "solid" },
  service: { stroke: "yellow", fill: "yellow", strokeStyle: "solid" },
  db: { stroke: "red", fill: "red", strokeStyle: "solid" },
  infra: { stroke: AUTO, fill: TRANSPARENT, strokeStyle: "solid" },
  // something the code calls but doesn't own: dashed and unfilled
  external: { stroke: AUTO, fill: TRANSPARENT, strokeStyle: "dashed" },
};

// What every new block needs besides its content (see RestorePayload).
const BLOCK_DEFAULTS = { language: "javascript", link: null, wrapWidth: null, fontSize: null, color: null };

export interface PlacedShape {
  sectionId: string;
  block: RestorePayload;
}

export interface DiagramBlocks {
  // parents before children, so frames end up behind what's in them
  shapes: PlacedShape[];
  // The arrows, given each section's saved block id. An edge whose shapes
  // didn't both save is left out.
  arrows(blockIdOf: ReadonlyMap<string, string>): RestorePayload[];
  // where the whole diagram sits on the canvas
  bounds: { x: number; y: number; w: number; h: number };
}

export interface DiagramOptions {
  // the repo and commit the model was read from: each box keeps it, so its
  // details card can link its files to GitHub
  repo?: { url: string; commitSha: string };
  // the hand-drawn wobble's seed for each shape and arrow (fixed in tests)
  seed?: () => number;
}

// The blocks for a laid-out architecture, with the diagram's top-left corner
// at `origin` (canvas coordinates).
export function diagramBlocks(
  model: ArchitectureModel,
  layout: ArchitectureLayout,
  origin: Point,
  { repo, seed = newSeed }: DiagramOptions = {},
): DiagramBlocks {
  const sections = new Map(model.sections.map((s) => [s.id, s]));
  const at = (p: Point): Point => ({ x: Math.round(origin.x + p.x), y: Math.round(origin.y + p.y) });

  // where each section's box is on the canvas, as arrows attach to it
  const boxes = new Map<string, ShapeBox>();
  const shapes: PlacedShape[] = [];
  // what an arrow's label shouldn't sit on: every box, and each group's
  // title band (the rest of a group is open space between its shapes)
  const obstacles: Rect[] = [];
  for (const box of layout.boxes) {
    const section = sections.get(box.id);
    if (!section) continue;
    const { x, y } = at(box);
    boxes.set(box.id, { x, y, w: box.w, h: box.h, kind: "rect" });
    obstacles.push({ x, y, w: box.w, h: box.isGroup ? GROUP_HEADER : box.h });
    const look = KIND_STYLE[section.kind] ?? KIND_STYLE.infra;
    const shape: ShapeData = {
      ...DEFAULT_STYLE,
      ...look,
      // A group is a frame around its sections: its color's outline, dashed,
      // with nothing over the shapes inside and its title at the top.
      ...(box.isGroup && { fill: TRANSPARENT, strokeStyle: "dashed", labelAlign: "top" as const }),
      kind: "rect",
      w: box.w,
      h: box.h,
      label: section.title,
      seed: seed(),
      meta: { sectionId: section.id, summary: section.summary, files: section.files, kind: section.kind, ...(repo && { repo }) },
    };
    shapes.push({ sectionId: section.id, block: { type: "shape", content: serializeShape(shape), x, y, width: box.w, ...BLOCK_DEFAULTS } });
  }

  function arrows(blockIdOf: ReadonlyMap<string, string>): RestorePayload[] {
    const out: RestorePayload[] = [];
    const labels: Rect[] = [];
    for (const edge of layout.edges) {
      const from = boxes.get(edge.from);
      const to = boxes.get(edge.to);
      const fromId = blockIdOf.get(edge.from);
      const toId = blockIdOf.get(edge.to);
      if (!from || !to || !fromId || !toId) continue;
      const bends = edge.bends.map(at);
      // Ends on the boxes' borders, aimed the way the canvas aims them
      // (resolveArrow), so the arrow is drawn the same before and after
      // anything moves.
      const start = anchorPoint(from, bends[0] ?? shapeCenter(to));
      const end = anchorPoint(to, bends[bends.length - 1] ?? shapeCenter(from));
      const path = [start, ...bends, end];
      const points = path.map((p) => ({ x: Math.round(p.x - start.x), y: Math.round(p.y - start.y) }));
      const arrow: ArrowData = {
        ...DEFAULT_ARROW,
        stroke: AUTO,
        points,
        fromId,
        toId,
        seed: seed(),
      };
      if (edge.label) {
        arrow.label = edge.label;
        arrow.labelAt = placeLabel(path, labelSize(edge.label, shapeLabelSize(arrow)), [...obstacles, ...labels], labels);
      }
      const xs = points.map((p) => p.x);
      out.push({
        type: "arrow",
        content: serializeArrow(arrow),
        x: Math.round(start.x),
        y: Math.round(start.y),
        width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
        ...BLOCK_DEFAULTS,
      });
    }
    return out;
  }

  return { shapes, arrows, bounds: { ...at({ x: 0, y: 0 }), w: layout.width, h: layout.height } };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Where along its arrow a label goes: the middle if that's clear, else the
// nearest clear spot stepping out toward the ends, else the spot that
// overlaps least. The label's box is added to `placed`.
const LABEL_SPOTS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];

function placeLabel(path: Point[], size: { w: number; h: number }, avoid: Rect[], placed: Rect[]): number {
  let best = { at: 0.5, overlap: Infinity, box: undefined as Rect | undefined };
  for (const at of LABEL_SPOTS) {
    const c = pointAlong(path, at);
    const box = { x: c.x - size.w / 2, y: c.y - size.h / 2, w: size.w, h: size.h };
    const overlap = avoid.reduce((sum, r) => sum + overlapArea(box, r), 0);
    if (overlap < best.overlap) best = { at, overlap, box };
    if (overlap === 0) break;
  }
  if (best.box) placed.push(best.box);
  return best.at;
}

function overlapArea(a: Rect, b: Rect) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

// A label's size as the canvas draws it (ArrowNode): monospace, padded,
// wrapping at 240px; with a few px of room around it.
const LABEL_MAX_WIDTH = 240;
export function labelSize(label: string, fontSize: number) {
  const charW = fontSize * 0.6;
  const inner = LABEL_MAX_WIDTH - 8;
  const lines = Math.max(1, Math.ceil((label.length * charW) / inner));
  return { w: Math.min(inner, label.length * charW) + 8 + 6, h: lines * fontSize * 1.25 + 2 + 6 };
}

// The zoom and pan that show the whole diagram, with a margin: no closer
// than 100%, no further than the canvas allows, in the zoom buttons' steps.
export function viewToFit(
  bounds: { x: number; y: number; w: number; h: number },
  screen: { width: number; height: number },
  margin = 80,
): { scale: number; offset: Point } {
  const fit = Math.min((screen.width - 2 * margin) / bounds.w, (screen.height - 2 * margin) / bounds.h, 1);
  const scale = Math.max(0.2, Math.floor(fit * 10) / 10);
  const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  return { scale, offset: { x: screen.width / 2 - center.x * scale, y: screen.height / 2 - center.y * scale } };
}

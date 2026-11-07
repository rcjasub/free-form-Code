import { parseDrawing, serializeDrawing } from "./points";
import { parseArrow, parseShape, serializeArrow, serializeShape } from "./shapes";

// Resizing a multi-selection: every block scales around one fixed point (the
// corner or side opposite the handle being dragged) — by the same factor
// both ways from a corner, or one way only from a side. Positions spread out
// or draw in around it; each block also grows or shrinks in the way it can:
// a shape's size and a drawing's or arrow's points stretch, text scales its
// font size and wrap width (only when scaled evenly — stretched one way it
// just moves, since text can't stretch). Images only move (their width can't
// be saved).

export interface ScalableNode {
  id: string;
  type?: string; // "shape" | "arrow" | "draw" | "image"; text and code have none
  x: number;
  y: number;
  content: string;
  wrapWidth?: number | null;
  fontSize?: number | null;
}

export type Scaled =
  | { kind: "content"; id: string; x: number; y: number; content: string } // shape, drawing, arrow
  | { kind: "text"; id: string; x: number; y: number; wrapWidth: number | null; fontSize: number | null }
  | { kind: "move"; id: string; x: number; y: number }; // image

export const MIN_GROUP_SCALE = 0.1;
// the text limits the server accepts (fontSizeSchema, wrapWidthSchema)
const DEFAULT_FONT = 14;
const FONT = { min: 6, max: 200 };
const WRAP = { min: 40, max: 4000 };
const MIN_SHAPE = 8;

const round = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, n));

// sx, sy: how much wider and taller (sy defaults to sx: an even scale)
export function scaleNode(node: ScalableNode, anchor: { x: number; y: number }, sx: number, sy = sx): Scaled {
  const x = round(anchor.x + (node.x - anchor.x) * sx);
  const y = round(anchor.y + (node.y - anchor.y) * sy);
  const scalePoint = (p: { x: number; y: number }) => ({ x: round(p.x * sx), y: round(p.y * sy) });

  if (node.type === "shape") {
    const shape = parseShape(node.content);
    const w = Math.max(MIN_SHAPE, round(shape.w * sx));
    const h = Math.max(MIN_SHAPE, round(shape.h * sy));
    return { kind: "content", id: node.id, x, y, content: serializeShape({ ...shape, w, h }) };
  }
  if (node.type === "draw") {
    const { points, style } = parseDrawing(node.content);
    if (!points) return { kind: "move", id: node.id, x, y };
    return { kind: "content", id: node.id, x, y, content: serializeDrawing(points.map(scalePoint), style) };
  }
  if (node.type === "arrow") {
    const arrow = parseArrow(node.content);
    return { kind: "content", id: node.id, x, y, content: serializeArrow({ ...arrow, points: arrow.points.map(scalePoint) }) };
  }
  if (node.type === "image") return { kind: "move", id: node.id, x, y };

  // text and code: scaled evenly, or (stretched one way) only moved
  if (sx !== sy) return { kind: "text", id: node.id, x, y, wrapWidth: node.wrapWidth ?? null, fontSize: node.fontSize ?? null };
  const fontSize = round(clamp((node.fontSize ?? DEFAULT_FONT) * sx, FONT));
  const wrapWidth = node.wrapWidth == null ? null : round(clamp(node.wrapWidth * sx, WRAP));
  return { kind: "text", id: node.id, x, y, wrapWidth, fontSize };
}

// The stretch for a side dragged from `start` to `now`, along one axis.
export function stretchFor(anchor: number, start: number, now: number) {
  const span = start - anchor;
  return span ? Math.max(MIN_GROUP_SCALE, (now - anchor) / span) : 1;
}

// The scale for a corner dragged from `start` to `now` around `anchor`: how
// much further from the anchor it is, along the box's diagonal.
export function scaleFor(anchor: { x: number; y: number }, start: { x: number; y: number }, now: { x: number; y: number }) {
  const dx = start.x - anchor.x;
  const dy = start.y - anchor.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return 1;
  // the pointer projected onto the diagonal, so sideways wobble doesn't count
  const along = ((now.x - anchor.x) * dx + (now.y - anchor.y) * dy) / len2;
  return Math.max(MIN_GROUP_SCALE, along);
}

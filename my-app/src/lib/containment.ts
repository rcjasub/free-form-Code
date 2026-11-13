import type { CanvasNode } from "../hooks/useCanvasHistory";
import { parseArrow, parseShape, type ShapeData } from "./shapes";

function rectOf(id: string) {
  return document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`)?.getBoundingClientRect() ?? null;
}

// The text (and code) blocks sitting inside any of these shapes: those whose
// center is within a shape's box. Measured off the rendered page, since a
// text block's size depends on its font and content; both rects are in
// screen pixels, so zoom and pan don't matter. When a shape is dragged, these
// ride along with it, so a box keeps its text, but each text is still its own
// block that can be dragged out on its own.
export function textsInsideShapes(shapeIds: string[], nodes: CanvasNode[]): string[] {
  const shapes = shapeIds
    .filter((id) => nodes.some((n) => n.id === id && n.type === "shape"))
    .map(rectOf)
    .filter((r): r is DOMRect => r !== null);
  if (!shapes.length) return [];
  return nodes
    .filter((n) => !n.type) // text and code blocks carry no type
    .filter((n) => {
      const r = rectOf(n.id);
      if (!r) return false;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      return shapes.some((s) => cx >= s.left && cx <= s.right && cy >= s.top && cy <= s.bottom);
    })
    .map((n) => n.id);
}

// Where to put a wÃ—h text block (canvas units) so it's centered in a shape.
export function centeredIn(shape: { x: number; y: number; w: number; h: number }, w: number, h: number) {
  return { x: shape.x + (shape.w - w) / 2, y: shape.y + (shape.h - h) / 2 };
}

// A rendered block's size in canvas units.
export function canvasSizeOf(id: string, scale: number) {
  const r = rectOf(id);
  return r ? { w: r.width / scale, h: r.height / scale } : null;
}

// Puts the caret in a text block (its CodeMirror editor).
export function focusText(id: string) {
  const el = document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"] .cm-content`);
  el?.focus();
  return !!el;
}

interface Placed {
  id: string;
  type?: string;
  x: number;
  y: number;
  content: string;
}

// A group's frame: a shape with its label as a title at the top (as AI
// diagrams draw groups) and a section id other shapes can name as their group.
function isFrame(shape: ShapeData) {
  return shape.labelAlign === "top";
}

interface Box {
  id: string;
  x: number;
  y: number;
  shape: ShapeData;
}

const boxesOf = (nodes: readonly Placed[]): Box[] =>
  nodes.filter((n) => n.type === "shape").map((n) => ({ id: n.id, x: n.x, y: n.y, shape: parseShape(n.content) }));

// `inner` wholly inside `outer`
function within(inner: { x: number; y: number; w: number; h: number }, outer: Box) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.shape.w && inner.y + inner.h <= outer.y + outer.shape.h;
}

// A group's frame: its members wholly inside it, nested frames and their
// members included, and the arrows with both ends among them. A member is a
// shape whose `group` names this frame (or a nested one), so dragging a
// frame over other shapes doesn't pick them up, and a member dragged out is
// left behind until it's put back. A frame from before groups were kept goes
// by what's inside it. Worked out from saved geometry, not the page, so it
// can run mid-drag.
export function frameContents(frameId: string, nodes: readonly Placed[]): string[] {
  const boxes = boxesOf(nodes);
  const frame = boxes.find((b) => b.id === frameId);
  if (!frame || !isFrame(frame.shape)) return [];
  const inFrame = boxes.filter((b) => b.id !== frameId && within({ x: b.x, y: b.y, ...b.shape }, frame));
  const inside = new Set<string>();
  const sectionId = frame.shape.meta?.sectionId;
  if (frame.shape.group === undefined || !sectionId) {
    for (const b of inFrame) inside.add(b.id);
  } else {
    // the group's sections, growing as nested groups are found
    const groups = new Set([sectionId]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const b of inFrame) {
        if (inside.has(b.id) || !b.shape.group || !groups.has(b.shape.group)) continue;
        inside.add(b.id);
        if (b.shape.meta && isFrame(b.shape)) groups.add(b.shape.meta.sectionId);
        grew = true;
      }
    }
  }
  const ends = new Set([frameId, ...inside]);
  const arrows = nodes.filter((n) => {
    if (n.type !== "arrow") return false;
    const { fromId, toId } = parseArrow(n.content);
    return !!fromId && !!toId && ends.has(fromId) && ends.has(toId);
  });
  return [...inside, ...arrows.map((n) => n.id)];
}

// The frame a shape dropped at (x, y) lands in: the innermost one it's
// wholly inside that keeps its members, leaving out the shape itself and,
// for a frame, its own contents. Null: none.
export function dropTarget(id: string, x: number, y: number, nodes: readonly Placed[]): Box | null {
  const boxes = boxesOf(nodes);
  const dropped = boxes.find((b) => b.id === id);
  if (!dropped) return null;
  const own = new Set([id, ...frameContents(id, nodes)]);
  const at = { x, y, w: dropped.shape.w, h: dropped.shape.h };
  let best: Box | null = null;
  for (const b of boxes) {
    if (own.has(b.id) || !isFrame(b.shape) || !b.shape.meta || b.shape.group === undefined) continue;
    if (!within(at, b)) continue;
    if (!best || b.shape.w * b.shape.h < best.shape.w * best.shape.h) best = b;
  }
  return best;
}

// The `group` a shape dropped at (x, y) should have, or undefined when it
// stays as it is (already in that group, or a shape that was never in one
// dropped outside any).
export function groupAfterDrop(id: string, x: number, y: number, nodes: readonly Placed[]): string | null | undefined {
  const node = nodes.find((n) => n.id === id && n.type === "shape");
  if (!node) return undefined;
  const shape = parseShape(node.content);
  const current = shape.group;
  // a frame from before groups were kept holds what's inside it; giving it
  // a group would switch it to members only, and it has none
  if (isFrame(shape) && current === undefined) return undefined;
  const next = dropTarget(id, x, y, nodes)?.shape.meta?.sectionId ?? null;
  if (next === (current ?? null)) return undefined;
  return next;
}

// What moves when `id` is dragged: the whole selection it's part of, or
// on its own, the block, plus a group frame's contents.
export function movingWith(id: string, selected: readonly string[], nodes: readonly Placed[]): string[] {
  if (selected.length >= 2 && selected.includes(id)) return [...selected];
  return [id, ...frameContents(id, nodes)];
}

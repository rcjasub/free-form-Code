import type { CanvasNode } from "../hooks/useCanvasHistory";
import { parseArrow, parseShape } from "./shapes";

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

// A group's frame (a shape with its label as a title at the top, as AI
// diagrams draw groups): its members wholly inside it, nested frames and
// their members included, and the arrows with both ends among them. A
// member is a box whose meta names the group (or a nested group) as its
// parent, so dragging a frame over other boxes doesn't pick them up, and a
// member dragged out is left behind until it's put back. Frames from before
// parents were kept go by position alone. Worked out from saved geometry,
// not the page, so it can run mid-drag.
export function frameContents(frameId: string, nodes: readonly Placed[]): string[] {
  const frame = nodes.find((n) => n.id === frameId && n.type === "shape");
  if (!frame) return [];
  const box = parseShape(frame.content);
  if (box.labelAlign !== "top") return [];
  const within = nodes
    .filter((n) => n.type === "shape" && n.id !== frameId)
    .map((n) => ({ id: n.id, x: n.x, y: n.y, shape: parseShape(n.content) }))
    .filter((n) => n.x >= frame.x && n.y >= frame.y && n.x + n.shape.w <= frame.x + box.w && n.y + n.shape.h <= frame.y + box.h);
  const inside = new Set<string>();
  if (box.meta?.parent === undefined) {
    for (const n of within) inside.add(n.id);
  } else {
    // the group's sections, growing as nested groups are found
    const groups = new Set([box.meta.sectionId]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const n of within) {
        const meta = n.shape.meta;
        if (inside.has(n.id) || !meta?.parent || !groups.has(meta.parent)) continue;
        inside.add(n.id);
        groups.add(meta.sectionId);
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

// What moves when `id` is dragged: the whole selection it's part of, or
// on its own, the block, plus a group frame's contents.
export function movingWith(id: string, selected: readonly string[], nodes: readonly Placed[]): string[] {
  if (selected.length >= 2 && selected.includes(id)) return [...selected];
  return [id, ...frameContents(id, nodes)];
}

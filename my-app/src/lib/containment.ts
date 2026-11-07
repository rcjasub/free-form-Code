import type { CanvasNode } from "../hooks/useCanvasHistory";

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

// Where to put a w×h text block (canvas units) so it's centered in a shape.
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

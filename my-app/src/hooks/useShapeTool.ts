import { useState } from "react";
import type { Point } from "../components/DrawingNode";
import { newSeed, serializeArrow, serializeShape, type DiagramStyle, type ShapeKind } from "../lib/shapes";

// The diagram tools: drag on the canvas to make a shape (or an arrow, which
// attaches to the shapes it starts and ends on).
export const SHAPE_TOOLS = ["rect", "ellipse", "diamond", "arrow"] as const;
export type ShapeTool = (typeof SHAPE_TOOLS)[number];

export function isShapeTool(mode: string): mode is ShapeTool {
  return (SHAPE_TOOLS as readonly string[]).includes(mode);
}

export interface ShapeDraft {
  tool: ShapeTool;
  from: Point; // canvas coordinates
  to: Point;
  fromId?: string; // arrows: the shape under each end
  toId?: string;
  square: boolean; // Shift held: equal width and height
}

// a click without a drag makes a shape this big, centered on the click
const DEFAULT_SIZE = { w: 160, h: 80 };
const MIN_SIZE = 16;
const CLICK_SLOP = 4; // a drag shorter than this counts as a click
const MIN_ARROW = 8;

// Where a draft shape sits: the box dragged out (squared with Shift), or the
// default size around a plain click.
export function draftBox(draft: ShapeDraft) {
  const dx = draft.to.x - draft.from.x;
  const dy = draft.to.y - draft.from.y;
  if (Math.abs(dx) < CLICK_SLOP && Math.abs(dy) < CLICK_SLOP) {
    return { x: draft.from.x - DEFAULT_SIZE.w / 2, y: draft.from.y - DEFAULT_SIZE.h / 2, ...DEFAULT_SIZE };
  }
  let w = Math.max(Math.abs(dx), MIN_SIZE);
  let h = Math.max(Math.abs(dy), MIN_SIZE);
  if (draft.square) w = h = Math.max(w, h);
  return { x: dx < 0 ? draft.from.x - w : draft.from.x, y: dy < 0 ? draft.from.y - h : draft.from.y, w, h };
}

// What to save for a finished draft, or null for an arrow too short to keep.
export function draftToBlock(draft: ShapeDraft, style: DiagramStyle) {
  if (draft.tool === "arrow") {
    const dx = draft.to.x - draft.from.x;
    const dy = draft.to.y - draft.from.y;
    if (Math.hypot(dx, dy) < MIN_ARROW) return null;
    const content = serializeArrow({
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeStyle: style.strokeStyle,
      opacity: style.opacity,
      roughness: style.roughness,
      fromId: draft.fromId,
      toId: draft.toId,
      points: [{ x: 0, y: 0 }, { x: dx, y: dy }],
      seed: newSeed(),
    });
    return { type: "arrow", content, x: draft.from.x, y: draft.from.y, width: Math.max(Math.abs(dx), 1) };
  }
  const box = draftBox(draft);
  const kind: ShapeKind = draft.tool;
  const content = serializeShape({ ...style, kind, w: box.w, h: box.h, label: "", seed: newSeed() });
  return { type: "shape", content, x: box.x, y: box.y, width: box.w };
}

// The id of the shape block under a screen point, if any. The topmost
// element under the pointer may be the shape's label or SVG, so each is
// walked up to its block.
export function shapeIdAt(clientX: number, clientY: number, isShape: (id: string) => boolean, except?: string) {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const id = el.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId;
    if (id && id !== except && isShape(id)) return id;
  }
  return undefined;
}

interface Options {
  toCanvas: (clientX: number, clientY: number) => Point;
  isShape: (id: string) => boolean;
}

// One drag of a shape tool: `draft` is shown as a preview while the pointer
// is down; on release it's handed to `onFinish` (once) and cleared.
export function useShapeTool({ toCanvas, isShape }: Options) {
  const [draft, setDraft] = useState<ShapeDraft | null>(null);

  function start(e: React.PointerEvent, tool: ShapeTool, onFinish: (draft: ShapeDraft) => void) {
    e.preventDefault();
    const from = toCanvas(e.clientX, e.clientY);
    const fromId = tool === "arrow" ? shapeIdAt(e.clientX, e.clientY, isShape) : undefined;
    let current: ShapeDraft = { tool, from, to: from, fromId, square: false };
    setDraft(current);

    function onMove(mv: PointerEvent) {
      current = {
        ...current,
        to: toCanvas(mv.clientX, mv.clientY),
        square: mv.shiftKey,
        toId: tool === "arrow" ? shapeIdAt(mv.clientX, mv.clientY, isShape, fromId) : undefined,
      };
      setDraft(current);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDraft(null);
      onFinish(current);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return { draft, start };
}

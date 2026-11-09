import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { scaleFor, scaleNode, stretchFor, type ScalableNode } from "../lib/groupScale";
import { pauseGlide, resumeGlide } from "../lib/glide";

// Resizing a multi-selection by its box (see SelectionBox): from a corner the
// whole selection scales evenly around the opposite corner; from a side it
// stretches one way, away from the opposite side.
//
// While the handle is dragged, each block is only moved and scaled on screen
// with a CSS transform, which costs next to nothing however many there are.
// (Resizing them for real every frame re-drew every shape and re-laid-out
// every text block each time, which made a big selection stutter.) Letting
// go applies the real sizes once: saved, shown to everyone, one undo step.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Point = { x: number; y: number };

interface Item {
  node: ScalableNode;
  el: HTMLElement | null;
  // where the block is drawn when the drag starts, in canvas units
  left: number;
  top: number;
}

export function useGroupResize({
  nodesRef,
  ridersOf,
  reshapeBlock,
  resizeText,
  moveNode,
  toCanvas,
}: {
  nodesRef: RefObject<ScalableNode[]>;
  // text sitting in the selected shapes, which scales with them
  ridersOf: (ids: string[]) => string[];
  reshapeBlock: (id: string, x: number, y: number, content: string, done: boolean, group?: number) => void;
  resizeText: (id: string, wrapWidth: number | null, fontSize: number | null, x: number, y: number, done: boolean, group?: number) => void;
  moveNode: (id: string, x: number, y: number, record?: boolean, group?: number) => void;
  toCanvas: (clientX: number, clientY: number) => Point;
}) {
  // the latest of each, so the handler below can stay the same function
  const deps = useRef({ nodesRef, ridersOf, reshapeBlock, resizeText, moveNode, toCanvas });
  useLayoutEffect(() => {
    deps.current = { nodesRef, ridersOf, reshapeBlock, resizeText, moveNode, toCanvas };
  });

  // corner: which handle of `box` is being dragged (0 = left/top, 1 =
  // right/bottom, 0.5 = the middle of a side: fx 0.5 is the top or bottom)
  return useCallback((e: React.PointerEvent, corner: { fx: number; fy: number }, box: Box, ids: string[]) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const d = deps.current;
    const wanted = new Set([...ids, ...d.ridersOf(ids)]);
    const items: Item[] = (d.nodesRef.current ?? [])
      .filter((n) => wanted.has(n.id))
      .map((n) => {
        const el = document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(n.id)}"]`);
        const r = el?.getBoundingClientRect();
        const at = r ? d.toCanvas(r.left, r.top) : { x: n.x, y: n.y };
        return { node: { ...n }, el, left: at.x, top: at.y };
      });
    if (items.length === 0) return;
    const anchor = { x: box.x + (1 - corner.fx) * box.w, y: box.y + (1 - corner.fy) * box.h };
    const press = d.toCanvas(e.clientX, e.clientY);
    let sx = 1;
    let sy = 1;
    let frame = 0;
    // Blocks glide to new positions (to smooth other people's moves); here
    // that would make them trail behind the handle.
    for (const { el } of items) {
      if (!el) continue;
      pauseGlide(el);
      el.style.transformOrigin = "0 0";
    }

    // the on-screen preview: each block moved to where it'll go, and scaled
    // the way it'll be resized (text only evenly, images not at all)
    function preview() {
      for (const { node, el, left, top } of items) {
        if (!el) continue;
        const stretches = node.type === "shape" || node.type === "draw" || node.type === "arrow";
        const textScales = !node.type && sx === sy;
        const kx = stretches || textScales ? sx : 1;
        const ky = stretches || textScales ? sy : 1;
        const dx = anchor.x + (left - anchor.x) * sx - left;
        const dy = anchor.y + (top - anchor.y) * sy - top;
        el.style.transform = `translate(${dx}px, ${dy}px) scale(${kx}, ${ky})`;
      }
    }

    function onMove(mv: PointerEvent) {
      const now = deps.current.toCanvas(mv.clientX, mv.clientY);
      if (corner.fx === 0.5) sy = stretchFor(anchor.y, press.y, now.y);
      else if (corner.fy === 0.5) sx = stretchFor(anchor.x, press.x, now.x);
      else sx = sy = scaleFor(anchor, press, now);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        preview();
      });
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      cancelAnimationFrame(frame);
      document.body.style.cursor = "";
      // a press without a drag changes nothing
      if (Math.abs(sx - 1) >= 0.001 || Math.abs(sy - 1) >= 0.001) {
        const { reshapeBlock, resizeText, moveNode } = deps.current;
        const group = Date.now();
        for (const { node } of items) {
          const r = scaleNode(node, anchor, sx, sy);
          if (r.kind === "content") reshapeBlock(r.id, r.x, r.y, r.content, true, group);
          else if (r.kind === "text") resizeText(r.id, r.wrapWidth, r.fontSize, r.x, r.y, true, group);
          else moveNode(r.id, r.x, r.y, true, group);
        }
      }
      // once the real sizes are drawn, drop the preview (in the same frame,
      // so nothing flickers back to its old size)
      requestAnimationFrame(() => {
        for (const { el } of items) {
          if (!el) continue;
          el.style.transform = "";
          el.style.transformOrigin = "";
          resumeGlide(el);
        }
      });
    }

    document.body.style.cursor = getComputedStyle(e.currentTarget as Element).cursor;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, []);
}

import { useRef, useState } from "react";
import type { Point } from "../components/DrawingNode";
import { strokePath } from "../lib/smoothPath";

// Samples closer together than this (in screen pixels) add nothing but noise.
const MIN_SAMPLE_SPACING = 1.5;

// The stroke being drawn right now, kept smooth on busy canvases and
// trackpads:
// - Pointer events with getCoalescedEvents: the browser only fires one move
//   per frame, but trackpads and pens report several in between, and
//   without those, fast curves turn into straight, jagged segments.
// - The live path's `d` is written straight to the SVG once per frame,
//   instead of through React state, which re-rendered the whole page (every
//   block) on every mouse move.
// - Pointer events also work for touch screens and pens, not just a mouse.
export function useFreehandStroke() {
  const [drawing, setDrawing] = useState(false);
  const pathRef = useRef<SVGPathElement>(null);

  function start(
    e: React.PointerEvent,
    toCanvas: (clientX: number, clientY: number) => Point,
    onFinish: (points: Point[]) => void,
  ) {
    const pointerId = e.pointerId;
    const points: Point[] = [toCanvas(e.clientX, e.clientY)];
    let last = { x: e.clientX, y: e.clientY };
    let frame = 0;
    setDrawing(true);

    function render() {
      frame = 0;
      pathRef.current?.setAttribute("d", strokePath(points));
    }

    function onMove(mv: PointerEvent) {
      if (mv.pointerId !== pointerId) return;
      const coalesced = mv.getCoalescedEvents?.() ?? [];
      for (const s of coalesced.length ? coalesced : [mv]) {
        if (Math.hypot(s.clientX - last.x, s.clientY - last.y) < MIN_SAMPLE_SPACING) continue;
        last = { x: s.clientX, y: s.clientY };
        points.push(toCanvas(s.clientX, s.clientY));
      }
      if (!frame) frame = requestAnimationFrame(render);
    }

    function onUp(up: PointerEvent) {
      if (up.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      cancelAnimationFrame(frame);
      // include where it was let go, even if that last move was tiny
      const end = toCanvas(up.clientX, up.clientY);
      const tail = points[points.length - 1];
      if (end.x !== tail.x || end.y !== tail.y) points.push(end);
      setDrawing(false);
      onFinish(points);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  return { drawing, pathRef, start };
}

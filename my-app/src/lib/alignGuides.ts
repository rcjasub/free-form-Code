import { useSyncExternalStore } from "react";

// Alignment guides: while a shape is dragged, it snaps to line up with the
// shapes around it (left, middle or right; top, middle or bottom), and a
// thin line shows what it lined up with. The way design tools do it, so
// boxes moved by hand end up in line instead of a few pixels off.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// A guide line in canvas units: vertical (axis "x", at an x) or horizontal
// (axis "y", at a y), running from `from` to `to` along the other axis.
export interface Guide {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

// A box's lines on one axis: its start, middle and end.
function lines(r: Rect, axis: "x" | "y") {
  const start = axis === "x" ? r.x : r.y;
  const size = axis === "x" ? r.w : r.h;
  return [start, start + size / 2, start + size];
}

// The smallest nudge (within `threshold`) that puts one of `box`'s lines on
// one of the others' lines, along one axis. 0 when none is that close.
function nudge(box: Rect, others: readonly Rect[], axis: "x" | "y", threshold: number) {
  let best = 0;
  let bestDist = threshold;
  for (const mine of lines(box, axis)) {
    for (const o of others) {
      for (const theirs of lines(o, axis)) {
        const d = Math.abs(theirs - mine);
        if (d <= bestDist) {
          bestDist = d;
          best = theirs - mine;
        }
      }
    }
  }
  return best;
}

// Within half a canvas unit counts as lined up (positions are rounded).
const ON_LINE = 0.5;

// Where to put `box` so it lines up with the nearest of `others` (each axis
// on its own, within `threshold` canvas units), and the guides to draw: one
// per line it now shares, spanning it and every box on that line.
export function snapToOthers(box: Rect, others: readonly Rect[], threshold: number): { x: number; y: number; guides: Guide[] } {
  const x = box.x + nudge(box, others, "x", threshold);
  const y = box.y + nudge(box, others, "y", threshold);
  const snapped = { ...box, x, y };
  const guides: Guide[] = [];
  for (const axis of ["x", "y"] as const) {
    const cross = axis === "x" ? "y" : "x";
    for (const at of lines(snapped, axis)) {
      const on = others.filter((o) => lines(o, axis).some((l) => Math.abs(l - at) <= ON_LINE));
      if (!on.length) continue;
      const span = [snapped, ...on].flatMap((r) => lines(r, cross));
      guides.push({ axis, at, from: Math.min(...span), to: Math.max(...span) });
    }
  }
  return { x, y, guides };
}

// --- what's on screen ----------------------------------------------------
// The guides of the drag in progress, and the frame a dragged shape would
// drop into, kept outside React state so a drag doesn't re-render the page;
// the overlay (AlignmentGuides) subscribes to them.

export interface DragHints {
  guides: Guide[];
  // the frame it would join if let go here
  dropInto: Rect | null;
}

const NONE: DragHints = { guides: [], dropInto: null };
let hints: DragHints = NONE;
const listeners = new Set<() => void>();

export function setDragHints(next: DragHints) {
  if (!next.guides.length && !next.dropInto && hints === NONE) return;
  hints = next.guides.length || next.dropInto ? next : NONE;
  listeners.forEach((l) => l());
}

export function clearDragHints() {
  setDragHints(NONE);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDragHints(): DragHints {
  return useSyncExternalStore(subscribe, () => hints);
}

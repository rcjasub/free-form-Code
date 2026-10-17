import { useCallback, useState } from "react";
import { strokePath } from "../lib/smoothPath";
import type { Point } from "../components/DrawingNode";

export type DrawIn = "trace" | "brighten";

// While snapping is on, the live stroke is drawn at this opacity — the same
// as the faded outline it leaves (snap-ghost in index.css).
export const SNAP_FADED_OPACITY = 0.4;

// Both match the animations in index.css (snap-ghost, snap-draw).
const GHOST_MS = 1000;
const DRAW_IN_MS = 900;

// With shape snapping on, a stroke stays faded while you draw it and only
// "comes to life" once you let go: if it snapped, it stays as a faded outline
// while the clean shape traces itself in on top, then fades away; if it
// didn't, it just brightens to full. Only on this screen; never saved, and
// others just see the finished drawing.
export function useSnapGhosts() {
  const [ghosts, setGhosts] = useState<{ id: number; d: string }[]>([]);
  // new drawings that animate in when they first appear, and how: "trace"
  // (a snapped shape draws itself) or "brighten" (faded stroke to full)
  const [drawingIn, setDrawingIn] = useState<Map<string, DrawIn>>(new Map());

  const addGhost = useCallback((rawPoints: Point[]) => {
    const id = Date.now() + Math.random();
    setGhosts((prev) => [...prev, { id, d: strokePath(rawPoints) }]);
    setTimeout(() => setGhosts((prev) => prev.filter((g) => g.id !== id)), GHOST_MS);
  }, []);

  const drawIn = useCallback((id: string, how: DrawIn) => {
    setDrawingIn((prev) => new Map(prev).set(id, how));
    setTimeout(
      () =>
        setDrawingIn((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        }),
      DRAW_IN_MS,
    );
  }, []);

  return { ghosts, addGhost, drawingIn, drawIn };
}

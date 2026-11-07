import { useMemo } from "react";
import type { CanvasNode } from "./useCanvasHistory";
import { parseArrow, parseShape, resolveArrow, type ArrowData, type ShapeBox } from "../lib/shapes";

// Every arrow on the canvas, ready to draw: attached ends sit on their
// shapes' borders (lib/shapes resolveArrow). Worked out again whenever the
// nodes change, so dragging a shape (which updates its x/y as it goes)
// drags its arrows along.
export function useResolvedArrows(nodes: CanvasNode[]): Map<string, ArrowData> {
  return useMemo(() => {
    const shapes = new Map<string, ShapeBox>();
    for (const n of nodes) {
      if (n.type !== "shape") continue;
      const s = parseShape(n.content);
      shapes.set(n.id, { x: n.x, y: n.y, w: s.w, h: s.h, kind: s.kind });
    }
    const arrows = new Map<string, ArrowData>();
    for (const n of nodes) {
      if (n.type === "arrow") arrows.set(n.id, resolveArrow(parseArrow(n.content), n.x, n.y, shapes));
    }
    return arrows;
  }, [nodes]);
}

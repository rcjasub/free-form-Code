import { useMemo } from "react";
import type { CanvasNode } from "./useCanvasHistory";
import { parseArrow, resolveArrow, type ArrowData, type ShapeBox } from "../lib/shapes";
import { bindBox } from "../lib/bindable";

// Every arrow on the canvas, ready to draw: attached ends sit on their
// shapes' borders (lib/shapes resolveArrow). Worked out again whenever the
// nodes change. While a shape is dragged or resized, the arrows attached to
// it redraw from its live position instead (lib/liveShapes, ArrowNode).
export function useResolvedArrows(nodes: CanvasNode[]): Map<string, ArrowData> {
  return useMemo(() => {
    const shapes = new Map<string, ShapeBox>();
    for (const n of nodes) {
      const box = bindBox(n);
      if (box) shapes.set(n.id, box);
    }
    const arrows = new Map<string, ArrowData>();
    for (const n of nodes) {
      if (n.type === "arrow") arrows.set(n.id, resolveArrow(parseArrow(n.content), n.x, n.y, shapes));
    }
    return arrows;
  }, [nodes]);
}

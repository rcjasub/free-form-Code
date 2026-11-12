import type { Point } from "../components/DrawingNode";
import { parseDrawing } from "./points";
import { parseShape, type ShapeBox } from "./shapes";

// What an arrow can attach to: shapes, and drawings that are a closed outline
// (a stroke snapped into a triangle; rectangles and ellipses become shapes).

interface Block {
  id: string;
  type?: string;
  x: number;
  y: number;
  content: string;
}

// A drawing whose last point is its first: an outline, not a line.
function closedOutline(points: Point[] | null): Point[] | null {
  if (!points || points.length < 4) return null;
  const a = points[0];
  const b = points[points.length - 1];
  return Math.hypot(a.x - b.x, a.y - b.y) < 0.5 ? points : null;
}

// The box an arrow attaches to on this block, or null if it can't attach.
export function bindBox(block: Block): ShapeBox | null {
  if (block.type === "shape") {
    const s = parseShape(block.content);
    return { x: block.x, y: block.y, w: s.w, h: s.h, kind: s.kind };
  }
  if (block.type === "draw") {
    const outline = closedOutline(parseDrawing(block.content).points);
    if (!outline) return null;
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: block.x + minX,
      y: block.y + minY,
      w: Math.max(...xs) - minX,
      h: Math.max(...ys) - minY,
      kind: "rect",
      outline: outline.map((p) => ({ x: p.x + block.x, y: p.y + block.y })),
    };
  }
  return null;
}

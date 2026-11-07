import { useMemo } from "react";
import { draftBox, type ShapeDraft } from "../hooks/useShapeTool";
import { arrowPaint, shapePaint } from "../lib/roughPaths";
import type { DiagramStyle } from "../lib/shapes";
import PaintPaths from "./PaintPaths";

// one fixed seed, so the preview doesn't flicker as the drag resizes it
const PREVIEW_SEED = 7;

// The shape or arrow being dragged out, drawn in canvas coordinates (in the
// style it'll be saved with) until the pointer is released.
export default function ShapeDraftPreview({
  draft,
  style,
  isDark,
}: {
  draft: ShapeDraft;
  style: DiagramStyle;
  isDark: boolean;
}) {
  const box = draftBox(draft);
  const paint = useMemo(() => {
    const s = { ...style, seed: PREVIEW_SEED };
    if (draft.tool === "arrow") {
      const { from, to } = draft;
      return arrowPaint(s, [{ x: 0, y: 0 }, { x: to.x - from.x, y: to.y - from.y }], isDark);
    }
    return shapePaint({ ...s, kind: draft.tool }, box.w, box.h, isDark);
  }, [draft, style, isDark, box.w, box.h]);

  const at = draft.tool === "arrow" ? draft.from : box;
  return (
    <svg
      className="absolute pointer-events-none"
      style={{ left: at.x, top: at.y, overflow: "visible", zIndex: 9999, opacity: (0.7 * style.opacity) / 100 }}
      width={1}
      height={1}
    >
      <PaintPaths paint={paint} />
    </svg>
  );
}

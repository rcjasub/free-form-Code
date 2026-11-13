import { useDragHints } from "../lib/alignGuides";

// The group frame a shape being dragged would join if let go, lit up. Drawn
// in canvas coordinates, inside the panned/zoomed canvas layer; its outline
// stays 2px at any zoom. (A dragged shape still snaps into line with the
// others, hooks/useDragAssist, without lines drawn to show it.)
const DROP_COLOR = "#4fb4f2";

export default function AlignmentGuides() {
  const { dropInto } = useDragHints();
  if (!dropInto) return null;
  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ overflow: "visible", zIndex: 2147483000 }} aria-hidden>
      <rect
        data-drop-target
        x={dropInto.x - 4}
        y={dropInto.y - 4}
        width={dropInto.w + 8}
        height={dropInto.h + 8}
        rx={10}
        fill={DROP_COLOR}
        fillOpacity={0.06}
        stroke={DROP_COLOR}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

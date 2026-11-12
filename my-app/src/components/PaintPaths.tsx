import type { Paint } from "../lib/roughPaths";
import type { DrawIn } from "../hooks/useSnapGhosts";

// The SVG paths rough.js produced for one shape or arrow (lib/roughPaths).
// With `clipId`, the fill paths are clipped to that <clipPath>.
// `drawIn`: a pen stroke just snapped into this shape, so it appears the way
// a snapped drawing does (useSnapGhosts): its outline traces itself in and
// its fill fades in.
export default function PaintPaths({ paint, clipId, drawIn }: { paint: Paint[]; clipId?: string; drawIn?: DrawIn }) {
  return (
    <>
      {paint.map((p, i) => {
        const trace = drawIn === "trace" && !p.isFill;
        return (
          <path
            key={i}
            d={p.d}
            stroke={p.stroke}
            strokeWidth={p.strokeWidth}
            fill={p.fill}
            strokeDasharray={p.dash}
            opacity={p.opacity}
            clipPath={clipId && p.isFill ? `url(#${clipId})` : undefined}
            // pathLength=1 lets the trace animation draw it as 0 → 1
            pathLength={trace ? 1 : undefined}
            className={trace ? "snap-draw" : drawIn ? "snap-brighten" : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: "none" }}
          />
        );
      })}
    </>
  );
}

import { drawStrokeProps } from "../lib/points";
import type { SnapGhost } from "../hooks/useSnapGhosts";

// The faded original of a snapped stroke (see hooks/useSnapGhosts), in the
// color, width and dash it was drawn with. Drawn in canvas coordinates,
// inside the panned/zoomed canvas layer.
export default function SnapGhosts({ ghosts, isDark }: { ghosts: SnapGhost[]; isDark: boolean }) {
  if (!ghosts.length) return null;
  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ overflow: "visible" }}>
      {ghosts.map((g) => (
        // the stroke's own opacity on the group; the fade (snap-ghost) on the path
        <g key={g.id} opacity={g.style.opacity / 100}>
          <path
            d={g.d}
            className="snap-ghost"
            fill="none"
            {...drawStrokeProps(g.style, isDark)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ))}
    </svg>
  );
}

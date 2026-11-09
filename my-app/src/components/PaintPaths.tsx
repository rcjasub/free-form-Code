import type { Paint } from "../lib/roughPaths";

// The SVG paths rough.js produced for one shape or arrow (lib/roughPaths).
// With `clipId`, the fill paths are clipped to that <clipPath>.
export default function PaintPaths({ paint, clipId }: { paint: Paint[]; clipId?: string }) {
  return (
    <>
      {paint.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke={p.stroke}
          strokeWidth={p.strokeWidth}
          fill={p.fill}
          strokeDasharray={p.dash}
          opacity={p.opacity}
          clipPath={clipId && p.isFill ? `url(#${clipId})` : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
      ))}
    </>
  );
}

// The faded original of a snapped stroke (see hooks/useSnapGhosts).
// Drawn in canvas coordinates, inside the panned/zoomed canvas layer.
export default function SnapGhosts({ ghosts, isDark }: { ghosts: { id: number; d: string }[]; isDark: boolean }) {
  if (!ghosts.length) return null;
  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ overflow: "visible" }}>
      {ghosts.map((g) => (
        <path
          key={g.id}
          d={g.d}
          className="snap-ghost"
          fill="none"
          stroke={isDark ? "#f5f5f5" : "#1f2937"}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

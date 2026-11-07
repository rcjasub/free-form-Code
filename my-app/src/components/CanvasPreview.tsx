import { memo } from "react";

// A sketch of a canvas for its dashboard card: where its blocks sit, drawn
// as simple shapes (text as gray lines, code as a little editor with
// colored lines, drawings as their strokes, images as boxes). It's fitted
// to the blocks, so a canvas reads the same at any zoom. The items come
// from GET /api/canvases/previews.

export type PreviewItem =
  | { t: "text" | "code" | "image" | "shape"; x: number; y: number; w: number; h: number }
  | { t: "draw"; x: number; y: number; pts: [number, number][] };

// syntax-like colors, so code reads as code: the code blocks' own on the
// dark theme, deeper versions on the light one
const CODE_COLORS = {
  dark: ["#ff79c6", "#8be9fd", "#50fa7b", "#bd93f9", "#f1fa8c"],
  light: ["#db2777", "#0891b2", "#16a34a", "#7c3aed", "#ca8a04"],
};
// line lengths that look like writing rather than a bar chart
const LINE_LENGTHS = [0.92, 0.7, 0.84, 0.55, 0.78, 0.63];

function bounds(items: PreviewItem[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of items) {
    if (item.t === "draw") {
      for (const [px, py] of item.pts) {
        minX = Math.min(minX, item.x + px);
        minY = Math.min(minY, item.y + py);
        maxX = Math.max(maxX, item.x + px);
        maxY = Math.max(maxY, item.y + py);
      }
    } else {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.w);
      maxY = Math.max(maxY, item.y + item.h);
    }
  }
  return { minX, minY, w: Math.max(maxX - minX, 1), h: Math.max(maxY - minY, 1) };
}

// A block's text as a few gray lines filling its box.
function Lines({ x, y, w, h, count, color, colors, seed }: {
  x: number; y: number; w: number; h: number; count: number; color?: string; colors?: string[]; seed: number;
}) {
  const step = h / count;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <rect
          key={i}
          x={x}
          y={y + i * step + step * 0.3}
          width={w * LINE_LENGTHS[(i + seed) % LINE_LENGTHS.length]}
          height={step * 0.4}
          rx={step * 0.2}
          fill={colors ? colors[(i + seed) % colors.length] : color}
          opacity={colors ? 0.8 : 1}
        />
      ))}
    </>
  );
}

function CanvasPreview({ items, isDark }: { items: PreviewItem[]; isDark: boolean }) {
  if (items.length === 0) return null;
  const b = bounds(items);
  // a little room around the blocks, more on a wide or tall canvas
  const pad = Math.max(b.w, b.h) * 0.06 + 8;
  const ink = isDark ? "#d4d4dc" : "#374151";
  // strong enough to read as text against the dots or grid
  const textLine = isDark ? "rgba(255,255,255,0.58)" : "rgba(17,24,39,0.5)";
  const codeBg = isDark ? "#232329" : "#f3f4f6";
  const codeBorder = isDark ? "#3c3c4a" : "#e5e7eb";
  const imageFill = isDark ? "#2e2e3a" : "#e5e7eb";

  return (
    <svg
      viewBox={`${b.minX - pad} ${b.minY - pad} ${b.w + pad * 2} ${b.h + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      {items.map((item, i) => {
        if (item.t === "draw") {
          return (
            <polyline
              key={i}
              points={item.pts.map(([px, py]) => `${item.x + px},${item.y + py}`).join(" ")}
              fill="none"
              stroke={ink}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        const { x, y, w, h } = item;
        if (item.t === "image") {
          return <rect key={i} x={x} y={y} width={w} height={h} rx={Math.min(w, h) * 0.04} fill={imageFill} />;
        }
        if (item.t === "shape") {
          return (
            <rect key={i} x={x} y={y} width={w} height={h} rx={Math.min(w, h) * 0.12} fill="none" stroke={ink}
              strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
          );
        }
        // roughly one line per 23px of text (a 14px font's line height), up to 6
        const count = Math.max(1, Math.min(6, Math.round(h / 23)));
        if (item.t === "code") {
          const inset = Math.min(w, h) * 0.12;
          return (
            <g key={i}>
              <rect x={x} y={y} width={w} height={h} rx={Math.min(w, h) * 0.08} fill={codeBg} stroke={codeBorder}
                strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <Lines x={x + inset} y={y + inset} w={w - inset * 2} h={h - inset * 2} count={count} colors={isDark ? CODE_COLORS.dark : CODE_COLORS.light} seed={i} />
            </g>
          );
        }
        return <Lines key={i} x={x} y={y} w={w} h={h} count={count} color={textLine} seed={i} />;
      })}
    </svg>
  );
}

export default memo(CanvasPreview);

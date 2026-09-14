export interface Pt {
  x: number;
  y: number;
}

// Averages each interior point with its neighbors to knock down the
// high-frequency jitter that mouse/trackpad sampling always has — the
// Bezier pass below smooths *corners*, but noisy input still makes a noisy
// (if continuous) curve without this. Endpoints are left untouched so the
// stroke still starts and ends exactly where the user pressed and released.
function movingAverage(points: Pt[], radius = 3): Pt[] {
  if (points.length <= 2) return points;
  return points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return p;
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(points.length - 1, i + radius); j++) {
      sx += points[j].x;
      sy += points[j].y;
      count++;
    }
    return { x: sx / count, y: sy / count };
  });
}

// Raw mouse samples are jagged — each straight segment between consecutive
// points is a visible little corner. Quadratic-Bezier-through-midpoints is
// the standard freehand-smoothing trick (used by most whiteboard tools):
// treat each real point as a curve control point and each midpoint between
// two consecutive points as the curve's anchor, so the path glides through
// the "spine" of the stroke instead of hard-cornering at every sample.
//
// Shapes with very few points (a straight line, or the snapped rectangle/
// triangle from shape detection) are drawn as straight segments instead —
// smoothing would visibly round off corners that are supposed to be crisp.
export function strokePath(rawPoints: Pt[]): string {
  if (rawPoints.length === 0) return "";
  if (rawPoints.length <= 5) {
    return rawPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  }

  const points = movingAverage(rawPoints);
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y}, ${mx} ${my}`;
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  d += ` Q ${prev.x} ${prev.y}, ${last.x} ${last.y}`;
  return d;
}

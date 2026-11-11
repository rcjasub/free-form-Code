export interface Pt {
  x: number;
  y: number;
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function perpendicularDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return dist(p, a);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

function pointToSegmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

// Average distance from each stroke point to the nearest edge of a closed
// polygon (vertices given as a loop, first point repeated at the end).
// Works the same way for a rectangle or a triangle candidate — whichever
// polygon the actual stroke hugs more closely wins.
function polygonFitError(points: Pt[], loop: Pt[]): number {
  return (
    points.reduce((sum, p) => {
      let minD = Infinity;
      for (let i = 0; i < loop.length - 1; i++) {
        const d = pointToSegmentDistance(p, loop[i], loop[i + 1]);
        if (d < minD) minD = d;
      }
      return sum + minD;
    }, 0) / points.length
  );
}

// Average distance from each stroke point to the ellipse boundary inscribed
// in the bounding box, measured radially: r(theta) = (rx*ry) / sqrt((ry*cos
// theta)^2 + (rx*sin theta)^2) is the ellipse's true distance from center at
// angle theta (comparing against (rx*cos theta, ry*sin theta) directly is a
// different, wrong point unless rx === ry — that parametrizes the ellipse by
// an angle that isn't the true angle-from-center except on a circle).
function ellipseFitError(points: Pt[], cx: number, cy: number, rx: number, ry: number): number {
  return (
    points.reduce((sum, p) => {
      const angle = Math.atan2(p.y - cy, p.x - cx);
      const actualR = Math.hypot(p.x - cx, p.y - cy);
      const cosT = Math.cos(angle);
      const sinT = Math.sin(angle);
      const expectedR = (rx * ry) / Math.sqrt((ry * cosT) ** 2 + (rx * sinT) ** 2);
      return sum + Math.abs(actualR - expectedR);
    }, 0) / points.length
  );
}

function ellipsePolygon(cx: number, cy: number, rx: number, ry: number, steps = 48): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return pts;
}

// Cheap stand-in for a minimum enclosing triangle: the point farthest from
// the centroid, the point farthest from that, and the point farthest from
// the line between those two. Tolerant of a hand-drawn stroke's rounded
// corners and uneven point density, unlike counting corners after polyline
// simplification.
function dominantTriangle(points: Pt[]): [Pt, Pt, Pt] {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;

  let a = points[0];
  let bestA = -1;
  for (const p of points) {
    const d = dist(p, { x: cx, y: cy });
    if (d > bestA) {
      bestA = d;
      a = p;
    }
  }

  let b = points[0];
  let bestB = -1;
  for (const p of points) {
    const d = dist(p, a);
    if (d > bestB) {
      bestB = d;
      b = p;
    }
  }

  let c = points[0];
  let bestC = -1;
  for (const p of points) {
    const d = perpendicularDistance(p, a, b);
    if (d > bestC) {
      bestC = d;
      c = p;
    }
  }

  return [a, b, c];
}

// Given a freehand stroke (absolute canvas coordinates), returns a cleaned-up
// "perfect" version of the shape it looks closest to — a straight line,
// triangle, axis-aligned rectangle, or ellipse — or null if nothing matches
// confidently enough, in which case the original freehand stroke is kept.
//
// Closed strokes are judged by fitting all three closed-shape candidates
// (rectangle, triangle, ellipse) and picking whichever the stroke actually
// hugs most closely, instead of committing to the first one that clears an
// isolated threshold — a sloppy rectangle can still beat a triangle or
// ellipse fit on relative merit even where it wouldn't have cleared a fixed
// "is this a rectangle" cutoff on its own.
export function detectShape(rawPoints: Pt[]): Pt[] | null {
  return detectShapeKind(rawPoints)?.points ?? null;
}

export type SnapKind = "line" | "rect" | "triangle" | "ellipse";

// detectShape, saying which shape it found: a rectangle or ellipse is saved
// as a real shape (arrows attach to it, it takes a label), the rest as a
// drawing.
export function detectShapeKind(rawPoints: Pt[]): { kind: SnapKind; points: Pt[] } | null {
  if (rawPoints.length < 5) return null;

  const first = rawPoints[0];
  const last = rawPoints[rawPoints.length - 1];
  const xs = rawPoints.map((p) => p.x);
  const ys = rawPoints.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const diag = Math.hypot(width, height);
  if (diag < 20) return null; // too small a gesture to classify meaningfully

  // Mouse-drawn shapes often don't close the loop tightly, so this is
  // deliberately generous.
  const closed = dist(first, last) < diag * 0.35;

  if (!closed) {
    // open stroke: is it basically a straight line end to end?
    const maxDev = Math.max(...rawPoints.map((p) => perpendicularDistance(p, first, last)));
    return maxDev < diag * 0.08 ? { kind: "line", points: [first, last] } : null;
  }

  const candidates: { kind: SnapKind; shape: Pt[]; err: number }[] = [];

  // A box that's nearly square was meant to be square (and an ellipse in it,
  // a circle): the clean shape comes out exactly even, centered where it was
  // drawn. Fitting is still judged against the box as drawn.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const even = Math.max(width, height) / Math.max(Math.min(width, height), 1) <= SQUARE_RATIO;
  const half = (width + height) / 4;
  const hw = even ? half : width / 2;
  const hh = even ? half : height / 2;

  const rectLoop = [
    { x: cx - hw, y: cy - hh },
    { x: cx + hw, y: cy - hh },
    { x: cx + hw, y: cy + hh },
    { x: cx - hw, y: cy + hh },
    { x: cx - hw, y: cy - hh },
  ];
  const drawnRect = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
    { x: minX, y: minY },
  ];
  candidates.push({ kind: "rect", shape: rectLoop, err: polygonFitError(rawPoints, drawnRect) / diag });

  const [a, b, c] = dominantTriangle(rawPoints);
  const triLoop = [a, b, c, a];
  candidates.push({ kind: "triangle", shape: triLoop, err: polygonFitError(rawPoints, triLoop) / diag });

  const rx = width / 2;
  const ry = height / 2;
  if (rx >= 5 && ry >= 5) {
    candidates.push({
      kind: "ellipse",
      shape: ellipsePolygon(cx, cy, hw, hh),
      err: ellipseFitError(rawPoints, cx, cy, rx, ry) / diag,
    });
  }

  candidates.sort((x, y) => x.err - y.err);
  let best = candidates[0];
  if (best.err >= 0.12) return null;

  // Rectangle or ellipse? Their fits can come out close for a box drawn with
  // soft corners. What tells them apart is the corners of the box: a
  // rectangle's stroke runs right by them, an ellipse's keeps well away
  // (a circle stays 0.146 of the box's diagonal from each).
  const rect = candidates.find((k) => k.kind === "rect")!;
  const ellipse = candidates.find((k) => k.kind === "ellipse");
  if (ellipse && (best === rect || best === ellipse) && rect.err < 0.12 && ellipse.err < 0.12) {
    best = cornerDistance(rawPoints, minX, minY, maxX, maxY) / diag < CORNER_SPLIT ? rect : ellipse;
  }
  return { kind: best.kind, points: best.shape };
}

// up to this much longer than wide (or wide than long) counts as square
const SQUARE_RATIO = 1.12;
// How close a stroke comes to its box's corners, over the box's diagonal:
// below this it's a rectangle, above it an ellipse. Measured on simulated
// hand-drawn strokes (wobble, corners rounded up to 18% of a side, a tilt of
// up to 6°, loops left open or overshot): rectangles came to at most 0.112,
// ellipses to no less than 0.123.
const CORNER_SPLIT = 0.117;

// The average, over the box's four corners, of how close the stroke comes.
function cornerDistance(points: Pt[], minX: number, minY: number, maxX: number, maxY: number): number {
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  let sum = 0;
  for (const k of corners) sum += Math.min(...points.map((p) => dist(p, k)));
  return sum / corners.length;
}

import { describe, expect, it } from "vitest";
import { detectShapeKind } from "./shapeDetection";

type P = { x: number; y: number };

// a rectangle traced from its top-left corner, with corners rounded by `r`
// and a small steady wobble, ending a little short of where it began
function rectStroke(w: number, h: number, r = 0, wobble = 1.5): P[] {
  const pts: P[] = [];
  const seg = (a: P, b: P) => {
    const n = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 4));
    for (let i = 0; i < n; i++) pts.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  };
  const arc = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i < 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  };
  seg({ x: r, y: 0 }, { x: w - r, y: 0 });
  arc(w - r, r, -Math.PI / 2);
  seg({ x: w, y: r }, { x: w, y: h - r });
  arc(w - r, h - r, 0);
  seg({ x: w - r, y: h }, { x: r, y: h });
  arc(r, h - r, Math.PI / 2);
  seg({ x: 0, y: h - r }, { x: 0, y: r });
  arc(r, r, Math.PI);
  return pts.slice(0, Math.round(pts.length * 0.95)).map((p, i) => ({ x: p.x + wobble * Math.sin(i * 0.4), y: p.y + wobble * Math.cos(i * 0.3) }));
}

function ellipseStroke(rx: number, ry: number): P[] {
  const pts: P[] = [];
  for (let i = 0; i < 90; i++) {
    const t = (i / 95) * Math.PI * 2;
    pts.push({ x: rx + rx * Math.cos(t) + Math.sin(i), y: ry + ry * Math.sin(t) + Math.cos(i) });
  }
  return pts;
}

const size = (pts: P[]) => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

describe("snapping a pen stroke", () => {
  it("makes a nearly square box exactly square", () => {
    const snap = detectShapeKind(rectStroke(160, 150))!;
    expect(snap.kind).toBe("rect");
    const { w, h } = size(snap.points);
    expect(w).toBeCloseTo(h, 6);
  });

  it("keeps a rectangle that's clearly longer than it is tall", () => {
    const snap = detectShapeKind(rectStroke(240, 120))!;
    expect(snap.kind).toBe("rect");
    const { w, h } = size(snap.points);
    expect(w / h).toBeGreaterThan(1.8);
  });

  it("knows a square with soft corners is still a square, not a circle", () => {
    expect(detectShapeKind(rectStroke(150, 150, 25))?.kind).toBe("rect");
  });

  it("makes a nearly round ellipse exactly round", () => {
    const snap = detectShapeKind(ellipseStroke(80, 74))!;
    expect(snap.kind).toBe("ellipse");
    const { w, h } = size(snap.points);
    expect(w).toBeCloseTo(h, 6);
  });

  it("keeps an oval an oval", () => {
    const snap = detectShapeKind(ellipseStroke(120, 60))!;
    expect(snap.kind).toBe("ellipse");
    const { w, h } = size(snap.points);
    expect(w / h).toBeGreaterThan(1.8);
  });
});

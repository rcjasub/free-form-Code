import rough from "roughjs";
import type { Options } from "roughjs/bin/core";
import type { Point } from "../components/DrawingNode";
import { fillColor, themeColor, TRANSPARENT } from "./colors";
import type { ArrowData, EdgeStyle, ElementStyle, ShapeData, ShapeKind, StrokeStyle } from "./shapes";

// Shapes and arrows are drawn with rough.js. At roughness 0 (the default)
// the lines are precise; above it they wobble like a hand-drawn sketch.
// rough.js turns each one into a few SVG paths; `seed` makes the wobble the
// same on every draw, so a shape doesn't jitter when the canvas re-renders.

export interface Paint {
  d: string;
  stroke: string;
  strokeWidth: number;
  fill: string;
  dash?: string; // only on the outline, never on pattern lines
  isFill: boolean; // clipped to the shape (see shapeClipPath)
  opacity?: number;
}

const generator = rough.generator();

function dashArray(style: StrokeStyle, width: number) {
  if (style === "dashed") return [8, 6 + width];
  if (style === "dotted") return [0.5, 5 + width];
  return undefined;
}

// `pattern` asks rough.js to draw a dot or stripe fill.
function options(style: ElementStyle, seed: number, isDark: boolean, pattern?: { color: string; dots: boolean }): Options {
  return {
    seed,
    roughness: style.roughness,
    // a bit less bow than rough.js's default keeps boxes looking like boxes
    bowing: 0.7,
    stroke: themeColor(style.stroke, isDark),
    strokeWidth: style.strokeWidth,
    fill: pattern ? fillColor(pattern.color, isDark) : undefined,
    fillStyle: pattern ? (pattern.dots ? "dots" : "hachure") : undefined,
    fillWeight: pattern?.dots ? 1.4 : 1,
    hachureGap: pattern?.dots ? 11 : 8,
    hachureAngle: -45,
    // One pass per line: rough.js draws a sketchy line twice, which reads as
    // pencil. Precise lines don't need it, and it breaks dashes up.
    disableMultiStroke: style.roughness === 0 || style.strokeStyle !== "solid",
    disableMultiStrokeFill: true,
    preserveVertices: true,
  };
}

// rough.js lists the fill's paths first and the outline last.
function toPaint(drawable: ReturnType<typeof generator.path>, style: ElementStyle): Paint[] {
  const paths = generator.toPaths(drawable);
  const dash = dashArray(style.strokeStyle, style.strokeWidth)?.join(" ");
  const last = paths.length - 1;
  return paths.map((p, i) => ({
    d: p.d,
    stroke: p.stroke,
    strokeWidth: p.strokeWidth,
    fill: p.fill ?? "none",
    dash: i === last ? dash : undefined,
    isFill: i < last,
  }));
}

// A rectangle as a path: with rounded corners (rough.js has no rounded rect),
// or square ones.
function rectPath(x: number, y: number, w: number, h: number, edges: EdgeStyle) {
  if (edges === "sharp") return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
  const r = Math.min(10, w / 4, h / 4);
  return (
    `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} ` +
    `L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} ` +
    `L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} ` +
    `L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`
  );
}

// A diamond (corners top, right, bottom, left) as a path, its corners eased
// with a curve when they're round. Each corner's curve starts a set share of
// the way along the sides, so a small diamond rounds as much as a big one.
function diamondPath(w: number, h: number, inset: number, edges: EdgeStyle) {
  const pts: [number, number][] = [[w / 2, inset], [w - inset, h / 2], [w / 2, h - inset], [inset, h / 2]];
  if (edges === "sharp") return `M ${pts.map((p) => p.join(" ")).join(" L ")} Z`;
  const side = Math.hypot(w / 2 - inset, h / 2 - inset);
  const cut = Math.min(12, side * 0.2) / side; // how far along a side the curve starts
  const along = (a: [number, number], b: [number, number], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  let d = "";
  pts.forEach((p, i) => {
    const prev = pts[(i + 3) % 4];
    const next = pts[(i + 1) % 4];
    const [ax, ay] = along(p, prev, cut);
    const [bx, by] = along(p, next, cut);
    d += `${i === 0 ? "M" : "L"} ${ax} ${ay} Q ${p[0]} ${p[1]} ${bx} ${by} `;
  });
  return `${d}Z`;
}

// A w×h shape, drawn inside its box (inset by half the stroke so the line
// doesn't poke out).
export function shapePaint(
  shape: Pick<ShapeData, keyof ElementStyle | "fill" | "fillStyle" | "seed" | "edges"> & { kind: ShapeKind },
  w: number,
  h: number,
  isDark: boolean,
): Paint[] {
  const filled = shape.fill !== TRANSPARENT;
  const pattern = filled && shape.fillStyle !== "solid" ? { color: shape.fill, dots: shape.fillStyle === "dots" } : undefined;
  const o = options(shape, shape.seed, isDark, pattern);
  const i = shape.strokeWidth / 2;
  const iw = Math.max(w - 2 * i, 1);
  const ih = Math.max(h - 2 * i, 1);
  const drawable =
    shape.kind === "ellipse"
      ? generator.ellipse(w / 2, h / 2, iw, ih, o)
      : shape.kind === "diamond"
        ? generator.path(diamondPath(w, h, i, shape.edges), o)
        : generator.path(rectPath(i, i, iw, ih, shape.edges), o);
  const paint = toPaint(drawable, shape);
  if (!filled || pattern) return paint;
  // a solid fill: the exact shape in the pale shade, under the outline
  const solid: Paint = {
    d: shapeClipPath(shape.kind, w, h, shape.edges),
    stroke: "none",
    strokeWidth: 0,
    fill: fillColor(shape.fill, isDark),
    isFill: false,
  };
  return [solid, ...paint];
}

// The shape's exact outline, with no wobble. Sketchy pattern lines overshoot
// the shape's edge a little at random, so they're clipped to this.
export function shapeClipPath(kind: ShapeKind, w: number, h: number, edges: EdgeStyle = "round") {
  if (kind === "ellipse") {
    return `M 0 ${h / 2} A ${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2} A ${w / 2} ${h / 2} 0 1 0 0 ${h / 2} Z`;
  }
  if (kind === "diamond") return diamondPath(w, h, 0, edges);
  return rectPath(0, 0, w, h, edges);
}

// An arrow's line and its filled, triangular head. Points are in whatever
// coordinates the caller draws in.
export function arrowPaint(arrow: Pick<ArrowData, keyof ElementStyle | "seed">, points: Point[], isDark: boolean): Paint[] {
  const o = options(arrow, arrow.seed, isDark);
  const end = points[points.length - 1];
  const before = points[points.length - 2];
  const angle = Math.atan2(end.y - before.y, end.x - before.x);
  const segment = Math.hypot(end.x - before.x, end.y - before.y);
  const length = Math.min(9 + arrow.strokeWidth * 2.5, segment / 2);
  const spread = 0.42; // half the head's angle, in radians
  const wing = (turn: number) =>
    [end.x - length * Math.cos(angle + turn), end.y - length * Math.sin(angle + turn)] as [number, number];

  // the line stops at the head's base, so its end doesn't show past the point
  const base = length * Math.cos(spread);
  const stop = { x: end.x - base * Math.cos(angle), y: end.y - base * Math.sin(angle) };
  const linePoints = [...points.slice(0, -1), stop];
  const line = toPaint(generator.linearPath(linePoints.map((p) => [p.x, p.y]), o), arrow);

  // the head is solid even on a dashed arrow, so it still reads as a head
  const color = themeColor(arrow.stroke, isDark);
  const head = toPaint(
    generator.polygon([wing(spread), [end.x, end.y], wing(-spread)], {
      ...o,
      fill: color,
      fillStyle: "solid",
      disableMultiStroke: true,
    }),
    { ...arrow, strokeStyle: "solid" },
  ).map((p) => ({ ...p, isFill: false }));
  return [...line, ...head];
}

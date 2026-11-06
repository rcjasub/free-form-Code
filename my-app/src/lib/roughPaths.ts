import rough from "roughjs";
import type { Options } from "roughjs/bin/core";
import type { Point } from "../components/DrawingNode";
import { themeColor, TRANSPARENT } from "./colors";
import type { ArrowData, ElementStyle, ShapeData, ShapeKind, StrokeStyle } from "./shapes";

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

// A solid fill is a soft tint of its color rather than the color itself, so
// a filled box reads as a tinted area and its text stays readable in either
// theme. Patterns are a little stronger, being thin.
const TINT_OPACITY = { dark: 0.18, light: 0.16 };
const PATTERN_OPACITY = 0.5;

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
    fill: pattern ? themeColor(pattern.color, isDark) : undefined,
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
function toPaint(drawable: ReturnType<typeof generator.path>, style: ElementStyle, fillOpacity?: number): Paint[] {
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
    opacity: i < last ? fillOpacity : undefined,
  }));
}

// A rectangle with rounded corners, as a path (rough.js has no rounded rect).
function roundedRect(x: number, y: number, w: number, h: number) {
  const r = Math.min(10, w / 4, h / 4);
  return (
    `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} ` +
    `L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} ` +
    `L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} ` +
    `L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`
  );
}

// A w×h shape, drawn inside its box (inset by half the stroke so the line
// doesn't poke out).
export function shapePaint(
  shape: Pick<ShapeData, keyof ElementStyle | "fill" | "fillStyle" | "seed"> & { kind: ShapeKind },
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
        ? generator.polygon([[w / 2, i], [w - i, h / 2], [w / 2, h - i], [i, h / 2]], o)
        : generator.path(roundedRect(i, i, iw, ih), o);
  const paint = toPaint(drawable, shape, PATTERN_OPACITY);
  if (!filled || pattern) return paint;
  // the tint: the exact shape, under the outline
  const tint: Paint = {
    d: shapeClipPath(shape.kind, w, h),
    stroke: "none",
    strokeWidth: 0,
    fill: themeColor(shape.fill, isDark),
    isFill: false,
    opacity: isDark ? TINT_OPACITY.dark : TINT_OPACITY.light,
  };
  return [tint, ...paint];
}

// The shape's exact outline, with no wobble. Sketchy pattern lines overshoot
// the shape's edge a little at random, so they're clipped to this.
export function shapeClipPath(kind: ShapeKind, w: number, h: number) {
  if (kind === "ellipse") {
    return `M 0 ${h / 2} A ${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2} A ${w / 2} ${h / 2} 0 1 0 0 ${h / 2} Z`;
  }
  if (kind === "diamond") return `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`;
  return roundedRect(0, 0, w, h);
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
  ).map((p) => ({ ...p, isFill: false, opacity: undefined }));
  return [...line, ...head];
}

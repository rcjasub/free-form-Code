import type { Point } from "../components/DrawingNode";
import { themeColor } from "./colors";
import { DEFAULT_STYLE, type ElementStyle } from "./shapes";

// A drawing's stroke style. Sloppiness doesn't apply: a freehand line is
// already hand-drawn.
export type DrawStyle = Pick<ElementStyle, "stroke" | "strokeWidth" | "strokeStyle" | "opacity">;

export const DEFAULT_DRAW_STYLE: DrawStyle = {
  stroke: DEFAULT_STYLE.stroke,
  strokeWidth: DEFAULT_STYLE.strokeWidth,
  strokeStyle: DEFAULT_STYLE.strokeStyle,
  opacity: DEFAULT_STYLE.opacity,
};

const COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i;
const STROKE_STYLES: readonly string[] = ["solid", "dashed", "dotted"];

function validPoints(value: unknown): Point[] | null {
  if (!Array.isArray(value)) return null;
  const valid = value.every(
    (p) => typeof p === "object" && p !== null && Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  return valid ? (value as Point[]) : null;
}

const clamp = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : fallback;

// Draw blocks keep their stroke in `content` as JSON, in one of two forms:
//   [{x, y}, …]                                — the original: just points
//   {points: [...], stroke, strokeWidth, …}    — a drawing given a style
// That content can arrive from another client over the socket, so a malformed
// value must not throw: a throw inside a setNodes updater takes down the whole
// page, for everyone in the room. Points are null when they aren't valid.
export function parseDrawing(content: string): { points: Point[] | null; style: DrawStyle } {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return { points: null, style: DEFAULT_DRAW_STYLE };
  }
  if (Array.isArray(value)) return { points: validPoints(value), style: DEFAULT_DRAW_STYLE };
  if (!value || typeof value !== "object") return { points: null, style: DEFAULT_DRAW_STYLE };
  const o = value as Record<string, unknown>;
  return {
    points: validPoints(o.points),
    style: {
      stroke: typeof o.stroke === "string" && COLOR.test(o.stroke) ? o.stroke : DEFAULT_DRAW_STYLE.stroke,
      strokeWidth: clamp(o.strokeWidth, 0.5, 20, DEFAULT_DRAW_STYLE.strokeWidth),
      strokeStyle:
        typeof o.strokeStyle === "string" && STROKE_STYLES.includes(o.strokeStyle)
          ? (o.strokeStyle as DrawStyle["strokeStyle"])
          : DEFAULT_DRAW_STYLE.strokeStyle,
      opacity: clamp(o.opacity, 0, 100, DEFAULT_DRAW_STYLE.opacity),
    },
  };
}

// Just the points, from either form.
export function parsePoints(content: string): Point[] | null {
  return parseDrawing(content).points;
}

const isDefault = (s: DrawStyle) =>
  s.stroke === DEFAULT_DRAW_STYLE.stroke &&
  s.strokeWidth === DEFAULT_DRAW_STYLE.strokeWidth &&
  s.strokeStyle === DEFAULT_DRAW_STYLE.strokeStyle &&
  s.opacity === DEFAULT_DRAW_STYLE.opacity;

// A drawing with the default style is saved in the original form, so it
// reads the same everywhere it did before styles existed.
export function serializeDrawing(points: Point[], style: DrawStyle): string {
  if (isDefault(style)) return JSON.stringify(points);
  const { stroke, strokeWidth, strokeStyle, opacity } = style;
  return JSON.stringify({ points, stroke, strokeWidth, strokeStyle, opacity });
}

// SVG stroke props for a drawing's line (also the live stroke while drawing).
export function drawStrokeProps(style: DrawStyle, isDark: boolean) {
  const w = style.strokeWidth;
  return {
    stroke: themeColor(style.stroke, isDark),
    strokeWidth: w,
    strokeDasharray: style.strokeStyle === "dashed" ? `${8} ${8 + w}` : style.strokeStyle === "dotted" ? `1.5 ${6 + w}` : undefined,
  };
}

import type { Point } from "../components/DrawingNode";

// Diagram primitives. A "shape" or "arrow" block keeps all of its geometry
// and styling as JSON in `content` (like a drawing's points); the block's own
// x/y is its top-left corner (an arrow's: where it was drawn from).

export type ShapeKind = "rect" | "ellipse" | "diamond";
const SHAPE_KINDS: readonly string[] = ["rect", "ellipse", "diamond"];

// Filled in by the AI (Phase 2): which part of the architecture this box
// stands for, so its chat (Phase 3) knows what it's talking about.
export interface SectionMeta {
  sectionId: string;
  summary: string;
  files: string[];
}

export type StrokeStyle = "solid" | "dashed" | "dotted";
// a rectangle's or diamond's corners
export type EdgeStyle = "round" | "sharp";
const EDGE_STYLES: readonly string[] = ["round", "sharp"];
// solid: a soft tint of the fill color; dots / stripes: a pattern in it
export type FillStyle = "solid" | "dots" | "stripes";
const STROKE_STYLES: readonly string[] = ["solid", "dashed", "dotted"];
const FILL_STYLES: readonly string[] = ["solid", "dots", "stripes"];
// what the fill styles were called before, read as their nearest one now
const OLD_FILL_STYLES: Record<string, FillStyle> = { hachure: "stripes", "cross-hatch": "stripes" };

// How a shape or arrow is drawn, set from the properties panel.
export interface ElementStyle {
  stroke: string; // a color, or "auto" (follows the theme; lib/colors)
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  opacity: number; // 0–100
  roughness: number; // 0 = precise, 1 = sketch, 2 = sloppy (up to 3 is accepted)
}

// What the properties panel edits: the element style, plus a shape's fill.
// New shapes are drawn with the last one picked.
export interface DiagramStyle extends ElementStyle {
  fill: string; // a color, or "transparent"
  fillStyle: FillStyle;
  edges: EdgeStyle;
}

export interface ShapeData extends DiagramStyle {
  kind: ShapeKind;
  w: number;
  h: number;
  label: string;
  // keeps the hand-drawn wobble the same every time it's drawn (rough.js)
  seed: number;
  meta?: SectionMeta;
}

export interface ArrowData extends ElementStyle {
  // the shapes it's attached to; that end follows the shape when it moves
  fromId?: string;
  toId?: string;
  // relative to the block's x/y; at least two (start and end)
  points: Point[];
  label?: string;
  seed: number;
}

// The box a shape sits in, in canvas coordinates, for anchorPoint.
export interface ShapeBox {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: ShapeKind;
}

export const DEFAULT_STYLE: DiagramStyle = {
  stroke: "auto",
  strokeWidth: 1.5,
  strokeStyle: "solid",
  opacity: 100,
  roughness: 0,
  fill: "transparent",
  fillStyle: "solid",
  edges: "round",
};
export const DEFAULT_SHAPE: ShapeData = { ...DEFAULT_STYLE, kind: "rect", w: 160, h: 80, label: "", seed: 1 };
export const DEFAULT_ARROW: ArrowData = {
  stroke: DEFAULT_STYLE.stroke,
  strokeWidth: DEFAULT_STYLE.strokeWidth,
  strokeStyle: DEFAULT_STYLE.strokeStyle,
  opacity: DEFAULT_STYLE.opacity,
  roughness: DEFAULT_STYLE.roughness,
  points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
  seed: 1,
};

// a fresh seed for a new shape or arrow, so each one wobbles its own way
export function newSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

const MAX_LABEL = 500;
const MAX_ID = 64;
const MAX_SIZE = 10_000;

// --- validation helpers --------------------------------------------------
// Content can arrive from another client over the socket, so nothing in it
// is trusted: each field is checked and replaced by its default if it's off.

type Json = Record<string, unknown>;

function asObject(content: string): Json {
  try {
    const v: unknown = JSON.parse(content);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
  } catch {
    return {};
  }
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function size(v: unknown, fallback: number) {
  return isNum(v) && v > 0 ? Math.min(v, MAX_SIZE) : fallback;
}

// Colors end up in SVG fill/stroke attributes. Only plain color forms are
// allowed: a named color, a hex code, or our keywords. That rules out
// url(...) references and anything else that isn't just a color.
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i;
function color(v: unknown, fallback: string) {
  return typeof v === "string" && COLOR.test(v) ? v : fallback;
}

function text(v: unknown, max: number) {
  return typeof v === "string" ? v.slice(0, max) : undefined;
}

function point(v: unknown): Point | null {
  if (!v || typeof v !== "object") return null;
  const { x, y } = v as Json;
  return isNum(x) && isNum(y) ? { x, y } : null;
}

function sectionMeta(v: unknown): SectionMeta | undefined {
  if (!v || typeof v !== "object") return undefined;
  const m = v as Json;
  const sectionId = text(m.sectionId, MAX_ID);
  if (!sectionId) return undefined;
  const files = Array.isArray(m.files) ? m.files.filter((f): f is string => typeof f === "string").slice(0, 200) : [];
  return { sectionId, summary: text(m.summary, 4000) ?? "", files };
}

function oneOf<T extends string>(v: unknown, allowed: readonly string[], fallback: T): T {
  return typeof v === "string" && allowed.includes(v) ? (v as T) : fallback;
}

function between(v: unknown, min: number, max: number, fallback: number) {
  return isNum(v) ? Math.min(Math.max(v, min), max) : fallback;
}

// The style fields shapes and arrows share. `dashed: true` is how arrows
// stored a dashed line before strokeStyle existed.
function elementStyle(o: Json): ElementStyle {
  return {
    stroke: color(o.stroke, DEFAULT_STYLE.stroke),
    strokeWidth: between(o.strokeWidth, 0.5, 20, DEFAULT_STYLE.strokeWidth),
    strokeStyle: oneOf(o.strokeStyle, STROKE_STYLES, o.dashed === true ? "dashed" : DEFAULT_STYLE.strokeStyle),
    opacity: between(o.opacity, 0, 100, DEFAULT_STYLE.opacity),
    roughness: between(o.roughness, 0, 3, DEFAULT_STYLE.roughness),
  };
}

function seed(v: unknown) {
  return isNum(v) && Number.isInteger(v) && v > 0 ? v : 1;
}

// --- shapes ----------------------------------------------------------------

export function parseShape(content: string): ShapeData {
  const o = asObject(content);
  const meta = sectionMeta(o.meta);
  return {
    ...elementStyle(o),
    kind: oneOf(o.kind, SHAPE_KINDS, DEFAULT_SHAPE.kind),
    w: size(o.w, DEFAULT_SHAPE.w),
    h: size(o.h, DEFAULT_SHAPE.h),
    fill: color(o.fill, DEFAULT_SHAPE.fill),
    fillStyle: oneOf(o.fillStyle, FILL_STYLES, (typeof o.fillStyle === "string" && OLD_FILL_STYLES[o.fillStyle]) || DEFAULT_SHAPE.fillStyle),
    // shapes from before this was a choice all had round corners
    edges: oneOf(o.edges, EDGE_STYLES, DEFAULT_SHAPE.edges),
    label: text(o.label, MAX_LABEL) ?? "",
    seed: seed(o.seed),
    ...(meta && { meta }),
  };
}

export function serializeShape(shape: ShapeData): string {
  return JSON.stringify(shape);
}

// --- arrows ------------------------------------------------------------------

export function parseArrow(content: string): ArrowData {
  const o = asObject(content);
  const points = Array.isArray(o.points) ? o.points.map(point) : [];
  const valid = points.every((p) => p !== null) && points.length >= 2;
  const fromId = text(o.fromId, MAX_ID);
  const toId = text(o.toId, MAX_ID);
  const label = text(o.label, MAX_LABEL);
  return {
    ...elementStyle(o),
    // one bad point makes the whole line meaningless, so fall back entirely
    points: valid ? (points as Point[]) : DEFAULT_ARROW.points,
    seed: seed(o.seed),
    ...(fromId && { fromId }),
    ...(toId && { toId }),
    ...(label && { label }),
  };
}

export function serializeArrow(arrow: ArrowData): string {
  return JSON.stringify(arrow);
}

// --- geometry ------------------------------------------------------------------

export function shapeCenter(box: ShapeBox): Point {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

// Where the line from the shape's center toward `toward` crosses its border.
// With d = toward - center and half-sizes a, b, the border point is
// center + d * t, where t solves the shape's outline equation:
//   rect:     max(|dx|/a, |dy|/b) = 1
//   ellipse:  dx²/a² + dy²/b² = 1
//   diamond:  |dx|/a + |dy|/b = 1
// Each of those is "scale d until this expression equals 1", so t is
// 1 / (the expression evaluated at d).
export function anchorPoint(shape: ShapeBox, toward: Point): Point {
  const c = shapeCenter(shape);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const a = shape.w / 2;
  const b = shape.h / 2;
  if ((dx === 0 && dy === 0) || a <= 0 || b <= 0) return c; // no direction to go in

  const reach =
    shape.kind === "ellipse"
      ? Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b))
      : shape.kind === "diamond"
        ? Math.abs(dx) / a + Math.abs(dy) / b
        : Math.max(Math.abs(dx) / a, Math.abs(dy) / b);
  return { x: c.x + dx / reach, y: c.y + dy / reach };
}

// An arrow as it should be drawn right now: each attached end is moved onto
// its shape's border, aimed at the other end (the other shape's center, if
// that end is attached too), so arrows follow their shapes around. Nothing
// is saved — every client works it out from the shapes' current positions,
// so moving a shape never has to update its arrows. An end whose shape is
// gone (deleted) just stays where it was drawn.
export function resolveArrow(arrow: ArrowData, x: number, y: number, shapes: ReadonlyMap<string, ShapeBox>): ArrowData {
  const from = arrow.fromId ? shapes.get(arrow.fromId) : undefined;
  const to = arrow.toId ? shapes.get(arrow.toId) : undefined;
  if (!from && !to) return arrow;

  const abs = arrow.points.map((p) => ({ x: p.x + x, y: p.y + y }));
  const last = abs.length - 1;
  // what each end aims at: its neighbor point, or a bent arrow's middle
  const aimStart = abs.length > 2 ? abs[1] : to ? shapeCenter(to) : abs[last];
  const aimEnd = abs.length > 2 ? abs[last - 1] : from ? shapeCenter(from) : abs[0];
  if (from) abs[0] = anchorPoint(from, aimStart);
  if (to) abs[last] = anchorPoint(to, aimEnd);
  return { ...arrow, points: abs.map((p) => ({ x: p.x - x, y: p.y - y })) };
}

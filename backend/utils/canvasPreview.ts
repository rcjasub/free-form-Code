// Turns a canvas's blocks into a rough sketch of its layout, for the
// dashboard's cards: a box per text/code/image block, a few points per
// drawing, and each shape as its own outline (rect, ellipse or diamond) in
// its colors. No text is sent, only where things are, roughly how big and
// how shapes look.

export interface PreviewRow {
  canvas_id: string;
  type: string;
  language: string | null;
  x: number;
  y: number;
  width: number | null;
  wrap_width: number | null;
  font_size: number | null;
  lines: number | null; // text and code: how many lines
  longest: number | null; // text and code: the longest line's length
  content: string | null; // only for drawings (and diagram shapes)
}

export type PreviewItem =
  | { t: "text" | "code" | "image"; x: number; y: number; w: number; h: number }
  | { t: "shape"; x: number; y: number; w: number; h: number; k?: "ellipse" | "diamond"; s?: string; f?: string; d?: 1 }
  | { t: "draw"; x: number; y: number; pts: [number, number][] };

// Blocks per canvas the sketch draws (the query takes the newest ones).
export const PREVIEW_BLOCKS_PER_CANVAS = 100;
const POINTS_PER_DRAWING = 24;

// Text sizes, as the canvas draws them (FloatingNode).
const DEFAULT_FONT = 14;
const LINE_HEIGHT = 1.625;
const CHAR_WIDTH = 0.6; // of the font size, for a monospace font
const MAX_TEXT_WIDTH = 640;
const MAX_HEIGHT = 1600;

const round = (n: number) => Math.round(n);

// Every nth point, keeping the last, so a long stroke stays a stroke.
export function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

// A drawing's points: a bare array (older blocks) or { points: [...] }.
function drawingPoints(content: string | null): [number, number][] | null {
  if (!content) return null;
  try {
    const value: unknown = JSON.parse(content);
    const raw = Array.isArray(value) ? value : (value as { points?: unknown })?.points;
    if (!Array.isArray(raw)) return null;
    const points = raw.filter(
      (p): p is { x: number; y: number } =>
        typeof p === "object" && p !== null && Number.isFinite(p.x) && Number.isFinite(p.y),
    );
    if (points.length === 0) return null;
    return downsample(points, POINTS_PER_DRAWING).map((p) => [round(p.x), round(p.y)]);
  } catch {
    return null;
  }
}

// A color as shapes save it: a palette name ("red", "auto") or a hex code,
// the same rule the canvas uses (my-app lib/shapes.ts). Anything else is
// left out, so only plain color values reach the card.
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i;
const color = (v: unknown) => (typeof v === "string" && COLOR.test(v) ? v : undefined);

// How a shape looks, from its content: its size, outline (a rect is the
// default, so it's left out), line and fill colors (none when transparent)
// and whether its line is dashed.
function shapeLook(content: string | null): Omit<Extract<PreviewItem, { t: "shape" }>, "t" | "x" | "y"> | null {
  if (!content) return null;
  try {
    const value = JSON.parse(content) as Record<string, unknown>;
    if (!Number.isFinite(value?.w) || !Number.isFinite(value?.h)) return null;
    const kind = value.kind === "ellipse" || value.kind === "diamond" ? value.kind : undefined;
    const stroke = color(value.stroke);
    const fill = value.fill === "transparent" ? undefined : color(value.fill);
    const dashed = value.strokeStyle === "dashed" || value.strokeStyle === "dotted";
    return {
      w: round(value.w as number),
      h: round(value.h as number),
      ...(kind && { k: kind }),
      ...(stroke && { s: stroke }),
      ...(fill && { f: fill }),
      ...(dashed && { d: 1 as const }),
    };
  } catch {
    return null; // not a shape we can read
  }
}

export function toPreviewItem(row: PreviewRow): PreviewItem | null {
  const x = round(row.x);
  const y = round(row.y);
  if (row.type === "draw") {
    const pts = drawingPoints(row.content);
    return pts ? { t: "draw", x, y, pts } : null;
  }
  if (row.type === "image") {
    const w = row.width && row.width > 0 ? row.width : 240;
    return { t: "image", x, y, w: round(w), h: round(w * 0.66) };
  }
  if (row.type === "shape") {
    const look = shapeLook(row.content);
    return look ? { t: "shape", x, y, ...look } : null;
  }
  if (row.type !== "text" && row.type !== "code") return null; // arrows etc.

  const font = row.font_size ?? DEFAULT_FONT;
  const charW = font * CHAR_WIDTH;
  const lineH = font * LINE_HEIGHT;
  const lines = Math.max(row.lines ?? 1, 1);
  const longest = Math.max(row.longest ?? 0, 1);
  const isCode = row.language !== "text";
  const natural = longest * charW;
  const w = row.wrap_width ?? Math.min(natural, MAX_TEXT_WIDTH);
  // a wrapped block runs onto extra lines; a rough guess is enough here
  const wrapped = natural > w ? Math.ceil(natural / w) : 1;
  const h = Math.min(lines * wrapped * lineH, MAX_HEIGHT);
  return isCode
    ? { t: "code", x, y, w: round(Math.max(w + 24, 120)), h: round(h + 20) }
    : { t: "text", x, y, w: round(Math.max(w, 24)), h: round(h) };
}

// Each canvas's items, keyed by canvas id.
export function buildPreviews(rows: PreviewRow[]): Record<string, PreviewItem[]> {
  const previews: Record<string, PreviewItem[]> = {};
  for (const row of rows) {
    const item = toPreviewItem(row);
    if (item) (previews[row.canvas_id] ??= []).push(item);
  }
  return previews;
}

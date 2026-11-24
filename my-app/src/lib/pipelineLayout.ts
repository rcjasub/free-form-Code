// Where a Pipeline's steps and links go (components/Pipeline): each step in
// a column by how many steps come before it, the columns left to right (or
// top to bottom), and each link an elbow with rounded corners between them.

export type PipelineDirection = "horizontal" | "vertical";

export interface PipelineLayout {
  // each step's top-left corner
  pos: Map<string, { x: number; y: number }>;
  // an SVG path per link, in the order given
  paths: string[];
  width: number;
  height: number;
}

export const STEP_HEIGHT = 52;
const COLUMN_GAP = 56; // horizontal: between columns
const ROW_GAP = 14; // horizontal: between steps in a column; vertical: side by side
const LEVEL_GAP = 28; // vertical: between levels

// How many steps come before each one, by its longest chain of links.
// A link back to an earlier step (a loop) is ignored.
export function depths(ids: readonly string[], edges: readonly (readonly [string, string])[]): Map<string, number> {
  const d = new Map(ids.map((id) => [id, 0]));
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const [a, b] of edges) {
      const da = d.get(a);
      const db = d.get(b);
      if (da === undefined || db === undefined || db >= da + 1 || da + 1 >= ids.length) continue;
      d.set(b, da + 1);
      changed = true;
    }
    if (!changed) break;
  }
  return d;
}

export function pipelineLayout(
  ids: readonly string[],
  edges: readonly (readonly [string, string])[],
  direction: PipelineDirection,
  stepWidth: number,
): PipelineLayout {
  const d = depths(ids, edges);
  const levels: string[][] = [];
  for (const id of ids) (levels[d.get(id)!] ??= []).push(id);
  const widest = Math.max(1, ...levels.map((l) => l.length));

  const pos = new Map<string, { x: number; y: number }>();
  let width: number;
  let height: number;
  if (direction === "horizontal") {
    const span = widest * STEP_HEIGHT + (widest - 1) * ROW_GAP;
    levels.forEach((level, i) => {
      const top = (span - (level.length * STEP_HEIGHT + (level.length - 1) * ROW_GAP)) / 2;
      level.forEach((id, j) => pos.set(id, { x: i * (stepWidth + COLUMN_GAP), y: top + j * (STEP_HEIGHT + ROW_GAP) }));
    });
    width = levels.length * stepWidth + (levels.length - 1) * COLUMN_GAP;
    height = span;
  } else {
    const span = widest * stepWidth + (widest - 1) * ROW_GAP;
    levels.forEach((level, i) => {
      const left = (span - (level.length * stepWidth + (level.length - 1) * ROW_GAP)) / 2;
      level.forEach((id, j) => pos.set(id, { x: left + j * (stepWidth + ROW_GAP), y: i * (STEP_HEIGHT + LEVEL_GAP) }));
    });
    width = span;
    height = levels.length * STEP_HEIGHT + (levels.length - 1) * LEVEL_GAP;
  }

  const paths = edges.map(([a, b]) => {
    const p = pos.get(a);
    const q = pos.get(b);
    return p && q ? linkPath(p, q, direction, stepWidth) : "";
  });
  return { pos, paths, width, height };
}

// From one step's far side to the next one's near side: straight if they
// line up, else out, across at the halfway line, and in, rounding corners.
function linkPath(a: { x: number; y: number }, b: { x: number; y: number }, direction: PipelineDirection, w: number): string {
  const h = STEP_HEIGHT;
  if (direction === "horizontal") {
    const sx = a.x + w, sy = a.y + h / 2, tx = b.x, ty = b.y + h / 2, mx = (sx + tx) / 2;
    if (Math.abs(sy - ty) < 1) return `M${sx} ${sy}H${tx}`;
    const r = Math.min(8, Math.abs(ty - sy) / 2, (tx - sx) / 2), s = ty > sy ? 1 : -1;
    return `M${sx} ${sy}H${mx - r}Q${mx} ${sy} ${mx} ${sy + s * r}V${ty - s * r}Q${mx} ${ty} ${mx + r} ${ty}H${tx}`;
  }
  const sx = a.x + w / 2, sy = a.y + h, tx = b.x + w / 2, ty = b.y, my = (sy + ty) / 2;
  if (Math.abs(sx - tx) < 1) return `M${sx} ${sy}V${ty}`;
  const r = Math.min(8, Math.abs(tx - sx) / 2, (ty - sy) / 2), s = tx > sx ? 1 : -1;
  return `M${sx} ${sy}V${my - r}Q${sx} ${my} ${sx + s * r} ${my}H${tx - s * r}Q${tx} ${my} ${tx} ${my + r}V${ty}`;
}

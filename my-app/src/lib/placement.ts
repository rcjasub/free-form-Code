import { FONT_SIZE, LINE_HEIGHT } from "./splitLines";
import type { RestorePayload } from "./restore";

// Where a canvas uploaded from this browser lands on a server canvas that
// already has blocks: where it was, unless that puts it on top of what's
// there — then the whole group moves to the right of the existing content,
// keeping its own layout.

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// space left between the existing content and a group moved beside it
export const PLACEMENT_GAP = 80;
// a block's padding around its text, roughly
const TEXT_PADDING = 16;
// a monospace character is about this much of the font size wide
const CHAR_WIDTH = 0.6;

// The space a block takes up, estimated: blocks only store their width, so
// the height comes from what's in them — lines of text, a drawing's points,
// or an image's proportions (`imageHeight`, measured by boxesOf).
export function boxOf(block: RestorePayload, imageHeight?: number): Box {
  let width = block.width;
  let height: number;
  if (block.type === "draw") {
    height = Math.max(1, ...parsePoints(block.content).map((p) => p.y));
  } else if (block.type === "image") {
    height = imageHeight ?? block.width;
  } else {
    const font = block.fontSize ?? FONT_SIZE;
    const lines = block.content.split("\n");
    const longest = Math.max(...lines.map((l) => l.length));
    width = Math.max(width, block.wrapWidth ?? longest * font * CHAR_WIDTH) + TEXT_PADDING;
    height = lines.length * LINE_HEIGHT * (font / FONT_SIZE) + TEXT_PADDING;
  }
  return { left: block.x, top: block.y, right: block.x + width, bottom: block.y + height };
}

function parsePoints(content: string): { x: number; y: number }[] {
  try {
    const points = JSON.parse(content);
    return Array.isArray(points) ? points.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)) : [];
  } catch {
    return [];
  }
}

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// How far to move the incoming group: nowhere if no block of it overlaps an
// existing one, otherwise to just right of everything already there.
export function clearOffset(incoming: Box[], existing: Box[]): { dx: number; dy: number } {
  const collides = incoming.some((a) => existing.some((b) => overlaps(a, b)));
  if (!collides) return { dx: 0, dy: 0 };
  const existingRight = Math.max(...existing.map((b) => b.right));
  const incomingLeft = Math.min(...incoming.map((b) => b.left));
  return { dx: existingRight + PLACEMENT_GAP - incomingLeft, dy: 0 };
}

// boxOf for each block, with images measured by decoding them (an image
// that won't decode counts as square).
export async function boxesOf(blocks: RestorePayload[]): Promise<Box[]> {
  return Promise.all(
    blocks.map(async (b) => (b.type === "image" ? boxOf(b, await imageHeight(b)) : boxOf(b))),
  );
}

async function imageHeight(block: RestorePayload): Promise<number | undefined> {
  try {
    const bitmap = await createImageBitmap(await (await fetch(block.content)).blob());
    const height = (block.width * bitmap.height) / bitmap.width;
    bitmap.close();
    return height;
  } catch {
    return undefined;
  }
}

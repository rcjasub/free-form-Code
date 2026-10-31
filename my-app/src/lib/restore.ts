import type { CanvasNode } from "../hooks/useCanvasHistory";

// What POST /blocks/restore takes for each block (see restoreBlocksSchema in
// the backend): everything needed to put it back in one go.
export interface RestorePayload {
  type: string;
  content: string;
  x: number;
  y: number;
  width: number;
  language: string;
  link: string | null;
  wrapWidth: number | null;
  fontSize: number | null;
  // where it sat in the stack (undoing a delete, uploading a browser
  // canvas); without one the server puts it on top
  zIndex?: number;
  // its id in this browser, when uploading a browser canvas: the server
  // skips one it already has, so a retried upload can't duplicate it
  clientId?: string;
}

// Must match the backend's MAX_RESTORE_BLOCKS and stay under the 3mb body
// limit on block routes (server.ts), with room for the JSON around it.
export const MAX_RESTORE_BLOCKS = 200;
export const MAX_RESTORE_BYTES = 2_500_000;

export function toRestorePayload(node: CanvasNode): RestorePayload {
  const type = node.type === "draw" || node.type === "image" ? node.type : "code";
  return {
    type,
    content: node.content,
    x: node.x,
    y: node.y,
    width: type === "draw" ? Math.max(...(node.points ?? []).map((p) => p.x), 1) : node.width ?? 300,
    language: node.language ?? "javascript",
    link: node.link ?? null,
    wrapWidth: node.wrapWidth ?? null,
    fontSize: node.fontSize ?? null,
    zIndex: node.zIndex,
  };
}

// Splits blocks into requests the restore route will accept: at most
// MAX_RESTORE_BLOCKS each and roughly MAX_RESTORE_BYTES of JSON. A single
// block bigger than that (a huge image) still gets a request of its own.
export function chunkForRestore(blocks: RestorePayload[]): RestorePayload[][] {
  const chunks: RestorePayload[][] = [];
  let current: RestorePayload[] = [];
  let bytes = 0;
  for (const block of blocks) {
    const size = JSON.stringify(block).length;
    if (current.length && (current.length >= MAX_RESTORE_BLOCKS || bytes + size > MAX_RESTORE_BYTES)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(block);
    bytes += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

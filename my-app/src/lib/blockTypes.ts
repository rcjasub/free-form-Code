import type { CanvasNode } from "../hooks/useCanvasHistory";

// Every block type the server stores (backend BLOCK_TYPES in
// schemas/block.schema.ts). "shape" and "arrow" are the diagram primitives;
// like "draw", they keep their geometry and styling as JSON in `content`.
export const BLOCK_TYPES = ["text", "code", "draw", "image", "shape", "arrow"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

// Types whose content is data, not something the user typed — sent as-is when
// a block is saved again. Text and code nodes carry no `type` on the canvas
// (their language tells them apart), so they're saved as "code".
const DATA_TYPES = new Set<string>(["draw", "image", "shape", "arrow"]);

export function storedType(node: Pick<CanvasNode, "type">): BlockType {
  return node.type && DATA_TYPES.has(node.type) ? (node.type as BlockType) : "code";
}

export function isDataBlock(node: Pick<CanvasNode, "type">) {
  return !!node.type && DATA_TYPES.has(node.type);
}

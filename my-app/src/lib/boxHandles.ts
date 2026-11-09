// Resize handles shared by drawings and diagram shapes.

// See FloatingNode.tsx for why dragging is throttled this way.
export const DRAG_SYNC_INTERVAL_MS = 40;

// Resize handles, like Excalidraw's: a dot on each corner stretches both
// ways; each edge of the selection box can be grabbed anywhere along its line
// to stretch one way. fx/fy place each on the box (0 = left/top, 1 = right/bottom).
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const HANDLES: { handle: Handle; fx: number; fy: number; cursor: string }[] = [
  { handle: "nw", fx: 0, fy: 0, cursor: "nwse-resize" },
  { handle: "n", fx: 0.5, fy: 0, cursor: "ns-resize" },
  { handle: "ne", fx: 1, fy: 0, cursor: "nesw-resize" },
  { handle: "e", fx: 1, fy: 0.5, cursor: "ew-resize" },
  { handle: "se", fx: 1, fy: 1, cursor: "nwse-resize" },
  { handle: "s", fx: 0.5, fy: 1, cursor: "ns-resize" },
  { handle: "sw", fx: 0, fy: 1, cursor: "nesw-resize" },
  { handle: "w", fx: 0, fy: 0.5, cursor: "ew-resize" },
];
export const BOX_PAD = 6; // matches the selection outline's offset
export const HANDLE_SIZE = 8;

// A length that stays the same size on screen at any zoom: the canvas layer
// sets --inv-zoom to 1 / its scale, so zoomed far out, selection outlines and
// handles don't shrink to hairlines (and zoomed in, they don't balloon).
export const screenPx = (px: number) => `calc(${px}px * var(--inv-zoom, 1))`;
export const SELECTION_OUTLINE = `${screenPx(1.5)} dashed #4fb4f2`;

// Where a handle goes: `at` (canvas px) is its center, `size` is in screen px.
export const handleEdge = (at: number, size: number) => `calc(${at}px - ${screenPx(size / 2)})`;

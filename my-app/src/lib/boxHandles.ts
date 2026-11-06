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

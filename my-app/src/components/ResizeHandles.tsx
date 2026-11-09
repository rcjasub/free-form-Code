import { BOX_PAD, type ResizeHandle } from "../lib/resize";
import { handleEdge, screenPx } from "../lib/boxHandles";

// Sized like DrawingNode's handles, on the dashed selection outline's edge.
const HANDLE_SIZE = 8;

const CORNERS = [
  { handle: "nw", cursor: "nwse-resize" },
  { handle: "ne", cursor: "nesw-resize" },
  { handle: "sw", cursor: "nesw-resize" },
  { handle: "se", cursor: "nwse-resize" },
] as const;

interface Props {
  isDark: boolean;
  onPointerDown: (e: React.PointerEvent, handle: ResizeHandle) => void;
}

// A text box's resize handles (see lib/resize): an invisible strip along the
// left and right edges of the selection box, and a dot on each corner.
export default function ResizeHandles({ isDark, onPointerDown }: Props) {
  return (
    <>
      {(["left", "right"] as const).map((side) => (
        <div
          key={side}
          title="Drag to change where lines wrap"
          className="node-handle absolute z-20 cursor-ew-resize"
          style={{ [side]: handleEdge(-BOX_PAD, HANDLE_SIZE), top: -BOX_PAD, bottom: -BOX_PAD, width: screenPx(HANDLE_SIZE) }}
          onPointerDown={(e) => onPointerDown(e, side)}
        />
      ))}
      {CORNERS.map(({ handle, cursor }) => (
        <div
          key={handle}
          title="Drag to resize the text"
          className="node-handle absolute rounded-sm border z-20"
          style={{
            // the same size on screen at any zoom (see screenPx)
            [handle.includes("w") ? "left" : "right"]: handleEdge(-BOX_PAD, HANDLE_SIZE),
            [handle.includes("n") ? "top" : "bottom"]: handleEdge(-BOX_PAD, HANDLE_SIZE),
            width: screenPx(HANDLE_SIZE),
            height: screenPx(HANDLE_SIZE),
            borderWidth: screenPx(1),
            background: isDark ? "#121212" : "#ffffff",
            borderColor: "#4fb4f2",
            cursor,
          }}
          onPointerDown={(e) => onPointerDown(e, handle)}
        />
      ))}
    </>
  );
}

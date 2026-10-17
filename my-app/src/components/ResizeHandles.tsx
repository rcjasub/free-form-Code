import { BOX_PAD, type ResizeHandle } from "../lib/resize";

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
          className="absolute z-20 cursor-ew-resize"
          style={{ [side]: -BOX_PAD - HANDLE_SIZE / 2, top: -BOX_PAD, bottom: -BOX_PAD, width: HANDLE_SIZE }}
          onPointerDown={(e) => onPointerDown(e, side)}
        />
      ))}
      {CORNERS.map(({ handle, cursor }) => (
        <div
          key={handle}
          title="Drag to resize the text"
          className="absolute rounded-sm border z-20"
          style={{
            [handle.includes("w") ? "left" : "right"]: -BOX_PAD - HANDLE_SIZE / 2,
            [handle.includes("n") ? "top" : "bottom"]: -BOX_PAD - HANDLE_SIZE / 2,
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
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

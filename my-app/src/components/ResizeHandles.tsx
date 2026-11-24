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

// The "fit" line beside a wrapped box's right side, in screen px: a short
// faint line FIT_GAP outside the dashed outline, with a grab area a little
// bigger than it.
const FIT_GAP = 12;
const FIT_LENGTH = 16;
const FIT_HIT_WIDTH = 10;
const FIT_HIT_HEIGHT = FIT_LENGTH + 2;

interface Props {
  isDark: boolean;
  onPointerDown: (e: React.PointerEvent, handle: ResizeHandle) => void;
  // Given when the box wraps at a set width: shows the fit line, and
  // clicking it ends the wrap, so the box fits its text again.
  onFit?: () => void;
}

// A text box's resize handles (see lib/resize): a dot on each corner, and
// the left and right edges of the selection box, which can be grabbed
// anywhere along their line to change where the text wraps. They're not
// drawn: the cursor shows them. Once the text wraps, a faint line beside the
// right side undoes it.
export default function ResizeHandles({ isDark, onPointerDown, onFit }: Props) {
  return (
    <>
      {(["left", "right"] as const).map((side) => (
        <div
          key={side}
          data-side={side}
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
      {onFit && (
        <div
          data-fit
          title="Click to stop wrapping and fit the text"
          className="node-handle absolute z-20 cursor-pointer"
          style={{
            right: `calc(${-BOX_PAD}px - ${screenPx(FIT_GAP + FIT_HIT_WIDTH / 2)})`,
            top: "50%",
            transform: "translateY(-50%)",
            width: screenPx(FIT_HIT_WIDTH),
            // shorter on a box too short for it, staying within its sides
            height: `min(${screenPx(FIT_HIT_HEIGHT)}, 80%)`,
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            // not a drag of the box, and not a click on the canvas
            e.stopPropagation();
            e.preventDefault();
            onFit();
          }}
        >
          <div
            className="pointer-events-none absolute left-1/2 rounded-full"
            style={{
              top: `calc((100% - min(${screenPx(FIT_LENGTH)}, 100%)) / 2)`,
              height: `min(${screenPx(FIT_LENGTH)}, 100%)`,
              width: screenPx(1.5),
              transform: "translateX(-50%)",
              background: "#4fb4f2",
              opacity: 0.5,
            }}
          />
        </div>
      )}
    </>
  );
}

import { useEffect, useState } from "react";
import { HANDLE_SIZE, HANDLES } from "../lib/boxHandles";
import type { Box } from "../hooks/useGroupResize";

// The box around a multi-selection: a handle on each corner scales
// everything in it together, and each side can be grabbed anywhere along its
// line to stretch it all one way (see useGroupResize). It sits on the
// canvas layer, in canvas coordinates, and is measured from the selected
// blocks as drawn, every frame, so it keeps up while they move or resize.

const CORNERS = HANDLES.filter((h) => h.fx !== 0.5 && h.fy !== 0.5);
const SIDES = HANDLES.filter((h) => h.fx === 0.5 || h.fy === 0.5);
// a little outside the blocks' own dashed outlines (outlineOffset 6)
const PAD = 10;
const BLUE = "#4fb4f2";

function measure(ids: string[], toCanvas: (x: number, y: number) => { x: number; y: number }): Box | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const id of ids) {
    const el = document.querySelector(`[data-node-id="${CSS.escape(id)}"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  if (!Number.isFinite(left)) return null;
  const a = toCanvas(left, top);
  const b = toCanvas(right, bottom);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

const same = (a: Box | null, b: Box | null) =>
  !!a && !!b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;

export default function SelectionBox({
  ids,
  scale,
  toCanvas,
  onResizeStart,
}: {
  ids: string[];
  scale: number;
  toCanvas: (x: number, y: number) => { x: number; y: number };
  onResizeStart: (e: React.PointerEvent, corner: { fx: number; fy: number }, box: Box, ids: string[]) => void;
}) {
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const next = measure(ids, toCanvas);
      setBox((prev) => (same(prev, next) ? prev : next));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ids, toCanvas]);

  if (!box) return null;
  // the outline and handles stay the same size on screen at any zoom
  const px = 1 / scale;
  const pad = PAD * px;
  const handle = HANDLE_SIZE * px;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: box.x - pad,
        top: box.y - pad,
        width: box.w + pad * 2,
        height: box.h + pad * 2,
        border: `${px}px dashed ${BLUE}`,
        borderRadius: 4 * px,
        zIndex: 9000,
      }}
    >
      {/* the sides: an invisible strip along each line (under the corners) */}
      {SIDES.map((c) => (
        <div
          key={c.handle}
          title="Drag to stretch everything selected"
          className="pointer-events-auto absolute"
          style={
            c.fx === 0.5
              ? { left: 0, right: 0, top: `calc(${c.fy * 100}% - ${handle / 2}px)`, height: handle, cursor: c.cursor }
              : { top: 0, bottom: 0, left: `calc(${c.fx * 100}% - ${handle / 2}px)`, width: handle, cursor: c.cursor }
          }
          onPointerDown={(e) => onResizeStart(e, { fx: c.fx, fy: c.fy }, box, ids)}
          onMouseDown={(e) => e.stopPropagation()}
        />
      ))}
      {CORNERS.map((c) => (
        <div
          key={c.handle}
          title="Drag to resize everything selected"
          className="pointer-events-auto absolute bg-white"
          style={{
            left: `calc(${c.fx * 100}% - ${handle / 2}px)`,
            top: `calc(${c.fy * 100}% - ${handle / 2}px)`,
            width: handle,
            height: handle,
            border: `${px}px solid ${BLUE}`,
            borderRadius: 2 * px,
            cursor: c.cursor,
          }}
          onPointerDown={(e) => onResizeStart(e, { fx: c.fx, fy: c.fy }, box, ids)}
          onMouseDown={(e) => e.stopPropagation()}
        />
      ))}
    </div>
  );
}

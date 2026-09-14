import { useRef } from "react";
import React from "react";
import type { Mode } from "../App";
import { strokePath } from "../lib/smoothPath";

export interface Point {
  x: number;
  y: number;
}

interface Props {
  id: string;
  x: number;
  y: number;
  points: Point[];
  onMove: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
  onMarkErase: (id: string) => void;
  pendingErase: boolean;
  mode: Mode;
  isMouseDown: React.RefObject<boolean>;
  isDark: boolean;
}

// Renders a saved freehand stroke. Points are stored relative to (x, y) —
// the block's own bounding-box origin — so moving the block only ever
// updates x/y, the same as every other block type.
export default React.memo(function DrawingNode({
  id,
  x,
  y,
  points,
  onMove,
  onDelete,
  onMarkErase,
  pendingErase,
  mode,
  isMouseDown,
  isDark,
}: Props) {
  const xRef = useRef(x);
  const yRef = useRef(y);
  const onMoveRef = useRef(onMove);
  xRef.current = x;
  yRef.current = y;
  onMoveRef.current = onMove;

  const width = Math.max(...points.map((p) => p.x), 1);
  const height = Math.max(...points.map((p) => p.y), 1);
  const pathData = strokePath(points);

  function handleDragMouseDown(e: React.MouseEvent) {
    const startX = e.clientX;
    const startY = e.clientY;
    const offset = { x: startX - xRef.current, y: startY - yRef.current };

    function onMouseMove(mv: MouseEvent) {
      onMoveRef.current(id, mv.clientX - offset.x, mv.clientY - offset.y);
    }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      data-node-id={id}
      className="absolute group outline-none"
      style={{
        left: x,
        top: y,
        width,
        height,
        opacity: pendingErase ? 0.3 : 1,
        transition: "opacity 0.15s",
        // In draw mode this bounding box shouldn't intercept clicks — it's
        // usually much bigger than the visible stroke (e.g. a diagonal
        // line's box is a full rectangle), so without this a new stroke
        // starting anywhere inside a previous one's box would silently die
        // here instead of reaching the canvas below.
        pointerEvents: mode === "draw" ? "none" : undefined,
      }}
      onMouseDown={(e) => {
        if (mode === "erase") {
          e.stopPropagation();
          onMarkErase(id);
          return;
        }
        if (mode !== "hand") e.stopPropagation();
        if (mode === "select") handleDragMouseDown(e);
      }}
      onMouseEnter={() => {
        if (mode === "erase" && isMouseDown.current) onMarkErase(id);
      }}
    >
      {mode === "hand" && <div className="absolute inset-0 z-10 cursor-grab" />}

      {/* delete button */}
      <div
        className="absolute -right-5 top-1 opacity-0 group-hover:opacity-40 hover:opacity-100 cursor-pointer text-xs transition-opacity z-20 text-gray-400"
        onClick={() => onDelete(id)}
      >
        ✕
      </div>

      <svg
        width={width}
        height={height}
        style={{ overflow: "visible", cursor: mode === "select" ? "grab" : undefined }}
      >
        <path
          d={pathData}
          fill="none"
          stroke={isDark ? "#f5f5f5" : "#1f2937"}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
});

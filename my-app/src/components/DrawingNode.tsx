import { useRef } from "react";
import React from "react";
import type { Mode } from "../App";
import { strokePath } from "../lib/smoothPath";

export interface Point {
  x: number;
  y: number;
}

// See FloatingNode.tsx for why dragging is throttled this way.
const DRAG_SYNC_INTERVAL_MS = 40;

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
  const containerRef = useRef<HTMLDivElement>(null);
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
    let lastSync = 0;
    let latest = { x: xRef.current, y: yRef.current };

    function onMouseMove(mv: MouseEvent) {
      latest = { x: mv.clientX - offset.x, y: mv.clientY - offset.y };
      if (containerRef.current) {
        containerRef.current.style.left = `${latest.x}px`;
        containerRef.current.style.top = `${latest.y}px`;
      }

      const now = performance.now();
      if (now - lastSync >= DRAG_SYNC_INTERVAL_MS) {
        lastSync = now;
        onMoveRef.current(id, latest.x, latest.y);
      }
    }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      onMoveRef.current(id, latest.x, latest.y);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handlePathMouseDown(e: React.MouseEvent) {
    if (mode === "erase") {
      e.stopPropagation();
      onMarkErase(id);
      return;
    }
    if (mode !== "hand") e.stopPropagation();
    if (mode === "select") handleDragMouseDown(e);
  }

  function handlePathMouseEnter() {
    if (mode === "erase" && isMouseDown.current) onMarkErase(id);
  }

  return (
    <div
      ref={containerRef}
      data-node-id={id}
      className="absolute group outline-none"
      style={{
        left: x,
        top: y,
        width,
        height,
        opacity: pendingErase ? 0.3 : 1,
        transition: "opacity 0.15s",
        // The bounding box is usually much bigger than the visible stroke
        // (e.g. a diagonal line's box is a full rectangle). If this div were
        // hit-testable across that whole box, hovering the "empty" corner of
        // one drawing's box in erase/select mode would swallow the pointer
        // event before it could ever reach whatever's actually underneath —
        // including a neighboring node sitting in that same dead space.
        // Only the stroke's own hit-path below (sized to the ink, not the
        // box) should be hit-testable.
        pointerEvents: "none",
      }}
    >
      {mode === "hand" && <div className="absolute inset-0 z-10 cursor-grab" style={{ pointerEvents: "auto" }} />}

      {/* delete button */}
      <div
        className="absolute -right-5 top-1 opacity-0 group-hover:opacity-40 hover:opacity-100 cursor-pointer text-xs transition-opacity z-20 text-gray-400"
        style={{ pointerEvents: "auto" }}
        onClick={() => onDelete(id)}
      >
        ✕
      </div>

      <svg
        width={width}
        height={height}
        style={{ overflow: "visible" }}
      >
        {/* Invisible, wide copy of the stroke used purely for hit-testing —
            keeps clicks/hover/erase scoped to "near the line" instead of
            "anywhere in its bounding rectangle." */}
        {mode !== "draw" && (
          <path
            d={pathData}
            fill="none"
            stroke="transparent"
            strokeWidth={16}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: "stroke", cursor: mode === "select" ? "grab" : undefined }}
            onMouseDown={handlePathMouseDown}
            onMouseEnter={handlePathMouseEnter}
          />
        )}
        <path
          d={pathData}
          fill="none"
          stroke={isDark ? "#f5f5f5" : "#1f2937"}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
      </svg>
    </div>
  );
});

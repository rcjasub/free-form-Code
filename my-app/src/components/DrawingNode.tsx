import { useRef, useState } from "react";
import React from "react";
import type { Mode } from "../App";
import { strokePath } from "../lib/smoothPath";
import LinkBadge from "./LinkBadge";

export interface Point {
  x: number;
  y: number;
}

// See FloatingNode.tsx for why dragging is throttled this way.
const DRAG_SYNC_INTERVAL_MS = 40;

// Resize handles: four corners stretch both ways, four edges stretch one way.
// fx/fy place each handle on the selection box (0 = left/top, 1 = right/bottom).
type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: { handle: Handle; fx: number; fy: number; cursor: string }[] = [
  { handle: "nw", fx: 0, fy: 0, cursor: "nwse-resize" },
  { handle: "n", fx: 0.5, fy: 0, cursor: "ns-resize" },
  { handle: "ne", fx: 1, fy: 0, cursor: "nesw-resize" },
  { handle: "e", fx: 1, fy: 0.5, cursor: "ew-resize" },
  { handle: "se", fx: 1, fy: 1, cursor: "nwse-resize" },
  { handle: "s", fx: 0.5, fy: 1, cursor: "ns-resize" },
  { handle: "sw", fx: 0, fy: 1, cursor: "nesw-resize" },
  { handle: "w", fx: 0, fy: 0.5, cursor: "ew-resize" },
];
const MIN_SIZE = 4; // a drawing can't be squashed smaller than this
const BOX_PAD = 6; // matches the selection outline's offset
const HANDLE_SIZE = 8;

// two decimals is plenty, and keeps the saved JSON from bloating
const round = (n: number) => Math.round(n * 100) / 100;

interface Props {
  id: string;
  x: number;
  y: number;
  points: Point[];
  onMove: (id: string, x: number, y: number) => void;
  onMarkErase: (id: string) => void;
  // Called while a resize handle is dragged (throttled) and once more with
  // done=true on release. Omitted for viewers who can't edit.
  onResize?: (id: string, x: number, y: number, points: Point[], done: boolean) => void;
  pendingErase: boolean;
  link?: string | null;
  // clicked last — Ctrl+C copies this block
  selected?: boolean;
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
  onMarkErase,
  onResize,
  pendingErase,
  link,
  selected,
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

  // While a handle is being dragged, the drawing renders from this local
  // preview every frame; the page only hears about it at the throttled rate.
  const [preview, setPreview] = useState<{ x: number; y: number; points: Point[] } | null>(null);
  const shown = preview ?? { x, y, points };

  const width = Math.max(...shown.points.map((p) => p.x), 1);
  const height = Math.max(...shown.points.map((p) => p.y), 1);
  const pathData = strokePath(shown.points);

  function handleResizeMouseDown(e: React.MouseEvent, handle: Handle) {
    e.stopPropagation();
    e.preventDefault();
    if (!onResize || !containerRef.current) return;
    const resize = onResize;
    const startClient = { x: e.clientX, y: e.clientY };
    const start = { x, y, points, width, height };
    // Screen pixels per canvas unit, read off the rendered box, so the edge
    // follows the mouse exactly at any zoom level.
    const zoom = containerRef.current.getBoundingClientRect().width / width || 1;
    let latest: { x: number; y: number; points: Point[] } | null = null;
    let lastSync = 0;

    function onMouseMove(mv: MouseEvent) {
      const dx = (mv.clientX - startClient.x) / zoom;
      const dy = (mv.clientY - startClient.y) / zoom;

      // Dragging an east/south edge grows the box; west/north grows it the
      // other way, so those subtract the mouse movement.
      let w = start.width + (handle.includes("e") ? dx : handle.includes("w") ? -dx : 0);
      let h = start.height + (handle.includes("s") ? dy : handle.includes("n") ? -dy : 0);
      w = Math.max(w, MIN_SIZE);
      h = Math.max(h, MIN_SIZE);
      // Shift on a corner keeps the drawing's proportions.
      if (mv.shiftKey && handle.length === 2) {
        const f = Math.max(w / start.width, h / start.height);
        w = start.width * f;
        h = start.height * f;
      }

      // Points are relative to the top-left corner, so growing to the
      // west/north moves that corner and scales the points from there.
      const sx = w / start.width;
      const sy = h / start.height;
      latest = {
        x: round(start.x + (handle.includes("w") ? start.width - w : 0)),
        y: round(start.y + (handle.includes("n") ? start.height - h : 0)),
        points: start.points.map((p) => ({ x: round(p.x * sx), y: round(p.y * sy) })),
      };
      setPreview(latest);

      const now = performance.now();
      if (now - lastSync >= DRAG_SYNC_INTERVAL_MS) {
        lastSync = now;
        resize(id, latest.x, latest.y, latest.points, false);
      }
    }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (latest) resize(id, latest.x, latest.y, latest.points, true);
      setPreview(null);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

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
        left: shown.x,
        top: shown.y,
        width,
        height,
        opacity: pendingErase ? 0.3 : 1,
        outline: selected ? "1.5px dashed #4fb4f2" : undefined,
        outlineOffset: 6,
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

      {link && <LinkBadge link={link} isDark={isDark} />}

      {selected && mode === "select" && onResize &&
        HANDLES.map(({ handle, fx, fy, cursor }) => (
          <div
            key={handle}
            onMouseDown={(e) => handleResizeMouseDown(e, handle)}
            className="absolute rounded-sm border"
            style={{
              left: -BOX_PAD + fx * (width + 2 * BOX_PAD) - HANDLE_SIZE / 2,
              top: -BOX_PAD + fy * (height + 2 * BOX_PAD) - HANDLE_SIZE / 2,
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              background: isDark ? "#121212" : "#ffffff",
              borderColor: "#4fb4f2",
              cursor,
              pointerEvents: "auto", // the container itself ignores the mouse
            }}
          />
        ))}
    </div>
  );
});

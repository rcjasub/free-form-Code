import { useRef, useState, useLayoutEffect } from "react";
import { SELECTION_OUTLINE } from "../lib/boxHandles";
import { dragFrom, zoomOf } from "../lib/dragMath";
import React from "react";
import type { Mode } from "../App";
import { strokePath } from "../lib/smoothPath";
import LinkBadge from "./LinkBadge";
import { GLIDE_TRANSITION, pauseGlide, resumeGlide } from "../lib/glide";
import type { DrawIn } from "../hooks/useSnapGhosts";
import { BOX_PAD, DRAG_SYNC_INTERVAL_MS, HANDLES, HANDLE_SIZE, handleEdge, screenPx, type Handle } from "../lib/boxHandles";
import { drawStrokeProps, type DrawStyle } from "../lib/points";

export interface Point {
  x: number;
  y: number;
}

const MIN_SIZE = 4; // a drawing can't be squashed smaller than this

// two decimals is plenty, and keeps the saved JSON from bloating
const round = (n: number) => Math.round(n * 100) / 100;

interface Props {
  id: string;
  x: number;
  y: number;
  points: Point[];
  // color, width, dashes and opacity (lib/points)
  drawStyle: DrawStyle;
  onMove: (id: string, x: number, y: number) => void;
  // every frame of a drag of this block, and once more (done) when it's let
  // go: lets the rest of a multi-selection move in step with it
  onDragFrame?: (id: string, x: number, y: number, done?: boolean) => void;
  onMarkErase: (id: string) => void;
  // Called while a resize handle is dragged (throttled) and once more with
  // done=true on release. Omitted for viewers who can't edit.
  onResize?: (id: string, x: number, y: number, points: Point[], done: boolean) => void;
  pendingErase: boolean;
  link?: string | null;
  // clicked last — Ctrl+C copies this block
  selected?: boolean;
  // just drawn with shape snapping on: animates in (see useSnapGhosts)
  drawIn?: DrawIn;
  mode: Mode;
  isMouseDown: React.RefObject<boolean>;
  isDark: boolean;
  // stacking depth among blocks, from useStackOrder
  zIndex: number;
}

// Renders a saved freehand stroke. Points are stored relative to (x, y) —
// the block's own bounding-box origin — so moving the block only ever
// updates x/y, the same as every other block type.
export default React.memo(function DrawingNode({
  id,
  x,
  y,
  points,
  drawStyle,
  onMove,
  onDragFrame,
  onMarkErase,
  onResize,
  pendingErase,
  link,
  selected,
  drawIn,
  mode,
  isMouseDown,
  isDark,
  zIndex,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xRef = useRef(x);
  const yRef = useRef(y);
  const onMoveRef = useRef(onMove);
  const onDragFrameRef = useRef(onDragFrame);
  xRef.current = x;
  yRef.current = y;
  onMoveRef.current = onMove;
  useLayoutEffect(() => {
    onDragFrameRef.current = onDragFrame;
  });

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
    pauseGlide(containerRef.current);

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
      resumeGlide(containerRef.current);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handleDragMouseDown(e: React.MouseEvent) {
    const startX = e.clientX;
    const startY = e.clientY;
    const drag = dragFrom({ x: xRef.current, y: yRef.current }, { x: startX, y: startY }, zoomOf(containerRef.current));
    let lastSync = 0;
    let latest = { x: xRef.current, y: yRef.current };
    pauseGlide(containerRef.current);

    function onMouseMove(mv: MouseEvent) {
      latest = drag(mv);
      onDragFrameRef.current?.(id, latest.x, latest.y);
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
      onDragFrameRef.current?.(id, latest.x, latest.y, true);
      resumeGlide(containerRef.current);
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
    // text mode can drag too, in case clicking just to move things feels off
    if (mode === "select" || mode === "text") handleDragMouseDown(e);
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
        zIndex,
        opacity: (pendingErase ? 0.3 : 1) * (drawStyle.opacity / 100),
        outline: selected ? SELECTION_OUTLINE : undefined,
        outlineOffset: 6,
        transition: GLIDE_TRANSITION, // see lib/glide
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

      {/* Once selected, the whole selection box moves the drawing, not just
          the stroke (like Excalidraw). Unselected, only the stroke is
          hit-testable — see pointerEvents above. Sits under the stroke's
          hit-path and the resize handles. */}
      {selected && (mode === "select" || mode === "text") && (
        <div
          className="absolute cursor-grab active:cursor-grabbing"
          style={{ inset: -BOX_PAD, pointerEvents: "auto" }}
          onMouseDown={handlePathMouseDown}
        />
      )}

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
            strokeWidth={Math.max(16, drawStyle.strokeWidth + 12)}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: "stroke", cursor: mode === "select" || mode === "text" ? "grab" : undefined }}
            onMouseDown={handlePathMouseDown}
            onMouseEnter={handlePathMouseEnter}
          />
        )}
        <path
          d={pathData}
          // pathLength=1 lets the trace animation draw it as 0 → 1
          pathLength={drawIn === "trace" ? 1 : undefined}
          className={drawIn === "trace" ? "snap-draw" : drawIn === "brighten" ? "snap-brighten" : undefined}
          fill="none"
          {...drawStrokeProps(drawStyle, isDark)}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
      </svg>

      {link && <LinkBadge link={link} isDark={isDark} />}

      {selected && (mode === "select" || mode === "text") && onResize &&
        HANDLES.map(({ handle, fx, fy, cursor }) => {
          const boxW = width + 2 * BOX_PAD;
          const boxH = height + 2 * BOX_PAD;
          const corner = handle.length === 2;
          return (
            <div
              key={handle}
              onMouseDown={(e) => handleResizeMouseDown(e, handle)}
              // corners: a visible dot; edges: an invisible strip along the line
              className={corner ? "node-handle absolute rounded-sm border z-10" : "node-handle absolute"}
              style={{
                // centered on the outline, the same size on screen at any zoom
                left: handleEdge(-BOX_PAD + (fx === 0.5 ? 0 : fx * boxW), HANDLE_SIZE),
                top: handleEdge(-BOX_PAD + (fy === 0.5 ? 0 : fy * boxH), HANDLE_SIZE),
                // an edge strip runs the whole side; a corner dot is a small square
                width: corner || fx !== 0.5 ? screenPx(HANDLE_SIZE) : `calc(${boxW}px + ${screenPx(HANDLE_SIZE)})`,
                height: corner || fy !== 0.5 ? screenPx(HANDLE_SIZE) : `calc(${boxH}px + ${screenPx(HANDLE_SIZE)})`,
                background: corner ? (isDark ? "#121212" : "#ffffff") : undefined,
                borderColor: corner ? "#4fb4f2" : undefined,
                borderWidth: corner ? screenPx(1) : undefined,
                cursor,
                pointerEvents: "auto", // the container itself ignores the mouse
              }}
            />
          );
        })}
    </div>
  );
});

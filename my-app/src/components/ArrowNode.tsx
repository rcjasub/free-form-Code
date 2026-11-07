import React, { useMemo, useRef, useState } from "react";
import { handleEdge, screenPx } from "../lib/boxHandles";
import { dragFrom, zoomOf } from "../lib/dragMath";
import type { Mode } from "../App";
import type { Point } from "./DrawingNode";
import LinkBadge from "./LinkBadge";
import { GLIDE_TRANSITION, pauseGlide, resumeGlide } from "../lib/glide";
import { DRAG_SYNC_INTERVAL_MS } from "../lib/boxHandles";
import { serializeArrow, type ArrowData } from "../lib/shapes";
import { themeColor } from "../lib/colors";
import { arrowPaint } from "../lib/roughPaths";
import { shapeIdAt } from "../hooks/useShapeTool";
import PaintPaths from "./PaintPaths";

const END_HANDLE = 10;

interface Props {
  id: string;
  x: number;
  y: number;
  // Already resolved by the page: an attached end has been moved onto the
  // border of its shape (lib/shapes resolveArrow).
  arrow: ArrowData;
  onMove: (id: string, x: number, y: number) => void;
  // every frame of a drag of this block, and once more (done) when it's let
  // go: lets the rest of a multi-selection move in step with it
  onDragFrame?: (id: string, x: number, y: number, done?: boolean) => void;
  onMarkErase: (id: string) => void;
  // dragging an end or editing the label; omitted for viewers who can't edit
  onReshape?: (id: string, x: number, y: number, content: string, done: boolean) => void;
  editing: boolean;
  onEditingChange?: (id: string, editing: boolean) => void;
  // while an end is dragged: the shape it would attach to (null: none)
  onBindTarget?: (shapeId: string | null) => void;
  isShape: (id: string) => boolean;
  pendingErase: boolean;
  link?: string | null;
  selected?: boolean;
  mode: Mode;
  isMouseDown: React.RefObject<boolean>;
  isDark: boolean;
  zIndex: number;
}

// A line from points[0] to the last point, with a head at the end. Points
// are relative to (x, y) and may be negative, so the box is fitted around
// them: the marquee and placement read it as the arrow's size. Selected, each
// end gets a handle: drag it onto a shape to attach it there, or off to
// detach it. Double-click to label it.
export default React.memo(function ArrowNode({
  id,
  x,
  y,
  arrow,
  onMove,
  onDragFrame,
  onMarkErase,
  onReshape,
  editing,
  onEditingChange,
  onBindTarget,
  isShape,
  pendingErase,
  link,
  selected,
  mode,
  isMouseDown,
  isDark,
  zIndex,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // an end being dragged: drawn from here until it's saved
  const [preview, setPreview] = useState<Point[] | null>(null);
  const pts = preview ?? arrow.points;
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const width = Math.max(Math.max(...pts.map((p) => p.x)) - minX, 1);
  const height = Math.max(Math.max(...pts.map((p) => p.y)) - minY, 1);
  const local = useMemo(() => pts.map((p) => ({ x: p.x - minX, y: p.y - minY })), [pts, minX, minY]);
  const paint = useMemo(() => arrowPaint(arrow, local, isDark), [arrow, local, isDark]);
  const straight = local.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  // an attached arrow is placed by its shapes; dragging it would just snap back
  const attached = !!(arrow.fromId || arrow.toId);
  const canInteract = mode === "select" || mode === "text";
  const last = pts.length - 1;

  const labelAt =
    pts.length === 2
      ? { x: (local[0].x + local[1].x) / 2, y: (local[0].y + local[1].y) / 2 }
      : local[Math.floor(last / 2)];

  function handleDragMouseDown(e: React.MouseEvent) {
    const drag = dragFrom({ x, y }, { x: e.clientX, y: e.clientY }, zoomOf(containerRef.current));
    let lastSync = 0;
    let latest = { x, y };
    pauseGlide(containerRef.current);
    function onMouseMove(mv: MouseEvent) {
      latest = drag(mv);
      onDragFrame?.(id, latest.x, latest.y);
      if (containerRef.current) {
        containerRef.current.style.left = `${latest.x + minX}px`;
        containerRef.current.style.top = `${latest.y + minY}px`;
      }
      const now = performance.now();
      if (now - lastSync >= DRAG_SYNC_INTERVAL_MS) {
        lastSync = now;
        onMove(id, latest.x, latest.y);
      }
    }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      onMove(id, latest.x, latest.y);
      onDragFrame?.(id, latest.x, latest.y, true);
      resumeGlide(containerRef.current);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  // Drags one end. Over a shape it attaches there (that shape lights up);
  // anywhere else it's left loose.
  function handleEndMouseDown(e: React.MouseEvent, end: "from" | "to") {
    e.stopPropagation();
    e.preventDefault();
    if (!onReshape || !containerRef.current) return;
    const reshape = onReshape;
    const index = end === "from" ? 0 : last;
    const other = end === "from" ? arrow.toId : arrow.fromId;
    // screen pixels per canvas unit, read off the rendered box along its
    // longer side (a flat arrow's box is 1px on the other)
    const rect = containerRef.current.getBoundingClientRect();
    const zoom = (width >= height ? rect.width / width : rect.height / height) || 1;
    const startClient = { x: e.clientX, y: e.clientY };
    const start = arrow.points;
    let target: string | null = null;
    let moved = start;

    function onMouseMove(mv: MouseEvent) {
      const p = start[index];
      moved = start.map((q, i) =>
        i === index ? { x: p.x + (mv.clientX - startClient.x) / zoom, y: p.y + (mv.clientY - startClient.y) / zoom } : q,
      );
      setPreview(moved);
      target = shapeIdAt(mv.clientX, mv.clientY, isShape, other) ?? null;
      onBindTarget?.(target);
    }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      onBindTarget?.(null);
      setPreview(null);
      if (moved === start) return; // a click, not a drag
      const next: ArrowData = { ...arrow, points: moved };
      if (end === "from") next.fromId = target ?? undefined;
      else next.toId = target ?? undefined;
      reshape(id, x, y, serializeArrow(next), true);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (mode === "erase") {
      e.stopPropagation();
      onMarkErase(id);
      return;
    }
    if (mode !== "hand") e.stopPropagation();
    if (canInteract && !attached) handleDragMouseDown(e);
  }

  function commitLabel(label: string) {
    onEditingChange?.(id, false);
    const trimmed = label.trim();
    if (trimmed !== (arrow.label ?? "")) {
      onReshape?.(id, x, y, serializeArrow({ ...arrow, label: trimmed || undefined }), true);
    }
  }

  const labelFont = arrow.roughness > 0 ? "font-canvas text-sm" : "font-mono text-xs";
  const background = isDark ? "#121212" : "#ffffff";

  return (
    <div
      ref={containerRef}
      data-node-id={id}
      className="absolute outline-none"
      style={{
        left: x + minX,
        top: y + minY,
        width,
        height,
        zIndex,
        opacity: (pendingErase ? 0.3 : 1) * (arrow.opacity / 100),
        transition: preview ? undefined : GLIDE_TRANSITION,
        // like a drawing, only the line itself is hit-testable (see DrawingNode)
        pointerEvents: "none",
      }}
    >
      <svg width={width} height={height} style={{ overflow: "visible" }}>
        {selected && (
          <path d={straight} fill="none" stroke="#4fb4f2" strokeOpacity={0.35} strokeWidth={arrow.strokeWidth + 8} strokeLinecap="round" />
        )}
        {mode !== "draw" && (
          <path
            d={straight}
            fill="none"
            stroke="transparent"
            strokeWidth={16}
            style={{ pointerEvents: "stroke", cursor: canInteract && !attached ? "grab" : undefined }}
            onMouseDown={handleMouseDown}
            onMouseEnter={() => mode === "erase" && isMouseDown.current && onMarkErase(id)}
            onDoubleClick={(e) => {
              if (!onReshape || !canInteract) return;
              e.stopPropagation();
              onEditingChange?.(id, true);
            }}
          />
        )}
        <PaintPaths paint={paint} />
      </svg>

      {editing ? (
        <input
          autoFocus
          defaultValue={arrow.label ?? ""}
          className={`absolute -translate-x-1/2 -translate-y-1/2 px-1 rounded text-center outline-none ${labelFont}`}
          style={{ left: labelAt.x, top: labelAt.y, width: 140, color: themeColor("auto", isDark), background, pointerEvents: "auto" }}
          onFocus={(e) => e.currentTarget.select()}
          onMouseDown={(e) => e.stopPropagation()}
          onBlur={(e) => commitLabel(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") {
              e.currentTarget.value = arrow.label ?? "";
              e.currentTarget.blur();
            }
          }}
        />
      ) : (
        arrow.label && (
          <div
            className={`absolute -translate-x-1/2 -translate-y-1/2 px-1 rounded whitespace-nowrap select-none ${labelFont}`}
            style={{ left: labelAt.x, top: labelAt.y, color: themeColor("auto", isDark), background }}
          >
            {arrow.label}
          </div>
        )
      )}

      {link && <LinkBadge link={link} isDark={isDark} />}

      {selected && canInteract && onReshape && !editing &&
        (["from", "to"] as const).map((end) => {
          const p = local[end === "from" ? 0 : last];
          return (
            <div
              key={end}
              title={end === "from" ? "Drag to move the start" : "Drag to move the end"}
              className="node-handle absolute rounded-full border-2 z-10 cursor-move"
              style={{
                // the same size on screen at any zoom (see screenPx)
                left: handleEdge(p.x, END_HANDLE),
                top: handleEdge(p.y, END_HANDLE),
                width: screenPx(END_HANDLE),
                height: screenPx(END_HANDLE),
                borderWidth: screenPx(2),
                borderColor: "#4fb4f2",
                background,
                pointerEvents: "auto",
              }}
              onMouseDown={(e) => handleEndMouseDown(e, end)}
            />
          );
        })}
    </div>
  );
});

import React, { useMemo, useRef, useState } from "react";
import { handleEdge, screenPx } from "../lib/boxHandles";
import { dragFrom, dragTravel, trackDrag, zoomOf } from "../lib/dragMath";
import type { Mode } from "../App";
import type { Point } from "./DrawingNode";
import LinkBadge from "./LinkBadge";
import LabelEditor from "./LabelEditor";
import { GLIDE_TRANSITION, pauseGlide, resumeGlide } from "../lib/glide";
import { DRAG_SYNC_INTERVAL_MS } from "../lib/boxHandles";
import { MAX_LABEL_LENGTH, resolveArrow, serializeArrow, shapeLabelSize, type ArrowData, type ShapeBox } from "../lib/shapes";
import { liveBox, useLiveKey } from "../lib/liveShapes";
import { themeColor } from "../lib/colors";
import { arrowPaint } from "../lib/roughPaths";
import { shapeIdAt } from "../hooks/useShapeTool";
import PaintPaths from "./PaintPaths";

const END_HANDLE = 10;
// an arrow's label wraps at this width
const LABEL_MAX_WIDTH = 240;

interface Props {
  id: string;
  x: number;
  y: number;
  // Already resolved by the page: an attached end has been moved onto the
  // border of its shape (lib/shapes resolveArrow).
  arrow: ArrowData;
  // The box each attached end sits on, as of the page's state. While one of
  // those shapes is dragged or resized, the arrow redraws from where it is
  // right now instead (lib/liveShapes), so it doesn't trail behind.
  bindBoxOf?: (id: string) => ShapeBox | null;
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

// The arrow redrawn from where its shapes are right now, while one of them is
// being dragged or resized (`live`: lib/liveShapes' key for them; "" when
// neither is). A plain function of its arguments, `live` included, so the
// React Compiler's memoizing can't hold on to an older result: it read the
// live boxes behind the compiler's back when this sat inside a useMemo.
function followLive(
  resolved: ArrowData,
  x: number,
  y: number,
  bindBoxOf: ((id: string) => ShapeBox | null) | undefined,
  live: string,
): ArrowData {
  if (!live || !bindBoxOf) return resolved;
  const boxes = new Map<string, ShapeBox>();
  for (const shapeId of [resolved.fromId, resolved.toId]) {
    if (!shapeId) continue;
    const base = bindBoxOf(shapeId);
    if (!base) continue;
    const now = liveBox(shapeId);
    if (!now) {
      boxes.set(shapeId, base);
      continue;
    }
    const w = now.w ?? base.w;
    const h = now.h ?? base.h;
    // a drawing's outline moves and scales with its box
    const outline = base.outline?.map((p) => ({
      x: now.x + ((p.x - base.x) * w) / (base.w || 1),
      y: now.y + ((p.y - base.y) * h) / (base.h || 1),
    }));
    boxes.set(shapeId, { ...base, x: now.x, y: now.y, w, h, ...(outline && { outline }) });
  }
  return resolveArrow(resolved, x, y, boxes);
}

// A line from points[0] to the last point, with a head at the end. Points
// are relative to (x, y) and may be negative, so the box is fitted around
// them: the marquee and placement read it as the arrow's size. Selected, each
// end gets a round handle: drag it onto a shape to attach it there, or off to
// detach it. Double-click (or Enter, or the text tool) to type its label,
// which sits on the middle of the line and hides the line behind it.
export default React.memo(function ArrowNode({
  id,
  x,
  y,
  arrow: resolved,
  bindBoxOf,
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

  // follows its shapes while they're dragged or resized, every frame
  const live = useLiveKey([resolved.fromId, resolved.toId]);
  const arrow = followLive(resolved, x, y, bindBoxOf, live);

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
      stopDrag();
      window.removeEventListener("mouseup", onMouseUp);
      onMove(id, latest.x, latest.y);
      onDragFrame?.(id, latest.x, latest.y, true);
      resumeGlide(containerRef.current);
    }
    const stopDrag = trackDrag(e.nativeEvent, onMouseMove);
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
    const travel = dragTravel({ x: e.clientX, y: e.clientY }, zoom);
    const start = arrow.points;
    let target: string | null = null;
    let moved = start;

    function onMouseMove(mv: MouseEvent) {
      const p = start[index];
      const { dx, dy } = travel(mv);
      moved = start.map((q, i) => (i === index ? { x: p.x + dx, y: p.y + dy } : q));
      setPreview(moved);
      target = shapeIdAt(mv.clientX, mv.clientY, isShape, other) ?? null;
      onBindTarget?.(target);
    }
    function onMouseUp() {
      stopDrag();
      window.removeEventListener("mouseup", onMouseUp);
      onBindTarget?.(null);
      setPreview(null);
      if (moved === start) return; // a click, not a drag
      const next: ArrowData = { ...arrow, points: moved };
      if (end === "from") next.fromId = target ?? undefined;
      else next.toId = target ?? undefined;
      reshape(id, x, y, serializeArrow(next), true);
    }
    const stopDrag = trackDrag(e.nativeEvent, onMouseMove);
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

  function startEditing(e: React.MouseEvent) {
    if (!onReshape || !canInteract) return;
    e.stopPropagation();
    onEditingChange?.(id, true);
  }

  function commitLabel(typed: string) {
    onEditingChange?.(id, false);
    const label = typed.trim().slice(0, MAX_LABEL_LENGTH);
    if (label !== (arrow.label ?? "")) {
      // the label is saved on the arrow as stored, not as resolved
      onReshape?.(id, x, y, serializeArrow({ ...resolved, label: label || undefined }), true);
    }
  }

  // Like a shape's: the stroke color, sized from the panel, in the font that
  // goes with the line style. Behind it, the canvas color hides the line.
  const labelStyle: React.CSSProperties = {
    left: labelAt.x,
    top: labelAt.y,
    maxWidth: LABEL_MAX_WIDTH,
    color: themeColor(arrow.stroke, isDark),
    background: isDark ? "#121212" : "#ffffff",
    fontSize: shapeLabelSize(arrow),
    lineHeight: 1.25,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    textAlign: "center",
    padding: "1px 4px",
  };
  const labelFont = arrow.roughness > 0 ? "font-canvas" : "font-mono";

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
        // other people's moves glide; following a shape that's being moved
        // here mustn't, or the arrow trails behind it
        transition: preview || live ? undefined : GLIDE_TRANSITION,
        // like a drawing, only the line itself is hit-testable (see DrawingNode)
        pointerEvents: "none",
      }}
    >
      <svg width={width} height={height} style={{ overflow: "visible" }}>
        {mode !== "draw" && (
          <path
            d={straight}
            fill="none"
            stroke="transparent"
            strokeWidth={16}
            style={{ pointerEvents: "stroke", cursor: canInteract && !attached ? "grab" : undefined }}
            onMouseDown={handleMouseDown}
            onMouseEnter={() => mode === "erase" && isMouseDown.current && onMarkErase(id)}
            onDoubleClick={startEditing}
          />
        )}
        <PaintPaths paint={paint} />
      </svg>

      {editing ? (
        <div
          className={`absolute -translate-x-1/2 -translate-y-1/2 ${labelFont}`}
          style={{ ...labelStyle, minWidth: 24, pointerEvents: "auto" }}
        >
          <LabelEditor initial={arrow.label ?? ""} onDone={commitLabel} />
        </div>
      ) : (
        arrow.label && (
          // clicking or dragging the label is clicking or dragging the arrow
          <div
            className={`absolute -translate-x-1/2 -translate-y-1/2 select-none ${labelFont}`}
            style={{
              ...labelStyle,
              pointerEvents: mode === "draw" ? "none" : "auto",
              cursor: canInteract && !attached ? "grab" : undefined,
            }}
            onMouseDown={handleMouseDown}
            onDoubleClick={startEditing}
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
              className="node-handle absolute rounded-full z-10 cursor-move"
              style={{
                // the same size on screen at any zoom (see screenPx)
                left: handleEdge(p.x, END_HANDLE),
                top: handleEdge(p.y, END_HANDLE),
                width: screenPx(END_HANDLE),
                height: screenPx(END_HANDLE),
                border: `${screenPx(1.5)} solid #4fb4f2`,
                background: isDark ? "#121212" : "#ffffff",
                pointerEvents: "auto",
              }}
              onMouseDown={(e) => handleEndMouseDown(e, end)}
            />
          );
        })}
    </div>
  );
});

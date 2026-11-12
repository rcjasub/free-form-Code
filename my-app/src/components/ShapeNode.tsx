import React, { useMemo, useRef, useState } from "react";
import LabelEditor from "./LabelEditor";
import type { DrawIn } from "../hooks/useSnapGhosts";
import { clearLive, setLive } from "../lib/liveShapes";
import { SELECTION_OUTLINE } from "../lib/boxHandles";
import { dragFrom, dragTravel, trackDrag, zoomOf } from "../lib/dragMath";
import type { Mode } from "../App";
import LinkBadge from "./LinkBadge";
import { GLIDE_TRANSITION, pauseGlide, resumeGlide } from "../lib/glide";
import { BOX_PAD, DRAG_SYNC_INTERVAL_MS, HANDLES, HANDLE_SIZE, handleEdge, screenPx, type Handle } from "../lib/boxHandles";
import { MAX_LABEL_LENGTH, heightForLabel, labelBox, parseShape, serializeShape, shapeLabelSize, type ShapeData } from "../lib/shapes";
import { TRANSPARENT, themeColor } from "../lib/colors";
import { shapeClipPath, shapePaint } from "../lib/roughPaths";
import PaintPaths from "./PaintPaths";

const MIN_SIZE = 16;
const round = (n: number) => Math.round(n * 100) / 100;

interface Props {
  id: string;
  x: number;
  y: number;
  content: string;
  onMove: (id: string, x: number, y: number) => void;
  // every frame of a drag of this block, and once more (done) when it's let
  // go: lets the rest of a multi-selection move in step with it
  onDragFrame?: (id: string, x: number, y: number, done?: boolean) => void;
  onMarkErase: (id: string) => void;
  // Resizing (throttled, then once more with done=true) and label edits both
  // hand back the whole new content. Omitted for viewers who can't edit.
  onReshape?: (id: string, x: number, y: number, content: string, done: boolean) => void;
  // the label is being typed in, right in the shape
  editing?: boolean;
  // double-click (or Enter, see useDiagram) starts editing the label, and
  // finishing it reports back. Omitted for viewers who can't edit.
  onEditLabel?: (id: string) => void;
  onLabelDone?: (id: string) => void;
  // an arrow being drawn or dragged will attach here: outline it
  bindHighlight?: boolean;
  pendingErase: boolean;
  link?: string | null;
  selected?: boolean;
  mode: Mode;
  isMouseDown: React.RefObject<boolean>;
  isDark: boolean;
  zIndex: number;
  // a pen stroke that just snapped into this shape: it draws itself in
  // (useSnapGhosts), the way a snapped drawing does
  drawIn?: DrawIn;
}

// A rectangle, ellipse or diamond with a centered label — the box of an
// architecture diagram. Drawn with rough.js (lib/roughPaths), so it can look
// clean or hand-drawn.
export default React.memo(function ShapeNode({
  id,
  x,
  y,
  content,
  onMove,
  onDragFrame,
  onMarkErase,
  onReshape,
  editing = false,
  onEditLabel,
  onLabelDone,
  bindHighlight,
  pendingErase,
  link,
  selected,
  mode,
  isMouseDown,
  isDark,
  zIndex,
  drawIn,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shape = useMemo(() => parseShape(content), [content]);
  const [preview, setPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const shown = preview ?? { x, y, w: shape.w, h: shape.h };
  const { w, h } = shown;
  const canInteract = mode === "select" || mode === "text";
  const paint = useMemo(() => shapePaint(shape, w, h, isDark), [shape, w, h, isDark]);

  function reshape(next: ShapeData, nx: number, ny: number, done: boolean) {
    onReshape?.(id, nx, ny, serializeShape(next), done);
  }

  // Typing in the label finished: save it, growing the shape taller if the
  // text doesn't fit (`height`: the typed text's height, in canvas px).
  function commitLabel(typed: string, height: number) {
    onLabelDone?.(id);
    const label = typed.trim().slice(0, MAX_LABEL_LENGTH);
    const fits = heightForLabel(shape.kind, height);
    const h = label && fits > shape.h ? fits : shape.h;
    if (label !== shape.label || h !== shape.h) reshape({ ...shape, label, h }, x, y, true);
  }

  function handleResizeMouseDown(e: React.MouseEvent, handle: Handle) {
    e.stopPropagation();
    e.preventDefault();
    if (!onReshape || !containerRef.current) return;
    const startClient = { x: e.clientX, y: e.clientY };
    const start = { x, y, w: shape.w, h: shape.h };
    const zoom = containerRef.current.getBoundingClientRect().width / shape.w || 1;
    const travel = dragTravel(startClient, zoom);
    let latest: typeof start | null = null;
    let lastSync = 0;
    pauseGlide(containerRef.current);

    function onMouseMove(mv: MouseEvent) {
      const { dx, dy } = travel(mv);
      let nw = start.w + (handle.includes("e") ? dx : handle.includes("w") ? -dx : 0);
      let nh = start.h + (handle.includes("s") ? dy : handle.includes("n") ? -dy : 0);
      nw = Math.max(nw, MIN_SIZE);
      nh = Math.max(nh, MIN_SIZE);
      if (mv.shiftKey && handle.length === 2) {
        const f = Math.max(nw / start.w, nh / start.h);
        nw = start.w * f;
        nh = start.h * f;
      }
      latest = {
        x: round(start.x + (handle.includes("w") ? start.w - nw : 0)),
        y: round(start.y + (handle.includes("n") ? start.h - nh : 0)),
        w: round(nw),
        h: round(nh),
      };
      setPreview(latest);
      // arrows attached here follow every frame (lib/liveShapes)
      setLive(id, latest);
      const now = performance.now();
      if (now - lastSync >= DRAG_SYNC_INTERVAL_MS) {
        lastSync = now;
        reshape({ ...shape, w: latest.w, h: latest.h }, latest.x, latest.y, false);
      }
    }
    function onMouseUp() {
      stopDrag();
      window.removeEventListener("mouseup", onMouseUp);
      if (latest) reshape({ ...shape, w: latest.w, h: latest.h }, latest.x, latest.y, true);
      setPreview(null);
      clearLive([id]);
      resumeGlide(containerRef.current);
    }
    const stopDrag = trackDrag(e.nativeEvent, onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handleDragMouseDown(e: React.MouseEvent) {
    const drag = dragFrom({ x, y }, { x: e.clientX, y: e.clientY }, zoomOf(containerRef.current));
    let lastSync = 0;
    let latest = { x, y };
    pauseGlide(containerRef.current);

    function onMouseMove(mv: MouseEvent) {
      latest = drag(mv);
      onDragFrame?.(id, latest.x, latest.y);
      if (containerRef.current) {
        containerRef.current.style.left = `${latest.x}px`;
        containerRef.current.style.top = `${latest.y}px`;
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

  function handleMouseDown(e: React.MouseEvent) {
    if (mode === "erase") {
      e.stopPropagation();
      onMarkErase(id);
      return;
    }
    // the arrow tool starts on shapes (the page handles that on pointerdown)
    if (mode === "arrow") return;
    if (mode !== "hand") e.stopPropagation();
    if (canInteract) handleDragMouseDown(e);
  }

  // A fill is a pale shade (a deep one on the dark canvas), so text on it
  // follows the theme; a dot or stripe pattern gets a halo so its lines
  // don't run through the letters.
  const patterned = shape.fill !== TRANSPARENT && shape.fillStyle !== "solid";
  // the label is drawn in the stroke color, the way a text block's color is
  const labelColor = themeColor(shape.stroke, isDark);
  const labelFont = shape.roughness > 0 ? "font-canvas" : "font-mono";
  const area = labelBox(shape.kind, w, h);

  return (
    <div
      ref={containerRef}
      data-node-id={id}
      className="absolute group outline-none"
      style={{
        left: shown.x,
        top: shown.y,
        width: w,
        height: h,
        zIndex,
        opacity: (pendingErase ? 0.3 : 1) * (shape.opacity / 100),
        outline: selected ? SELECTION_OUTLINE : undefined,
        outlineOffset: BOX_PAD,
        transition: GLIDE_TRANSITION,
        cursor: canInteract ? "grab" : undefined,
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => mode === "erase" && isMouseDown.current && onMarkErase(id)}
      onDoubleClick={(e) => {
        if (!onEditLabel || !canInteract) return;
        e.stopPropagation();
        onEditLabel(id);
      }}
    >
      {mode === "hand" && <div className="absolute inset-0 z-10 cursor-grab" />}

      {bindHighlight && (
        <div
          className="absolute rounded-lg pointer-events-none"
          style={{ inset: -5, boxShadow: "0 0 0 3px rgba(79,180,242,0.45)" }}
        />
      )}

      <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <clipPath id={`shape-clip-${id}`}>
            <path d={shapeClipPath(shape.kind, w, h, shape.edges)} />
          </clipPath>
        </defs>
        <PaintPaths paint={paint} clipId={`shape-clip-${id}`} drawIn={drawIn} />
      </svg>

      {/* The label: centered in the shape, wrapping at its width. While it's
          typed in it can run past the bottom; saving grows the shape to fit. */}
      <div
        className={`absolute flex items-center justify-center text-center ${labelFont} ${editing ? "" : "select-none"}`}
        style={{
          left: area.left,
          right: area.left,
          top: area.top,
          bottom: area.top,
          color: labelColor,
          fontSize: shapeLabelSize(shape),
          lineHeight: 1.25,
          // a halo in the canvas color, so hatch lines don't run through the text
          textShadow: !patterned ? undefined : `0 0 3px ${isDark ? "#121212" : "#ffffff"}, 0 0 2px ${isDark ? "#121212" : "#ffffff"}`,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          overflow: editing ? "visible" : "hidden",
          // clicks go through to the shape: the label moves and selects with it
          pointerEvents: editing ? "auto" : "none",
        }}
      >
        {editing ? <LabelEditor initial={shape.label} onDone={commitLabel} /> : shape.label}
      </div>

      {link && <LinkBadge link={link} isDark={isDark} />}

      {selected && canInteract && onReshape &&
        HANDLES.map(({ handle, fx, fy, cursor }) => {
          const boxW = w + 2 * BOX_PAD;
          const boxH = h + 2 * BOX_PAD;
          const corner = handle.length === 2;
          return (
            <div
              key={handle}
              onMouseDown={(e) => handleResizeMouseDown(e, handle)}
              className={corner ? "node-handle absolute rounded-sm border z-10" : "node-handle absolute"}
              style={{
                // centered on the outline, the same size on screen at any zoom
                left: handleEdge(-BOX_PAD + (fx === 0.5 ? 0 : fx * boxW), HANDLE_SIZE),
                top: handleEdge(-BOX_PAD + (fy === 0.5 ? 0 : fy * boxH), HANDLE_SIZE),
                width: corner || fx !== 0.5 ? screenPx(HANDLE_SIZE) : `calc(${boxW}px + ${screenPx(HANDLE_SIZE)})`,
                height: corner || fy !== 0.5 ? screenPx(HANDLE_SIZE) : `calc(${boxH}px + ${screenPx(HANDLE_SIZE)})`,
                background: corner ? (isDark ? "#121212" : "#ffffff") : undefined,
                borderColor: corner ? "#4fb4f2" : undefined,
                borderWidth: corner ? screenPx(1) : undefined,
                cursor,
              }}
            />
          );
        })}
    </div>
  );
});

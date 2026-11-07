import React, { useMemo, useRef, useState } from "react";
import type { Mode } from "../App";
import LinkBadge from "./LinkBadge";
import { GLIDE_TRANSITION, pauseGlide, resumeGlide } from "../lib/glide";
import { BOX_PAD, DRAG_SYNC_INTERVAL_MS, HANDLES, HANDLE_SIZE, type Handle } from "../lib/boxHandles";
import { parseShape, serializeShape, type ShapeData } from "../lib/shapes";
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
  onMarkErase: (id: string) => void;
  // Resizing (throttled, then once more with done=true) and label edits both
  // hand back the whole new content. Omitted for viewers who can't edit.
  onReshape?: (id: string, x: number, y: number, content: string, done: boolean) => void;
  // double-click: put text in the shape (a text block of its own; see
  // useDiagram addShapeText). Omitted for viewers who can't edit.
  onEditText?: (id: string) => void;
  // an arrow being drawn or dragged will attach here: outline it
  bindHighlight?: boolean;
  pendingErase: boolean;
  link?: string | null;
  selected?: boolean;
  mode: Mode;
  isMouseDown: React.RefObject<boolean>;
  isDark: boolean;
  zIndex: number;
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
  onMarkErase,
  onReshape,
  onEditText,
  bindHighlight,
  pendingErase,
  link,
  selected,
  mode,
  isMouseDown,
  isDark,
  zIndex,
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

  function handleResizeMouseDown(e: React.MouseEvent, handle: Handle) {
    e.stopPropagation();
    e.preventDefault();
    if (!onReshape || !containerRef.current) return;
    const startClient = { x: e.clientX, y: e.clientY };
    const start = { x, y, w: shape.w, h: shape.h };
    const zoom = containerRef.current.getBoundingClientRect().width / shape.w || 1;
    let latest: typeof start | null = null;
    let lastSync = 0;
    pauseGlide(containerRef.current);

    function onMouseMove(mv: MouseEvent) {
      const dx = (mv.clientX - startClient.x) / zoom;
      const dy = (mv.clientY - startClient.y) / zoom;
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
      const now = performance.now();
      if (now - lastSync >= DRAG_SYNC_INTERVAL_MS) {
        lastSync = now;
        reshape({ ...shape, w: latest.w, h: latest.h }, latest.x, latest.y, false);
      }
    }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (latest) reshape({ ...shape, w: latest.w, h: latest.h }, latest.x, latest.y, true);
      setPreview(null);
      resumeGlide(containerRef.current);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handleDragMouseDown(e: React.MouseEvent) {
    const offset = { x: e.clientX - x, y: e.clientY - y };
    let lastSync = 0;
    let latest = { x, y };
    pauseGlide(containerRef.current);

    function onMouseMove(mv: MouseEvent) {
      latest = { x: mv.clientX - offset.x, y: mv.clientY - offset.y };
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
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      onMove(id, latest.x, latest.y);
      resumeGlide(containerRef.current);
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
    // the arrow tool starts on shapes (the page handles that on pointerdown)
    if (mode === "arrow") return;
    if (mode !== "hand") e.stopPropagation();
    if (canInteract) handleDragMouseDown(e);
  }

  // A fill is a pale shade (a deep one on the dark canvas), so text on it
  // follows the theme; a dot or stripe pattern gets a halo so its lines
  // don't run through the letters.
  const patterned = shape.fill !== TRANSPARENT && shape.fillStyle !== "solid";
  const labelColor = themeColor("auto", isDark);
  const labelFont = shape.roughness > 0 ? "font-canvas text-base" : "font-mono text-sm";

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
        outline: selected ? "1.5px dashed #4fb4f2" : undefined,
        outlineOffset: BOX_PAD,
        transition: GLIDE_TRANSITION,
        cursor: canInteract ? "grab" : undefined,
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => mode === "erase" && isMouseDown.current && onMarkErase(id)}
      onDoubleClick={(e) => {
        if (!onEditText || !canInteract) return;
        e.stopPropagation();
        onEditText(id);
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
            <path d={shapeClipPath(shape.kind, w, h)} />
          </clipPath>
        </defs>
        <PaintPaths paint={paint} clipId={`shape-clip-${id}`} />
      </svg>

      <div
        className={`absolute inset-0 flex items-center justify-center p-2 text-center select-none ${labelFont}`}
        style={{
          color: labelColor,
          // a halo in the canvas color, so hatch lines don't run through the text
          textShadow: !patterned ? undefined : `0 0 3px ${isDark ? "#121212" : "#ffffff"}, 0 0 2px ${isDark ? "#121212" : "#ffffff"}`,
          whiteSpace: "pre-wrap",
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        {/* a label from before text in shapes became its own block; it
            turns into one the next time text is added (useDiagram) */}
        {shape.label}
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
              className={corner ? "absolute rounded-sm border z-10" : "absolute"}
              style={{
                left: -BOX_PAD + (fx === 0.5 ? 0 : fx * boxW) - HANDLE_SIZE / 2,
                top: -BOX_PAD + (fy === 0.5 ? 0 : fy * boxH) - HANDLE_SIZE / 2,
                width: corner || fx !== 0.5 ? HANDLE_SIZE : boxW + HANDLE_SIZE,
                height: corner || fy !== 0.5 ? HANDLE_SIZE : boxH + HANDLE_SIZE,
                background: corner ? (isDark ? "#121212" : "#ffffff") : undefined,
                borderColor: corner ? "#4fb4f2" : undefined,
                cursor,
              }}
            />
          );
        })}
    </div>
  );
});

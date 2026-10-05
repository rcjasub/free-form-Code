import { useRef } from "react";
import React from "react";
import type { Mode } from "../App";
import LinkBadge from "./LinkBadge";
import { GLIDE_TRANSITION, pauseGlide, resumeGlide } from "../lib/glide";

// See FloatingNode.tsx for why dragging is throttled this way.
const DRAG_SYNC_INTERVAL_MS = 40;

interface Props {
  id: string;
  x: number;
  y: number;
  width: number;
  src: string; // data URL, see lib/images.ts
  link?: string | null;
  onMove: (id: string, x: number, y: number) => void;
  onMarkErase: (id: string) => void;
  pendingErase: boolean;
  selected?: boolean;
  mode: Mode;
  isMouseDown: React.RefObject<boolean>;
  isDark: boolean;
}

// A pasted image. Drag it in select mode; erase it like any other block.
export default React.memo(function ImageNode({
  id,
  x,
  y,
  width,
  src,
  link,
  onMove,
  onMarkErase,
  pendingErase,
  selected,
  mode,
  isMouseDown,
  isDark,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  function handleMouseDown(e: React.MouseEvent) {
    if (mode === "erase") {
      e.stopPropagation();
      onMarkErase(id);
      return;
    }
    if (mode === "hand" || e.button !== 0) return; // let the canvas pan
    e.stopPropagation();
    e.preventDefault(); // no native image drag-and-drop
    if (mode !== "select") return;

    const startX = e.clientX;
    const startY = e.clientY;
    const offset = { x: startX - x, y: startY - y };
    let lastSync = 0;
    let latest: { x: number; y: number } | null = null;
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
      if (latest) onMove(id, latest.x, latest.y);
      resumeGlide(containerRef.current);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      ref={containerRef}
      data-node-id={id}
      className="absolute outline-none"
      style={{
        left: x,
        top: y,
        width,
        opacity: pendingErase ? 0.3 : 1,
        outline: selected ? "1.5px dashed #4fb4f2" : undefined,
        outlineOffset: 6,
        transition: GLIDE_TRANSITION, // see lib/glide
        cursor: mode === "select" ? "grab" : undefined,
        // in draw mode, strokes can start right on top of an image
        pointerEvents: mode === "draw" ? "none" : undefined,
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => {
        if (mode === "erase" && isMouseDown.current) onMarkErase(id);
      }}
    >
      <img src={src} alt="" draggable={false} className="block w-full h-auto rounded-md select-none" />
      {link && <LinkBadge link={link} isDark={isDark} />}
    </div>
  );
});

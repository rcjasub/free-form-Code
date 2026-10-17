import { useRef, useEffect, useState } from "react";
import React from "react";
import type { Mode } from "../App";
import { BOX_PAD, startResizeDrag, type ResizeHandle, type ResizeLimits } from "../lib/resize";
import ResizeHandles from "./ResizeHandles";

// Outputs only live on this screen — nobody else sees them — so a drag or
// resize is shown on this bubble alone while it happens, and the page only
// hears the final position/size on release. Updating the page every frame
// re-rendered the whole canvas and made resizing feel slow.

// Unresized, an output wraps at this width; the handles change it.
const DEFAULT_WIDTH = 320;
const DEFAULT_FONT_SIZE = 12;
const OUTPUT_LIMITS: ResizeLimits = { minWidth: 60, maxWidth: 2000, minFont: 6, maxFont: 120 };

interface Props {
  id: number;
  x: number;
  y: number;
  text: string;
  isError: boolean;
  // set with the resize handles; unset, it wraps at DEFAULT_WIDTH and uses
  // DEFAULT_FONT_SIZE
  width?: number | null;
  fontSize?: number | null;
  onDelete: (id: number) => void;
  onMove: (id: number, x: number, y: number) => void;
  onResize: (id: number, width: number | null, fontSize: number | null, x: number, y: number) => void;
  mode: Mode;
  isMouseDown: React.RefObject<boolean>;
  isDark: boolean;
}

export default React.memo(function OutputBubble({
  id,
  x,
  y,
  text,
  isError,
  width,
  fontSize,
  onMove,
  onDelete,
  onResize,
  mode,
  isMouseDown,
  isDark,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xRef = useRef(x);
  const yRef = useRef(y);
  const onMoveRef = useRef(onMove);
  // Clicked: shows the dashed box and resize handles, like other blocks.
  // Outputs aren't part of the canvas's block selection, so this is local;
  // a press anywhere else clears it.
  const [selected, setSelected] = useState(false);
  xRef.current = x;
  yRef.current = y;
  onMoveRef.current = onMove;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 2) return;
      e.preventDefault();

      const startX = e.clientX;
      const startY = e.clientY;
      const offset = { x: startX - xRef.current, y: startY - yRef.current };
      let isDragging = false;
      let latest = { x: xRef.current, y: yRef.current };

      function onMouseMove(mv: MouseEvent) {
        if (!isDragging) {
          const dx = mv.clientX - startX;
          const dy = mv.clientY - startY;
          if (Math.sqrt(dx * dx + dy * dy) > 5) isDragging = true;
        }
        if (!isDragging) return;

        latest = { x: mv.clientX - offset.x, y: mv.clientY - offset.y };
        if (el) {
          el.style.left = `${latest.x}px`;
          el.style.top = `${latest.y}px`;
        }

      }

      function onMouseUp() {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        if (isDragging) onMoveRef.current(id, latest.x, latest.y);
      }

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }

    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
    }

    el.addEventListener("mousedown", onMouseDown, true);
    el.addEventListener("contextmenu", onContextMenu, true);
    return () => {
      el.removeEventListener("mousedown", onMouseDown, true);
      el.removeEventListener("contextmenu", onContextMenu, true);
    };
  }, [id]);

  useEffect(() => {
    if (!selected) return;
    function onPressElsewhere(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setSelected(false);
    }
    window.addEventListener("mousedown", onPressElsewhere, true);
    return () => window.removeEventListener("mousedown", onPressElsewhere, true);
  }, [selected]);

  // Left-drag anywhere on the output moves it (select and text mode); a
  // press also selects it.
  function handleDragMouseDown(e: React.MouseEvent) {
    if (e.button !== 0 || (e.target as Element).closest("button")) return; // the ✕
    setSelected(true);
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const offset = { x: startX - xRef.current, y: startY - yRef.current };
    let isDragging = false;
    let latest = { x: xRef.current, y: yRef.current };

    function onMouseMove(mv: MouseEvent) {
      if (!isDragging) {
        const dx = mv.clientX - startX;
        const dy = mv.clientY - startY;
        if (Math.sqrt(dx * dx + dy * dy) > 3) isDragging = true;
      }
      if (!isDragging) return;

      latest = { x: mv.clientX - offset.x, y: mv.clientY - offset.y };
      if (containerRef.current) {
        containerRef.current.style.left = `${latest.x}px`;
        containerRef.current.style.top = `${latest.y}px`;
      }

    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (isDragging) onMoveRef.current(id, latest.x, latest.y);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handleResizePointerDown(e: React.PointerEvent, handle: ResizeHandle) {
    const el = containerRef.current;
    if (!el || e.button !== 0) return;
    startResizeDrag(
      e,
      el,
      handle,
      // an unresized output has no fixed width, so it starts from what's shown
      { x: xRef.current, y: yRef.current, font: fontSize ?? null, defaultFont: DEFAULT_FONT_SIZE, wrap: width ?? el.offsetWidth },
      OUTPUT_LIMITS,
      (r, done) => {
        if (done) onResize(id, r.wrap, r.font, r.x, r.y);
      },
      {
        // shown on the element itself until it's committed on release
        preview: (r) => {
          el.style.left = `${r.x}px`;
          el.style.top = `${r.y}px`;
          el.style.width = `${r.wrap}px`;
          el.style.maxWidth = "none";
          el.style.fontSize = `${r.font ?? DEFAULT_FONT_SIZE}px`;
        },
        glides: false, // outputs don't glide
      },
    );
  }

  const canMove = mode === "select" || mode === "text";

  return (
    <div
      ref={containerRef}
      data-output-id={id} // lets the next output from the same block be placed beside this one
      // Matches the canvas: white text on the dark canvas black, black text on
      // white in light mode. Errors are the app's red, #FF3B6B.
      className={`absolute group rounded-lg px-3 py-2 shadow-lg font-canvas whitespace-pre-wrap ${
        isDark ? "bg-[#121212]" : "bg-white"
      } ${
        isError ? "text-[#FF3B6B]" : isDark ? "text-white" : "text-black"
      } ${canMove ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{
        left: x,
        top: y,
        // Sized to its own text, wrapping at DEFAULT_WIDTH — or exactly the
        // width set with the handles. Without max-content, the browser
        // squeezed an output into whatever room was left before the canvas's
        // right edge.
        width: width ?? "max-content",
        maxWidth: width ? undefined : DEFAULT_WIDTH,
        fontSize: fontSize ?? DEFAULT_FONT_SIZE,
        lineHeight: 1.4,
        outline: selected ? "1.5px dashed #4fb4f2" : undefined,
        outlineOffset: selected ? BOX_PAD : undefined,
        pointerEvents: mode === "draw" ? "none" : undefined,
      }}
      onMouseDown={(e) => {
        if (canMove) handleDragMouseDown(e);
        else if (mode !== "hand") e.stopPropagation();
      }}
      onMouseEnter={() => {
        if (mode === "erase" && isMouseDown.current) onDelete(id);
      }}
    >
      {selected && canMove && <ResizeHandles isDark={isDark} onPointerDown={handleResizePointerDown} />}

      {/* hand mode overlay — sits on top of CodeMirror so clicks pan instead of focus */}
      {mode === "hand" && <div className="absolute inset-0 z-10 cursor-grab" />}
      <button
        className={`absolute top-1 right-1.5 text-[10px] cursor-pointer opacity-40 hover:opacity-100 transition-opacity ${isError ? "text-[#FF3B6B]" : "text-[#7A86b3]"}`}
        onClick={() => onDelete(id)}
      >
        ✕
      </button>
      <span className="pr-3">{text}</span>
    </div>
  );
})

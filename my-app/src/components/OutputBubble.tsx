import { useRef, useEffect } from "react";
import type { Mode } from "../App";

interface Props {
  id: number;
  x: number;
  y: number;
  text: string;
  isError: boolean;
  onDelete: (id: number) => void;
  onMove: (id: number, x: number, y: number) => void;
  mode: Mode;
  isMouseDown: React.RefObject<boolean>;
}

export default function OutputBubble({
  id,
  x,
  y,
  text,
  isError,
  onMove,
  onDelete,
  mode,
  isMouseDown,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xRef = useRef(x);
  const yRef = useRef(y);
  const onMoveRef = useRef(onMove);
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

      function onMouseMove(mv: MouseEvent) {
        if (!isDragging) {
          const dx = mv.clientX - startX;
          const dy = mv.clientY - startY;
          if (Math.sqrt(dx * dx + dy * dy) > 5) isDragging = true;
        }
        if (isDragging) {
          onMoveRef.current(id, mv.clientX - offset.x, mv.clientY - offset.y);
        }
      }

      function onMouseUp() {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
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

  function handleDragHandleMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const offset = { x: startX - xRef.current, y: startY - yRef.current };
    let isDragging = false;

    function onMouseMove(mv: MouseEvent) {
      if (!isDragging) {
        const dx = mv.clientX - startX;
        const dy = mv.clientY - startY;
        if (Math.sqrt(dx * dx + dy * dy) > 3) isDragging = true;
      }
      if (isDragging) {
        onMoveRef.current(id, mv.clientX - offset.x, mv.clientY - offset.y);
      }
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
      ref={containerRef}
      className={`absolute group max-w-xs rounded-lg px-3 py-2 shadow-lg text-xs font-mono whitespace-pre-wrap border ${
        isError
          ? "bg-red-50 text-red-700 border-red-200"
          : "bg-gray-900 text-green-400 border-gray-700"
      }`}
      style={{ left: x, top: y }}
      onMouseDown={(e) => {
        if (mode !== "hand") e.stopPropagation();
      }}
      onMouseEnter={() => {
        if (mode === "erase" && isMouseDown.current) onDelete(id);
      }}
    >
      {/* drag handle — visible on hover in select mode */}
      {mode === "select" && (
        <div
          className="absolute -top-4 left-0 right-0 h-4 flex items-center justify-center cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={handleDragHandleMouseDown}
        >
          <div className="w-8 h-1 bg-gray-300 rounded-full" />
        </div>
      )}

      {/* hand mode overlay — sits on top of CodeMirror so clicks pan instead of focus */}
      {mode === "hand" && <div className="absolute inset-0 z-10 cursor-grab" />}
      <button
        className={`absolute top-1 right-1.5 text-[10px] opacity-40 hover:opacity-100 transition-opacity ${isError ? "text-red-400" : "text-gray-400"}`}
        onClick={() => onDelete(id)}
      >
        ✕
      </button>
      <span className="pr-3">{text}</span>
    </div>
  );
}

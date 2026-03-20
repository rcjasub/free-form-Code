import { useRef } from "react";

interface Props {
  id: number;
  x: number;
  y: number;
  text: string;
  isError: boolean;
  onDismiss: (id: number) => void;
  onMove: (id: number, x: number, y: number) => void;
}

export default function OutputBubble({
  id,
  x,
  y,
  text,
  isError,
  onMove,
  onDismiss,
}: Props) {
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    dragOffset.current = { x: e.clientX - x, y: e.clientY - y };

    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      onMove(id, e.clientX - dragOffset.current.x, e.clientY - dragOffset.current.y);
    }
    function onMouseUp() {
      dragging.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      className={`absolute group max-w-xs rounded-lg px-3 py-2 shadow-lg text-xs font-mono whitespace-pre-wrap border ${
        isError
          ? "bg-red-50 text-red-700 border-red-200"
          : "bg-gray-900 text-green-400 border-gray-700"
      }`}
      style={{ left: x, top: y }}
      onMouseDown={(e) => {
        if (e.button === 1) startDrag(e);
      }}
    >
      <button
        className={`absolute top-1 right-1.5 text-[10px] opacity-40 hover:opacity-100 transition-opacity ${isError ? "text-red-400" : "text-gray-400"}`}
        onClick={() => onDismiss(id)}
      >
        ✕
      </button>

      <div
        className="absolute -left-5 top-1 opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing transition-opacity select-none text-gray-400 text-xs"
        onMouseDown={startDrag}
      >
        ⠿
      </div>

      <span className="pr-3">{text}</span>
    </div>
  );
}

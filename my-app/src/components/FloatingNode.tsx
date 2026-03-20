import { useRef, useEffect } from "react";

interface Props {
  id: number;
  x: number;
  y: number;
  content: string;
  onChange: (id: number, content: string) => void;
  onMove: (id: number, x: number, y: number) => void;
  onSaveSelection: (content: string, el: HTMLTextAreaElement) => void;
  onDelete: (id: number) => void;
}

export default function FloatingNode({
  id,
  x,
  y,
  content,
  onChange,
  onMove,
  onSaveSelection,
  onDelete,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (content === "") textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }, [content]);

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    dragOffset.current = { x: e.clientX - x, y: e.clientY - y };

    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      onMove(
        id,
        e.clientX - dragOffset.current.x,
        e.clientY - dragOffset.current.y,
      );
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
    <div className="absolute group" style={{ left: x, top: y }}>
      <div
        className="absolute -right-5 top-1 opacity-0 group-hover:opacity-40 hover:opacity-100 cursor-pointer text-gray-400 text-xs transition-opacity"
        onClick={() => onDelete(id)}
      >
        ✕
      </div>
      {/* drag handle */}
      <div
        className="absolute -left-5 top-1 opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing transition-opacity select-none text-gray-400 text-xs"
        onMouseDown={startDrag}
      >
        ⠿
      </div>

      <textarea
        ref={textareaRef}
        className="bg-transparent resize-none outline-none font-mono text-sm text-gray-800 leading-relaxed min-w-[180px] max-w-[480px] overflow-hidden placeholder-gray-300"
        value={content}
        placeholder="type here..."
        rows={1}
        onChange={(e) => onChange(id, e.target.value)}
        onMouseUp={(e) => {
          const ta = e.currentTarget;
          const selected = ta.value
            .substring(ta.selectionStart, ta.selectionEnd)
            .trim();
          if (selected) onSaveSelection(selected, ta);
        }}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

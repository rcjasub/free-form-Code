import { useRef, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { EditorView } from "@codemirror/view";
import type { Mode } from "../App";

interface Props {
  id: number;
  x: number;
  y: number;
  content: string;
  onChange: (id: number, content: string) => void;
  onMove: (id: number, x: number, y: number) => void;
  onSaveSelection: (content: string, el: HTMLElement) => void;
  onDelete: (id: number) => void;
  mode: Mode;
  isMouseDown: React.RefObject<boolean>;
}

const transparentTheme = EditorView.theme({
  "&": {
    background: "transparent !important",
    fontSize: "14px",
    fontFamily: "monospace",
    minWidth: "180px",
    maxWidth: "480px",
    outline: "none !important",
  },
  ".cm-content": {
    background: "transparent",
    color: "#1f2937",
    caretColor: "#1f2937",
    padding: "0",
  },
  ".cm-editor": { background: "transparent" },
  ".cm-focused": { outline: "none !important" },
  ".cm-editor.cm-focused": { outline: "none !important" },
  ".cm-line": { padding: "0", lineHeight: "1.625" },
  ".cm-gutters": { display: "none" },
  ".cm-cursor": { borderLeftColor: "#1f2937" },
  ".cm-selectionBackground, ::selection": { background: "#bfdbfe !important" },
});

export default function FloatingNode({
  id,
  x,
  y,
  content,
  onChange,
  onMove,
  onSaveSelection,
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

    // Right-click drag → move node (universal fallback)
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

  // Left-click drag from the drag handle (select mode)
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
      className="absolute group outline-none"
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
      {mode === "hand" && (
        <div className="absolute inset-0 z-10 cursor-grab" />
      )}

      {/* delete button */}
      <div
        className="absolute -right-5 top-1 opacity-0 group-hover:opacity-40 hover:opacity-100 cursor-pointer text-gray-400 text-xs transition-opacity z-20"
        onClick={() => onDelete(id)}
      >
        ✕
      </div>

      <CodeMirror
        value={content}
        extensions={[javascript(), transparentTheme, EditorView.lineWrapping]}
        onChange={(val) => onChange(id, val)}
        onStatistics={(data) => {
          if (!containerRef.current) return;
          const selected = data.selectionCode.trim();
          const toSave = selected || content.trim();
          if (toSave) onSaveSelection(toSave, containerRef.current);
        }}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          dropCursor: false,
          allowMultipleSelections: false,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,
          highlightActiveLine: false,
          highlightSelectionMatches: false,
          searchKeymap: false,
        }}
        placeholder="type here..."
      />
    </div>
  );
}

import { useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { EditorView } from "@codemirror/view";

interface Props {
  id: number;
  x: number;
  y: number;
  content: string;
  onChange: (id: number, content: string) => void;
  onMove: (id: number, x: number, y: number) => void;
  onSaveSelection: (content: string, el: HTMLElement) => void;
  onDelete: (id: number) => void;
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
  ".cm-editor": {
    background: "transparent",
  },
  ".cm-focused": {
    outline: "none !important",
  },
  ".cm-editor.cm-focused": {
    outline: "none !important",
  },
  ".cm-line": {
    padding: "0",
    lineHeight: "1.625",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-cursor": {
    borderLeftColor: "#1f2937",
  },
  ".cm-selectionBackground, ::selection": {
    background: "#bfdbfe !important",
  },
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
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
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
      ref={containerRef}
      className="absolute group outline-none"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* delete button */}
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

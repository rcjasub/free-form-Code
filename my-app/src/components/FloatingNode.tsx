import { useRef, useEffect, useMemo, useState } from "react";
import React from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { EditorView } from "@codemirror/view";
import type { Mode } from "../App";

interface Props {
  id: string;
  x: number;
  y: number;
  content: string;
  onChange: (id: string, content: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onSaveSelection: (content: string, el: HTMLElement) => void;
  onDelete: (id: string) => void;
  onMarkErase: (id: string) => void;
  pendingErase: boolean;
  onRun: (id: string) => void;
  mode: Mode;
  isMouseDown: React.RefObject<boolean>;
  isDark: boolean;
}

function makeTheme(isDark: boolean) {
  return EditorView.theme({
    "&": {
      background: "transparent !important",
      fontSize: "14px",
      fontFamily: "monospace",
      minWidth: "180px",
      outline: "none !important",
    },
    ".cm-content": {
      background: "transparent",
      color: isDark ? "#f5f5f5" : "#1f2937",
      caretColor: isDark ? "#f5f5f5" : "#1f2937",
      padding: "0",
    },
    ".cm-editor": { background: "transparent" },
    ".cm-focused": { outline: "none !important" },
    ".cm-editor.cm-focused": { outline: "none !important" },
    ".cm-line": { padding: "0", lineHeight: "1.625" },
    ".cm-gutters": { display: "none" },
    ".cm-scroller": { overflow: "hidden !important" },
    ".cm-cursor": {
      borderLeftColor: isDark ? "#f5f5f5" : "#1f2937",
      borderLeftWidth: "2px",
    },
    ".cm-selectionBackground, ::selection": {
      background: isDark ? "#264f78 !important" : "#bfdbfe !important",
    },
  });
}

// React memo: is a wrapper that tells React "only re-render this component if its props actually changed"
export default React.memo(function FloatingNode({
  id,
  x,
  y,
  content,
  onChange,
  onMove,
  onSaveSelection,
  onDelete,
  onMarkErase,
  pendingErase,
  onRun,
  mode,
  isMouseDown,
  isDark,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const xRef = useRef(x);
  const yRef = useRef(y);
  const onMoveRef = useRef(onMove);
  const isFocused = useRef(false);
  xRef.current = x;
  yRef.current = y;
  onMoveRef.current = onMove;

  // Use initial content only — let CodeMirror own its state so the cursor
  // doesn't reset on every keystroke via the controlled-value feedback loop.
  const [initialContent] = useState(content);

  // Sync content from socket updates without disrupting local typing
  useEffect(() => {
    if (isFocused.current) return; // don't overwrite while user is typing
    const view = editorRef.current?.view;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === content) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: content },
    });
  }, [content]);

  const theme = useMemo(() => makeTheme(isDark), [isDark]);

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
      data-node-id={id}
      className="absolute group outline-none"
      style={{
        left: x,
        top: y,
        opacity: pendingErase ? 0.3 : 1,
        transition: "opacity 0.15s",
      }}
      onMouseDown={(e) => {
        if (mode === "erase") {
          e.stopPropagation();
          onMarkErase(id);
          return;
        }
        if (mode !== "hand") e.stopPropagation();
      }}
      onMouseEnter={() => {
        if (mode === "erase" && isMouseDown.current) onMarkErase(id);
      }}
    >
      {/* drag handle — visible on hover in select mode */}
      {mode === "select" && (
        <div
          className="absolute -top-4 left-0 right-0 h-4 flex items-center justify-center cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={handleDragHandleMouseDown}
        >
          <div
            className={`w-8 h-1 rounded-full ${isDark ? "bg-[#3c3c4a]" : "bg-gray-300"}`}
          />
        </div>
      )}

      {/* hand mode overlay */}
      {mode === "hand" && <div className="absolute inset-0 z-10 cursor-grab" />}

      {/* play button */}
      <div
        className={`absolute -left-5 top-1 opacity-0 group-hover:opacity-40 hover:opacity-100 cursor-pointer text-xs transition-opacity z-20 ${isDark ? "text-gray-400" : "text-gray-400"}`}
        onClick={() => onRun(id)}
      >
        ▶
      </div>

      {/* delete button */}
      <div
        className={`absolute -right-5 top-1 opacity-0 group-hover:opacity-40 hover:opacity-100 cursor-pointer text-xs transition-opacity z-20 ${isDark ? "text-gray-400" : "text-gray-400"}`}
        onClick={() => onDelete(id)}
      >
        ✕
      </div>

      <CodeMirror
        ref={editorRef}
        value={initialContent}
        extensions={[javascript(), theme, EditorView.lineWrapping]}
        onFocus={() => {
          isFocused.current = true;
        }}
        onBlur={() => {
          isFocused.current = false;
        }}
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
});

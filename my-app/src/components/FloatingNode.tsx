import { useRef, useEffect, useMemo, useState } from "react";
import React from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import type { Mode } from "../App";
import { LANGUAGE_OPTIONS, isRunnable, languageOption, type Language } from "../lib/languages";
import AnimatedDropdown from "./ui/animated-dropdown";
import { draculaDark, draculaLight } from "../lib/codeTheme";
import LinkBadge from "./LinkBadge";
import { GLIDE_TRANSITION, pauseGlide, resumeGlide } from "../lib/glide";

const LANGUAGE_DROPDOWN_OPTIONS = LANGUAGE_OPTIONS.map((l) => ({ value: l.id, label: l.label }));

// While dragging, the pointer's visual position is applied straight to the
// DOM every frame (cheap, no re-render), while onMove — which updates React
// state, emits over the socket, and (debounced) persists to the DB — only
// fires at this rate. Without it, a busy canvas with many blocks and
// several connected viewers turns one drag into a flood of state updates
// and socket traffic on every client, which is what actually causes the lag.
const DRAG_SYNC_INTERVAL_MS = 40;

// Text size bounds for the resize handles; they match the backend's checks.
const DEFAULT_FONT_SIZE = 14;
const MIN_WRAP_WIDTH = 40;
const MAX_WRAP_WIDTH = 4000;
const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 200;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// Selection box offset and resize handles, sized like DrawingNode's.
const BOX_PAD = 6;
const HANDLE_SIZE = 8;

// Excalidraw-style handles: a dot on each corner scales the text; the left
// and right edges of the box can be grabbed anywhere to change the wrap width.
type ResizeHandle = "left" | "right" | "nw" | "ne" | "sw" | "se";
const CORNERS = [
  { handle: "nw", cursor: "nwse-resize" },
  { handle: "ne", cursor: "nesw-resize" },
  { handle: "sw", cursor: "nesw-resize" },
  { handle: "se", cursor: "nwse-resize" },
] as const;

interface Props {
  id: string;
  x: number;
  y: number;
  content: string;
  language: Language;
  onChange: (id: string, content: string) => void;
  // Omitted for viewers who can't edit — the language then shows as a plain label.
  onLanguageChange?: (id: string, language: Language) => void;
  onMove: (id: string, x: number, y: number) => void;
  onSaveSelection?: (content: string, el: HTMLElement) => void;
  onMarkErase: (id: string) => void;
  pendingErase: boolean;
  onRun: (id: string) => void;
  link?: string | null;
  // Put the cursor in the editor when it first appears (a just-made block).
  autoFocus?: boolean;
  // Wrap lines at this width (pasted text, or set with the side handle).
  // Without it the block grows to its longest line, so typing keeps going right.
  wrapWidth?: number;
  // px; the corner handle scales it. Defaults to 14.
  fontSize?: number;
  // Called while a resize handle is dragged (done on release), with the
  // block's position, which moves when resizing from the left or top.
  // Omitted for viewers, who get no handles.
  onResize?: (id: string, wrapWidth: number | null, fontSize: number | null, x: number, y: number, done: boolean) => void;
  // Selected (clicked, or Select all): a thin box and the resize handles.
  selected?: boolean;
  // Told when the cursor goes in/out of this block, so the toolbar can show T.
  onEditingChange?: (editing: boolean) => void;
  mode: Mode;
  isMouseDown: React.RefObject<boolean>;
  isDark: boolean;
}

function makeTheme(isDark: boolean) {
  return EditorView.theme({
    "&": {
      background: "transparent !important",
      // set per block (see the container's style), so a resize doesn't have
      // to rebuild the editor's theme on every frame
      fontSize: `var(--block-font-size, ${DEFAULT_FONT_SIZE}px)`,
      // just room for the cursor: the selection box hugs the text, and an
      // empty block still has its placeholder's width
      minWidth: "2ch",
      outline: "none !important",
    },
    ".cm-content": {
      background: "transparent",
      color: isDark ? "#f5f5f5" : "#1f2937",
      caretColor: isDark ? "#f5f5f5" : "#1f2937",
      // Room on the right for the 2px cursor. Without it the cursor at the
      // end of a line sticks out, CodeMirror scrolls the line 2px to show
      // it, and typing to the right makes the text wobble back and forth.
      padding: "0 4px 0 0",
    },
    ".cm-editor": { background: "transparent" },
    ".cm-focused": { outline: "none !important" },
    ".cm-editor.cm-focused": { outline: "none !important" },
    ".cm-line": { padding: "0", lineHeight: "1.625" },
    ".cm-gutters": { display: "none" },
    // The font goes here, not on "&": CodeMirror's base theme sets
    // fontFamily: monospace on .cm-scroller, which would override it.
    ".cm-scroller": {
      overflow: "hidden !important",
      fontFamily: "var(--font-canvas)", // Excalifont — see index.css
    },
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
  language,
  onChange,
  onLanguageChange,
  onMove,
  onSaveSelection,
  onMarkErase,
  pendingErase,
  onRun,
  link,
  autoFocus,
  wrapWidth,
  fontSize,
  onResize,
  selected,
  onEditingChange,
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
  // Whether the cursor is in the editor. When it isn't, a cover over the
  // block takes the mouse: drag to move, double-click (or a click in text
  // mode) to start typing, like Excalidraw.
  const [editing, setEditing] = useState(false);
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

  // A block removed while being typed in never gets a blur — clear it here.
  const onEditingChangeRef = useRef(onEditingChange);
  useEffect(() => {
    onEditingChangeRef.current = onEditingChange;
  }, [onEditingChange]);
  useEffect(() => {
    const focused = isFocused;
    return () => {
      if (focused.current) onEditingChangeRef.current?.(false);
    };
  }, []);

  const theme = useMemo(() => makeTheme(isDark), [isDark]);
  const highlight = useMemo(() => languageOption(language).highlight(), [language]);
  // Memoized: react-codemirror reconfigures the whole editor whenever these
  // props are new objects, which an inline array/object is on every render.
  // No lineWrapping unless the block has a wrap width: a line keeps going
  // right for as long as you type; Enter is the only thing that starts a new one.
  const wraps = wrapWidth !== undefined;
  const extensions = useMemo(
    () => [highlight, isDark ? draculaDark : draculaLight, theme, ...(wraps ? [EditorView.lineWrapping] : [])],
    [highlight, isDark, theme, wraps],
  );
  const runnable = isRunnable(language);
  const basicSetup = useMemo(
    () => ({
      lineNumbers: false,
      foldGutter: false,
      dropCursor: false,
      allowMultipleSelections: false,
      // code conveniences that just get in the way of prose
      indentOnInput: runnable,
      bracketMatching: runnable,
      closeBrackets: runnable,
      autocompletion: false,
      highlightActiveLine: false,
      highlightSelectionMatches: false,
      searchKeymap: false,
    }),
    [runnable],
  );

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
      let lastSync = 0;
      let latest = { x: xRef.current, y: yRef.current };

      function onMouseMove(mv: MouseEvent) {
        if (!isDragging) {
          const dx = mv.clientX - startX;
          const dy = mv.clientY - startY;
          if (Math.sqrt(dx * dx + dy * dy) > 5) {
            isDragging = true;
            pauseGlide(el);
          }
        }
        if (!isDragging) return;

        latest = { x: mv.clientX - offset.x, y: mv.clientY - offset.y };
        if (el) {
          el.style.left = `${latest.x}px`;
          el.style.top = `${latest.y}px`;
        }

        const now = performance.now();
        if (now - lastSync >= DRAG_SYNC_INTERVAL_MS) {
          lastSync = now;
          onMoveRef.current(id, latest.x, latest.y);
        }
      }

      function onMouseUp() {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        if (isDragging) {
          onMoveRef.current(id, latest.x, latest.y);
          resumeGlide(el);
        }
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

  // Left-click drag on the block's cover (select and text mode). A press that
  // never moves far enough to be a drag counts as a click: `onClick` runs.
  function handleDragMouseDown(e: React.MouseEvent, onClick?: (e: MouseEvent) => void) {
    if (e.button !== 0) return; // right-click drag has its own listener
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const offset = { x: startX - xRef.current, y: startY - yRef.current };
    let isDragging = false;
    let lastSync = 0;
    let latest = { x: xRef.current, y: yRef.current };

    function onMouseMove(mv: MouseEvent) {
      if (!isDragging) {
        const dx = mv.clientX - startX;
        const dy = mv.clientY - startY;
        if (Math.sqrt(dx * dx + dy * dy) > 3) {
          isDragging = true;
          pauseGlide(containerRef.current);
        }
      }
      if (!isDragging) return;

      latest = { x: mv.clientX - offset.x, y: mv.clientY - offset.y };
      if (containerRef.current) {
        containerRef.current.style.left = `${latest.x}px`;
        containerRef.current.style.top = `${latest.y}px`;
      }

      const now = performance.now();
      if (now - lastSync >= DRAG_SYNC_INTERVAL_MS) {
        lastSync = now;
        onMoveRef.current(id, latest.x, latest.y);
      }
    }

    function onMouseUp(up: MouseEvent) {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (isDragging) {
        onMoveRef.current(id, latest.x, latest.y);
        resumeGlide(containerRef.current);
      } else {
        onClick?.(up);
      }
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  // Puts the cursor in the editor where the pointer is.
  function startEditing(clientX: number, clientY: number) {
    const view = editorRef.current?.view;
    if (!view) return;
    const pos = view.posAtCoords({ x: clientX, y: clientY }) ?? view.state.doc.length;
    view.dispatch({ selection: { anchor: pos } });
    view.focus();
  }

  // Dragging a resize handle. Edges set where lines wrap; corners scale the
  // font (and the wrap width with it), like Excalidraw. Dragging from the
  // left or top moves the block so the opposite side stays put. Sizes are in
  // canvas units: the screen-to-canvas ratio is read off the element itself,
  // so this works at any zoom.
  function handleResizePointerDown(e: React.PointerEvent, handle: ResizeHandle) {
    const el = containerRef.current;
    if (!el || !onResize || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const startClientX = e.clientX;
    const ratio = el.getBoundingClientRect().width / el.offsetWidth || 1;
    const startWidth = el.offsetWidth;
    const startHeight = el.offsetHeight;
    const start = { x: xRef.current, y: yRef.current };
    const startFont = fontSize ?? DEFAULT_FONT_SIZE;
    const startWrap = wrapWidth ?? null;
    const fromLeft = handle === "left" || handle === "nw" || handle === "sw";
    const fromTop = handle === "nw" || handle === "ne";
    let latest = { wrap: startWrap, font: fontSize ?? null, x: start.x, y: start.y };
    let frame = 0;
    pauseGlide(el); // the position follows the drag, not a glide

    function onMove(mv: PointerEvent) {
      // how far the dragged side moved outward
      const out = ((mv.clientX - startClientX) / ratio) * (fromLeft ? -1 : 1);
      if (handle === "left" || handle === "right") {
        const wrap = Math.round(clamp(startWidth + out, MIN_WRAP_WIDTH, MAX_WRAP_WIDTH));
        latest = { wrap, font: fontSize ?? null, x: fromLeft ? start.x + (startWidth - wrap) : start.x, y: start.y };
      } else {
        const factor = Math.max(0.1, (startWidth + out) / startWidth);
        const font = Math.round(clamp(startFont * factor, MIN_FONT_SIZE, MAX_FONT_SIZE) * 10) / 10;
        const scaled = font / startFont; // after clamping, so everything stays in step
        latest = {
          wrap: startWrap === null ? null : Math.round(clamp(startWrap * scaled, MIN_WRAP_WIDTH, MAX_WRAP_WIDTH)),
          font,
          x: fromLeft ? start.x + startWidth * (1 - scaled) : start.x,
          y: fromTop ? start.y + startHeight * (1 - scaled) : start.y,
        };
      }
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          onResize?.(id, latest.wrap, latest.font, latest.x, latest.y, false);
        });
      }
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      cancelAnimationFrame(frame);
      resumeGlide(el);
      if (latest.wrap !== startWrap || latest.font !== (fontSize ?? null)) {
        onResize?.(id, latest.wrap, latest.font, latest.x, latest.y, true);
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      ref={containerRef}
      data-node-id={id}
      data-language={language}
      // w-max: size to the longest line. Otherwise the browser shrink-wraps an
      // absolute box to the room left before the canvas's right edge, and a
      // block placed far right gets squeezed into a narrow vertical column.
      className={`absolute group outline-none ${wraps ? "" : "w-max"}`}
      style={{
        left: x,
        top: y,
        ["--block-font-size" as string]: fontSize ? `${fontSize}px` : undefined,
        // a wrapping block is exactly its wrap width, so its edge follows
        // the side handle both ways (like Excalidraw's text boxes)
        width: wraps ? wrapWidth : undefined,
        opacity: pendingErase ? 0.3 : 1,
        // a dashed box tight around the text when selected, the same as
        // drawings and images; the resize handles sit on its edge
        outline: selected ? "1.5px dashed #4fb4f2" : undefined,
        outlineOffset: selected ? BOX_PAD : undefined,
        transition: GLIDE_TRANSITION, // see lib/glide
        // In draw mode, existing blocks shouldn't intercept clicks or steal
        // the crosshair cursor (e.g. via CodeMirror's own text cursor, or
        // the run button's cursor-pointer) — let strokes start and pass
        // straight through, the same as over empty canvas.
        pointerEvents: mode === "draw" ? "none" : undefined,
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
      {/* cover while not typing: drag to move; double-click to type (in
          text mode a single click does, like Excalidraw's text tool) */}
      {!editing && (mode === "select" || mode === "text") && (
        <div
          // the grab hand, like drawings and images
          className={`absolute inset-0 z-10 ${mode === "text" ? "cursor-text" : "cursor-grab active:cursor-grabbing"}`}
          onMouseDown={(e) =>
            handleDragMouseDown(e, mode === "text" ? (up) => startEditing(up.clientX, up.clientY) : undefined)
          }
          onDoubleClick={(e) => startEditing(e.clientX, e.clientY)}
        />
      )}

      {/* resize handles — while selected in select and text mode, for
          editors: grab the left/right edge of the box to change where lines
          wrap, or a corner dot to scale the text */}
      {onResize && selected && (mode === "select" || mode === "text") && (
        <>
          {(["left", "right"] as const).map((side) => (
            // an invisible strip along the box's edge line
            <div
              key={side}
              title="Drag to change where lines wrap"
              className="absolute z-20 cursor-ew-resize"
              style={{
                [side]: -BOX_PAD - HANDLE_SIZE / 2,
                top: -BOX_PAD,
                bottom: -BOX_PAD,
                width: HANDLE_SIZE,
              }}
              onPointerDown={(e) => handleResizePointerDown(e, side)}
            />
          ))}
          {CORNERS.map(({ handle, cursor }) => (
            // drawn like DrawingNode's handles, on the box's corners
            <div
              key={handle}
              title="Drag to resize the text"
              className="absolute rounded-sm border z-20"
              style={{
                [handle.includes("w") ? "left" : "right"]: -BOX_PAD - HANDLE_SIZE / 2,
                [handle.includes("n") ? "top" : "bottom"]: -BOX_PAD - HANDLE_SIZE / 2,
                width: HANDLE_SIZE,
                height: HANDLE_SIZE,
                background: isDark ? "#121212" : "#ffffff",
                borderColor: "#4fb4f2",
                cursor,
              }}
              onPointerDown={(e) => handleResizePointerDown(e, handle)}
            />
          ))}
        </>
      )}

      {/* hand mode overlay */}
      {mode === "hand" && <div className="absolute inset-0 z-10 cursor-grab" />}

      {/* play button — plain text has nothing to run */}
      {isRunnable(language) && (
        <div
          className={`absolute -left-5 top-1 opacity-0 group-hover:opacity-40 hover:opacity-100 cursor-pointer text-xs transition-opacity z-20 ${isDark ? "text-gray-400" : "text-gray-400"}`}
          onClick={() => onRun(id)}
        >
          ▶
        </div>
      )}

      {/* language picker — below the block (clear of the selection box) in
          select and text mode; always faintly visible, brighter on hover */}
      {(mode === "select" || mode === "text") && (
        <div
          // While the menu is open: fully opaque, or it would inherit the
          // fade; and raised above other blocks. The menu's own z-50 only
          // counts inside this wrapper, so at z-20 the next block's language
          // label (also z-20, later in the page) drew on top of the menu.
          className={`absolute -bottom-7 left-0 text-[11px] font-canvas opacity-40 group-hover:opacity-70 hover:opacity-100 has-[[data-state=open]]:opacity-100 transition-opacity z-20 has-[[data-state=open]]:z-50 ${isDark ? "text-gray-400" : "text-gray-500"}`}
        >
          {onLanguageChange ? (
            <AnimatedDropdown
              options={LANGUAGE_DROPDOWN_OPTIONS}
              value={language}
              onChange={(lang) => onLanguageChange(id, lang)}
              ariaLabel="Block language"
              menuClassName="text-xs"
            />
          ) : (
            languageOption(language).label
          )}
        </div>
      )}

      <CodeMirror
        ref={editorRef}
        value={initialContent}
        autoFocus={autoFocus}
        extensions={extensions}
        onFocus={() => {
          isFocused.current = true;
          setEditing(true);
          onEditingChange?.(true);
        }}
        onBlur={() => {
          isFocused.current = false;
          setEditing(false);
          onEditingChange?.(false);
        }}
        onChange={(val) => onChange(id, val)}
        onStatistics={(data) => {
          if (!containerRef.current) return;
          const selected = data.selectionCode.trim();
          const toSave = selected || content.trim();
          if (toSave) onSaveSelection?.(toSave, containerRef.current);
        }}
        basicSetup={basicSetup}
        placeholder="type here..."
      />

      {link && <LinkBadge link={link} isDark={isDark} />}
    </div>
  );
});

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type RefObject } from "react";
import type { Point } from "../components/DrawingNode";
import type { Language } from "../lib/languages";

// The block fields undo and copy/paste need — both canvas pages' node types
// have this shape.
export interface CanvasNode {
  id: string;
  x: number;
  y: number;
  content: string;
  type?: string;
  language?: Language;
  points?: Point[];
}

// One entry per undoable canvas action, holding what's needed to reverse it.
// Typing inside a block isn't tracked here — CodeMirror keeps its own undo
// history while the block is focused.
export type HistoryEntry =
  | { kind: "create"; id: string }
  | { kind: "delete"; nodes: CanvasNode[] } // one eraser drag can delete several
  | { kind: "move"; id: string; x: number; y: number }
  | { kind: "language"; id: string; language: Language; content: string }
  // a drawing's position and stroke before it was resized
  | { kind: "reshape"; id: string; x: number; y: number; content: string };

const MAX_HISTORY = 100;

// What a block copy puts on the system clipboard. Paste only treats the
// clipboard as a block if its text still matches, so copying something else
// in the meantime (here or in another app) pastes that instead.
function clipboardText(node: CanvasNode) {
  if (node.type === "draw" || !node.content.trim()) return "[free-form block]";
  return node.content;
}

// The page's undo stack. Called near the top of the page so its handlers can
// record each action as they do it; useCanvasShortcuts does the undoing.
export function useCanvasHistory(nodes: CanvasNode[]) {
  const stack = useRef<HistoryEntry[]>([]);
  // latest nodes, for handlers and listeners that can't read state
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const record = useCallback((entry: HistoryEntry) => {
    stack.current.push(entry);
    if (stack.current.length > MAX_HISTORY) stack.current.shift();
  }, []);

  const pop = useCallback(() => stack.current.pop(), []);

  // A restored block comes back from the server with a new id, so older
  // entries that still point at the deleted id get switched over to it.
  const remapId = useCallback((oldId: string, newId: string) => {
    stack.current = stack.current.map((e) =>
      "id" in e && e.id === oldId ? { ...e, id: newId } : e,
    );
  }, []);

  return useMemo(() => ({ nodesRef, record, pop, remapId }), [record, pop, remapId]);
}

export type CanvasHistory = ReturnType<typeof useCanvasHistory>;

// How the page carries an action out. These must not record history
// themselves when undo calls them — undo would then undo itself.
export interface CanvasOps {
  deleteNode: (id: string, record: boolean) => void;
  moveNode: (id: string, x: number, y: number, record: boolean) => void;
  applyLanguage: (id: string, language: Language, content: string) => void;
  applyShape: (id: string, x: number, y: number, content: string) => void;
  // saves a copy of a block at (x, y); resolves to its new id, or null on failure
  recreateBlock: (src: CanvasNode, x: number, y: number) => Promise<string | null>;
}

interface ShortcutOptions {
  enabled: boolean;
  history: CanvasHistory;
  ops: CanvasOps;
  canvasRef: RefObject<HTMLDivElement | null>;
  rootRef: RefObject<HTMLDivElement | null>;
}

// Ctrl+Z undo, plus click-to-select and Ctrl+C / Ctrl+V on blocks. Returns the
// selected block's id, and a ref the page keeps at the pointer's canvas
// position — that's where pastes land.
export function useCanvasShortcuts({ enabled, history, ops, canvasRef, rootRef }: ShortcutOptions) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clipboard = useRef<{ node: CanvasNode; text: string } | null>(null);
  const pointer = useRef({ x: 100, y: 100 });

  // The three handlers below are effect events: the listeners in the effect
  // are registered once, but these always see this render's `ops`,
  // `history` and `selectedId` — never a stale copy from an earlier render.

  const undo = useEffectEvent(async () => {
    const { deleteNode, moveNode, applyLanguage, applyShape, recreateBlock } = ops;
    const exists = (id: string) => history.nodesRef.current.some((n) => n.id === id);

    // Skip entries for blocks someone else has deleted since.
    let entry;
    while ((entry = history.pop())) {
      if (entry.kind === "create") {
        if (!exists(entry.id)) continue;
        deleteNode(entry.id, false);
      } else if (entry.kind === "move") {
        if (!exists(entry.id)) continue;
        moveNode(entry.id, entry.x, entry.y, false);
      } else if (entry.kind === "language") {
        if (!exists(entry.id)) continue;
        applyLanguage(entry.id, entry.language, entry.content);
      } else if (entry.kind === "reshape") {
        if (!exists(entry.id)) continue;
        applyShape(entry.id, entry.x, entry.y, entry.content);
      } else {
        for (const node of entry.nodes) {
          const newId = await recreateBlock(node, node.x, node.y);
          if (!newId) return;
          history.remapId(node.id, newId);
        }
      }
      return;
    }
  });

  const onCopy = useEffectEvent((e: ClipboardEvent) => {
    const node = history.nodesRef.current.find((n) => n.id === selectedId);
    const hasTextSelection = !!window.getSelection()?.toString();
    if (!node || hasTextSelection) {
      clipboard.current = null; // a normal text copy replaces any copied block
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const text = clipboardText(node);
    e.clipboardData?.setData("text/plain", text);
    clipboard.current = { node, text };
  });

  const onPaste = useEffectEvent(async (e: ClipboardEvent) => {
    const copied = clipboard.current;
    if (!copied || e.clipboardData?.getData("text/plain") !== copied.text) return;
    e.preventDefault();
    e.stopPropagation();
    (document.activeElement as HTMLElement | null)?.blur();
    const newId = await ops.recreateBlock(copied.node, pointer.current.x, pointer.current.y);
    if (!newId) return;
    history.record({ kind: "create", id: newId });
    setSelectedId(newId);
  });

  useEffect(() => {
    if (!enabled) return;

    function inEditor(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      return el?.tagName === "TEXTAREA" || el?.tagName === "INPUT" || !!el?.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== "z") return;
      // inside a block, Ctrl+Z undoes typing (CodeMirror's own history)
      if (inEditor(e.target)) return;
      e.preventDefault();
      undo();
    }

    // Capture phase, so this runs before CodeMirror's own copy handler —
    // with nothing selected, CodeMirror would otherwise copy the current line.
    const handleCopy = (e: ClipboardEvent) => onCopy(e);
    const handlePaste = (e: ClipboardEvent) => onPaste(e);

    // Clicking a block selects it; clicking empty canvas clears it. Capture
    // phase, because the blocks stop mousedown from bubbling.
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Element;
      const nodeEl = target.closest?.("[data-node-id]") as HTMLElement | null;
      if (nodeEl) setSelectedId(nodeEl.dataset.nodeId ?? null);
      else if (target === canvasRef.current || target === rootRef.current) setSelectedId(null);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("copy", handleCopy, true);
    window.addEventListener("paste", handlePaste, true);
    window.addEventListener("mousedown", onMouseDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("copy", handleCopy, true);
      window.removeEventListener("paste", handlePaste, true);
      window.removeEventListener("mousedown", onMouseDown, true);
    };
  }, [enabled, canvasRef, rootRef]);

  return { selectedId, pointer };
}

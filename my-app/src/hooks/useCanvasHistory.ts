import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type RefObject } from "react";
import type { Point } from "../components/DrawingNode";
import type { CanvasContextMenuProps } from "../components/CanvasContextMenu";
import type { Language } from "../lib/languages";
import { imageToDataUrl, IMAGE_DISPLAY_WIDTH } from "../lib/images";

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
  width?: number; // images only — how wide they're shown
  link?: string | null;
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
  | { kind: "reshape"; id: string; x: number; y: number; content: string }
  | { kind: "link"; id: string; link: string | null };

const MAX_HISTORY = 100;
// how far a duplicate lands from its original, so it doesn't hide under it
const DUPLICATE_OFFSET = 24;

// What a block copy puts on the system clipboard. Paste only treats the
// clipboard as a block if its text still matches, so copying something else
// in the meantime (here or in another app) pastes that instead.
function clipboardText(node: CanvasNode) {
  if (node.type === "draw" || node.type === "image" || !node.content.trim()) return "[free-form block]";
  return node.content;
}

function inEditor(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return el?.tagName === "TEXTAREA" || el?.tagName === "INPUT" || !!el?.isContentEditable;
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
  applyLink: (id: string, link: string | null) => void;
  // saves a copy of a block at (x, y); resolves to its new id, or null on failure
  recreateBlock: (src: CanvasNode, x: number, y: number) => Promise<string | null>;
}

interface ShortcutOptions {
  enabled: boolean;
  nodes: CanvasNode[];
  history: CanvasHistory;
  ops: CanvasOps;
  canvasRef: RefObject<HTMLDivElement | null>;
  rootRef: RefObject<HTMLDivElement | null>;
  onError?: (message: string) => void;
}

type ContextMenuProps = Omit<CanvasContextMenuProps, "isDark">;

// Everything you do to blocks from the keyboard or the right-click menu:
// select, undo, cut/copy/paste/duplicate/delete, links, and pasting text or
// images from outside the app. Returns the selected block's id, a ref the
// page keeps at the pointer's canvas position (where pastes land), and the
// right-click menu's props while it's open.
export function useCanvasShortcuts({ enabled, nodes, history, ops, canvasRef, rootRef, onError }: ShortcutOptions) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // `text` is null when the system clipboard couldn't be written (see copyNode)
  const clipboard = useRef<{ node: CanvasNode; text: string | null } | null>(null);
  const pointer = useRef({ x: 100, y: 100 });
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string | null; at: { x: number; y: number } } | null>(null);
  const rightDown = useRef<{ x: number; y: number } | null>(null);

  // ---- actions, shared by the keyboard and the menu ----

  async function placeCopy(src: CanvasNode, x: number, y: number) {
    const newId = await ops.recreateBlock(src, x, y);
    if (!newId) return;
    history.record({ kind: "create", id: newId });
    setSelectedId(newId);
  }

  // The menu has no copy event to write into, so it uses the Clipboard API,
  // which only exists on https or localhost. Without it, Ctrl+V trusts the
  // in-app copy instead of checking the system clipboard matches.
  function copyNode(node: CanvasNode) {
    const entry: { node: CanvasNode; text: string | null } = { node, text: clipboardText(node) };
    clipboard.current = entry;
    if (!navigator.clipboard?.writeText) entry.text = null;
    else navigator.clipboard.writeText(entry.text!).catch(() => (entry.text = null));
  }

  function setLink(node: CanvasNode, link: string | null) {
    if ((node.link ?? null) === link) return;
    history.record({ kind: "link", id: node.id, link: node.link ?? null });
    ops.applyLink(node.id, link);
  }

  // Text from outside becomes a text block; an image becomes an image block.
  async function pasteExternal(source: { image?: Blob; text?: string }, at: { x: number; y: number }) {
    try {
      if (source.image) {
        const { dataUrl, width } = await imageToDataUrl(source.image);
        const image = { id: "", ...at, type: "image", content: dataUrl, width: Math.min(width, IMAGE_DISPLAY_WIDTH) };
        await placeCopy(image, at.x, at.y);
      } else if (source.text) {
        await placeCopy({ id: "", ...at, content: source.text }, at.x, at.y);
      }
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Couldn't paste that.");
    }
  }

  // Menu paste has no paste event to read from, so it uses what was copied
  // in the app, or else asks the browser for the system clipboard.
  async function pasteFromMenu(at: { x: number; y: number }) {
    if (clipboard.current) return placeCopy(clipboard.current.node, at.x, at.y);
    try {
      for (const item of await navigator.clipboard.read()) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) return pasteExternal({ image: await item.getType(imageType) }, at);
      }
      const text = await navigator.clipboard.readText();
      if (text.trim()) return pasteExternal({ text }, at);
    } catch {
      onError?.("Your browser blocked reading the clipboard — press Ctrl+V instead.");
    }
  }

  // ---- keyboard, clipboard and mouse listeners ----
  // These are effect events: the listeners in the effect below are
  // registered once, but these always see this render's `ops`, `history`
  // and `selectedId` — never a stale copy from an earlier render.

  const undo = useEffectEvent(async () => {
    const { deleteNode, moveNode, applyLanguage, applyShape, applyLink, recreateBlock } = ops;
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
      } else if (entry.kind === "link") {
        if (!exists(entry.id)) continue;
        applyLink(entry.id, entry.link);
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

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    // inside a block or a text box, keys belong to the typing
    if (inEditor(e.target)) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (ctrl && !e.shiftKey && key === "z") {
      e.preventDefault();
      undo();
      return;
    }
    const node = history.nodesRef.current.find((n) => n.id === selectedId);
    if (!node) return;
    if (ctrl && key === "d") {
      e.preventDefault(); // the browser's own Ctrl+D bookmarks the page
      placeCopy(node, node.x + DUPLICATE_OFFSET, node.y + DUPLICATE_OFFSET);
    } else if (!ctrl && (e.key === "Delete" || e.key === "Backspace")) {
      ops.deleteNode(node.id, true);
      setSelectedId(null);
    }
  });

  // Ctrl+C / Ctrl+X on the selected block. Highlighted text copies as normal.
  const onCopyOrCut = useEffectEvent((e: ClipboardEvent) => {
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
    if (e.type === "cut") {
      ops.deleteNode(node.id, true);
      setSelectedId(null);
    }
  });

  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    const text = e.clipboardData?.getData("text/plain") ?? "";
    const copied = clipboard.current;
    if (copied && (copied.text === null || text === copied.text)) {
      e.preventDefault();
      e.stopPropagation();
      (document.activeElement as HTMLElement | null)?.blur();
      placeCopy(copied.node, pointer.current.x, pointer.current.y);
      return;
    }
    // inside a block or a text box, paste the normal way
    if (inEditor(e.target)) return;
    const image = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
    if (!image && !text.trim()) return;
    e.preventDefault();
    pasteExternal(image ? { image } : { text }, { ...pointer.current });
  });

  // Clicking a block selects it; clicking empty canvas clears it.
  // Right-clicking (without dragging) opens the menu.
  const onMouseDown = useEffectEvent((e: MouseEvent) => {
    const target = e.target as Element;
    if (target.closest?.("[data-context-menu]")) return;
    const nodeEl = target.closest?.("[data-node-id]") as HTMLElement | null;
    if (nodeEl) setSelectedId(nodeEl.dataset.nodeId ?? null);
    else if (target === canvasRef.current || target === rootRef.current) setSelectedId(null);
    if (e.button === 2) rightDown.current = { x: e.clientX, y: e.clientY };
  });

  const onMouseUp = useEffectEvent((e: MouseEvent) => {
    if (e.button !== 2) return;
    const start = rightDown.current;
    rightDown.current = null;
    // a right-click drag moves a text block — that's not a menu click
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;
    const target = e.target as Element;
    const nodeEl = target.closest?.("[data-node-id]") as HTMLElement | null;
    if (!nodeEl && target !== canvasRef.current && target !== rootRef.current) return; // e.g. the toolbar
    setMenu({ x: e.clientX, y: e.clientY, nodeId: nodeEl?.dataset.nodeId ?? null, at: { ...pointer.current } });
  });

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => onKeyDown(e);
    // Capture phase for copy/cut/paste, so these run before CodeMirror's own
    // handlers — with nothing selected, CodeMirror would copy the current line.
    const handleCopyOrCut = (e: ClipboardEvent) => onCopyOrCut(e);
    const handlePaste = (e: ClipboardEvent) => onPaste(e);
    // Capture phase for the mouse too, because blocks stop mousedown from bubbling.
    const handleMouseDown = (e: MouseEvent) => onMouseDown(e);
    const handleMouseUp = (e: MouseEvent) => onMouseUp(e);
    // our menu replaces the browser's on blocks and empty canvas
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest?.("[data-node-id]") || target === canvasRef.current || target === rootRef.current) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("copy", handleCopyOrCut, true);
    window.addEventListener("cut", handleCopyOrCut, true);
    window.addEventListener("paste", handlePaste, true);
    window.addEventListener("mousedown", handleMouseDown, true);
    window.addEventListener("mouseup", handleMouseUp, true);
    window.addEventListener("contextmenu", handleContextMenu, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("copy", handleCopyOrCut, true);
      window.removeEventListener("cut", handleCopyOrCut, true);
      window.removeEventListener("paste", handlePaste, true);
      window.removeEventListener("mousedown", handleMouseDown, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
      window.removeEventListener("contextmenu", handleContextMenu, true);
    };
  }, [enabled, canvasRef, rootRef]);

  // ---- the right-click menu ----

  const closeMenu = useCallback(() => setMenu(null), []);
  const menuNode = menu?.nodeId ? nodes.find((n) => n.id === menu.nodeId) : undefined;

  // Each action runs, then the menu closes.
  const contextMenu: ContextMenuProps | null = menu && {
    x: menu.x,
    y: menu.y,
    onBlock: !!menuNode,
    link: menuNode?.link ?? null,
    onCut: () => {
      if (menuNode) {
        copyNode(menuNode);
        ops.deleteNode(menuNode.id, true);
      }
      setMenu(null);
    },
    onCopy: () => {
      if (menuNode) copyNode(menuNode);
      setMenu(null);
    },
    onPaste: () => {
      pasteFromMenu(menu.at);
      setMenu(null);
    },
    onDuplicate: () => {
      if (menuNode) placeCopy(menuNode, menuNode.x + DUPLICATE_OFFSET, menuNode.y + DUPLICATE_OFFSET);
      setMenu(null);
    },
    onDelete: () => {
      if (menuNode) ops.deleteNode(menuNode.id, true);
      setMenu(null);
    },
    onSaveLink: (link) => {
      if (menuNode) setLink(menuNode, link);
      setMenu(null);
    },
    onClose: closeMenu,
  };

  return { selectedId, pointer, contextMenu };
}

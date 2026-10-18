import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type RefObject } from "react";
import type { Point } from "../components/DrawingNode";
import type { CanvasContextMenuProps } from "../components/CanvasContextMenu";
import type { Language } from "../lib/languages";
import { imageToDataUrl, IMAGE_DISPLAY_WIDTH } from "../lib/images";
import { detectLanguage } from "../lib/detectLanguage";
import { FONT_SIZE, measureCanvasText, splitLines } from "../lib/splitLines";

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
  // text blocks: where lines wrap (null: they don't) and font size (null: default)
  wrapWidth?: number | null;
  fontSize?: number | null;
}

// One entry per undoable canvas action, holding what's needed to reverse it.
// Typing inside a block isn't tracked here — CodeMirror keeps its own undo
// history while the block is focused.
export type HistoryEntry =
  | { kind: "create"; id: string }
  | { kind: "delete"; nodes: CanvasNode[] } // one eraser drag can delete several
  // `group` ties together the blocks of one multi-block drag, so a single
  // undo puts them all back
  | { kind: "move"; id: string; x: number; y: number; group?: number }
  | { kind: "language"; id: string; language: Language; content: string }
  // a drawing's position and stroke before it was resized
  | { kind: "reshape"; id: string; x: number; y: number; content: string }
  | { kind: "link"; id: string; link: string | null }
  // a text block's size (and position — resizing from the left/top moves it)
  // before its handles were dragged
  | { kind: "resize"; id: string; wrapWidth: number | null; fontSize: number | null; x: number; y: number }
  // a block split into one block per line: the block as it was, and the pieces
  | { kind: "split"; original: CanvasNode; ids: string[] };

const MAX_HISTORY = 100;
// Text pasted from outside wraps at this width instead of running off to the
// right as one long line (a paragraph from a web page is usually one line).
const PASTE_WRAP_WIDTH = 480;
// the narrowest wrap width the backend accepts (wrapWidthSchema)
const MIN_WRAP_WIDTH = 40;
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

  // The block you last created, moved, typed in or otherwise changed, for
  // "Scroll back to content". Every action that records history counts.
  const lastTouchedId = useRef<string | null>(null);
  const touch = useCallback((id: string) => {
    lastTouchedId.current = id;
  }, []);

  const record = useCallback((entry: HistoryEntry) => {
    stack.current.push(entry);
    if (stack.current.length > MAX_HISTORY) stack.current.shift();
    if ("id" in entry) lastTouchedId.current = entry.id;
  }, []);

  const pop = useCallback(() => stack.current.pop(), []);
  const peek = useCallback(() => stack.current[stack.current.length - 1], []);

  // A restored block comes back from the server with a new id, so older
  // entries that still point at the deleted id get switched over to it.
  const remapId = useCallback((oldId: string, newId: string) => {
    stack.current = stack.current.map((e) =>
      "id" in e && e.id === oldId ? { ...e, id: newId } : e,
    );
  }, []);

  return useMemo(
    () => ({ nodesRef, record, pop, peek, remapId, lastTouchedId, touch }),
    [record, pop, peek, remapId, touch],
  );
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
  applySize: (id: string, wrapWidth: number | null, fontSize: number | null) => void;
  // saves a copy of a block at (x, y); resolves to its new id, or null on failure
  recreateBlock: (src: CanvasNode, x: number, y: number) => Promise<string | null>;
  // puts deleted blocks back where they were, in as few requests as possible;
  // resolves to each one's new id (null for any that failed)
  restoreBlocks: (srcs: CanvasNode[]) => Promise<(string | null)[]>;
  // removes every run output, as part of "Delete all"
  clearOutputs: () => void;
}

interface ShortcutOptions {
  enabled: boolean;
  nodes: CanvasNode[];
  history: CanvasHistory;
  ops: CanvasOps;
  canvasRef: RefObject<HTMLDivElement | null>;
  rootRef: RefObject<HTMLDivElement | null>;
  onError?: (message: string) => void;
  // Whether a left-drag on empty canvas draws a selection box right now
  // (select mode, not space-panning, allowed to edit).
  canMarquee?: () => boolean;
}

// A selection box in screen pixels, from where the drag started to the pointer.
export interface Marquee {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type ContextMenuProps = Omit<CanvasContextMenuProps, "isDark">;

// Everything you do to blocks from the keyboard or the right-click menu:
// select (one or all), undo, cut/copy/paste/duplicate/delete, links, and
// pasting text or images from outside the app. Returns the selected blocks'
// ids, a ref the page keeps at the pointer's canvas position (where pastes
// land), and the right-click menu's props while it's open.
export function useCanvasShortcuts({ enabled, nodes, history, ops, canvasRef, rootRef, onError, canMarquee }: ShortcutOptions) {
  // Usually one block (a click); several after Select all. Copy, cut and
  // duplicate act on a single selected block only.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const setSelectedId = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);
  // `text` is null when the system clipboard couldn't be written (see copyNode)
  const clipboard = useRef<{ node: CanvasNode; text: string | null } | null>(null);
  const pointer = useRef({ x: 100, y: 100 });
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string | null; at: { x: number; y: number } } | null>(null);
  const rightDown = useRef<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  // "Delete all" asks first (it clears the board for everyone on a shared
  // canvas); this is true while the confirmation is showing.
  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false);
  // Pressing on a block that's part of a multi-selection keeps the group (so
  // dragging moves them all); if it turns out to be a plain click, it
  // narrows to that block on release, like Excalidraw.
  const pendingSingle = useRef<{ id: string; x: number; y: number } | null>(null);

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

  function selectAll() {
    setSelectedIds(history.nodesRef.current.map((n) => n.id));
  }

  // Deletes several blocks as one undo step (Ctrl+Z brings them all back).
  function deleteMany(ids: string[]) {
    const doomed = history.nodesRef.current.filter((n) => ids.includes(n.id));
    if (!doomed.length) return;
    for (const node of doomed) ops.deleteNode(node.id, false);
    history.record({ kind: "delete", nodes: doomed });
    setSelectedIds([]);
  }

  // Opens the confirmation for "Delete all" — if there's anything to delete.
  function requestDeleteAll() {
    if (history.nodesRef.current.length) setConfirmingDeleteAll(true);
  }

  // Clears the board: every block (undoable) and every run output.
  function deleteAll() {
    deleteMany(history.nodesRef.current.map((n) => n.id));
    ops.clearOutputs();
  }

  function setLink(node: CanvasNode, link: string | null) {
    if ((node.link ?? null) === link) return;
    history.record({ kind: "link", id: node.id, link: node.link ?? null });
    ops.applyLink(node.id, link);
  }

  // Text from outside becomes one block, exactly as copied. If it looks like
  // code it gets that language (see lib/detectLanguage); otherwise it's Plain
  // text, which wraps at PASTE_WRAP_WIDTH if a line is wider than that.
  // "Split into lines" breaks it up afterwards. An image becomes an image block.
  async function pasteExternal(source: { image?: Blob; text?: string }, at: { x: number; y: number }) {
    try {
      if (source.image) {
        const { dataUrl, width } = await imageToDataUrl(source.image);
        const image = { id: "", ...at, type: "image", content: dataUrl, width: Math.min(width, IMAGE_DISPLAY_WIDTH) };
        await placeCopy(image, at.x, at.y);
      } else if (source.text) {
        const language = detectLanguage(source.text);
        // code keeps each line whole, however long
        const tooWide = language === "text" && source.text.split("\n").some((l) => measureCanvasText(l) > PASTE_WRAP_WIDTH);
        const note = { id: "", ...at, content: source.text, language, wrapWidth: tooWide ? PASTE_WRAP_WIDTH : null };
        await placeCopy(note, at.x, at.y);
      }
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Couldn't paste that.");
    }
  }

  // "Split into lines": the block becomes one block per line, laid out where
  // its lines were (see lib/splitLines). One undo puts the original back.
  async function splitNode(node: CanvasNode) {
    // laid out at the default font size, then scaled to the block's
    const scale = (node.fontSize ?? FONT_SIZE) / FONT_SIZE;
    const pieces = splitLines(node.content, (node.wrapWidth ?? Infinity) / scale, measureCanvasText);
    if (pieces.length < 2) return;
    const parts = pieces.map((p) => ({
      ...node,
      id: "",
      content: p.content,
      x: node.x + p.dx * scale,
      y: node.y + p.dy * scale,
      wrapWidth: p.wrapWidth === null ? null : Math.max(p.wrapWidth * scale, MIN_WRAP_WIDTH),
    }));
    const ids = await ops.restoreBlocks(parts);
    const made = ids.filter((id): id is string => id !== null);
    if (made.length < ids.length) {
      // a half-done split would lose lines once the original is gone
      for (const id of made) ops.deleteNode(id, false);
      return;
    }
    ops.deleteNode(node.id, false);
    history.record({ kind: "split", original: node, ids: made });
    setSelectedIds(made);
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
    const { deleteNode, moveNode, applyLanguage, applyShape, applyLink, applySize, restoreBlocks } = ops;
    const exists = (id: string) => history.nodesRef.current.some((n) => n.id === id);

    // Skip entries for blocks someone else has deleted since.
    let entry;
    while ((entry = history.pop())) {
      if (entry.kind === "create") {
        if (!exists(entry.id)) continue;
        deleteNode(entry.id, false);
      } else if (entry.kind === "move") {
        const group = entry.group;
        if (exists(entry.id)) moveNode(entry.id, entry.x, entry.y, false);
        // the rest of a multi-block drag goes back in the same undo
        let next;
        while (group !== undefined && (next = history.peek())?.kind === "move" && next.group === group) {
          history.pop();
          if (exists(next.id)) moveNode(next.id, next.x, next.y, false);
        }
        if (!exists(entry.id) && group === undefined) continue;
      } else if (entry.kind === "language") {
        if (!exists(entry.id)) continue;
        applyLanguage(entry.id, entry.language, entry.content);
      } else if (entry.kind === "reshape") {
        if (!exists(entry.id)) continue;
        applyShape(entry.id, entry.x, entry.y, entry.content);
      } else if (entry.kind === "link") {
        if (!exists(entry.id)) continue;
        applyLink(entry.id, entry.link);
      } else if (entry.kind === "resize") {
        if (!exists(entry.id)) continue;
        applySize(entry.id, entry.wrapWidth, entry.fontSize);
        moveNode(entry.id, entry.x, entry.y, false);
      } else if (entry.kind === "split") {
        // the pieces go and the block they came from comes back
        for (const id of entry.ids) if (exists(id)) deleteNode(id, false);
        const [newId] = await restoreBlocks([entry.original]);
        if (newId) history.remapId(entry.original.id, newId);
      } else {
        // one request for the lot (a big "Delete all" would otherwise hit
        // the per-minute create limit one block at a time)
        const newIds = await restoreBlocks(entry.nodes);
        entry.nodes.forEach((node, i) => {
          const newId = newIds[i];
          if (newId) history.remapId(node.id, newId);
        });
      }
      return;
    }
  });

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    // inside a block or a text box, keys belong to the typing
    if (inEditor(e.target)) return;
    // while the Delete all confirmation is open, keys belong to it
    if (confirmingDeleteAll) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (ctrl && !e.shiftKey && key === "z") {
      e.preventDefault();
      undo();
      return;
    }
    if (ctrl && key === "a") {
      e.preventDefault(); // instead of highlighting the whole page
      selectAll();
      return;
    }
    if (ctrl && e.key === "Backspace") {
      e.preventDefault();
      requestDeleteAll();
      return;
    }
    if (!ctrl && selectedIds.length > 1 && (e.key === "Delete" || e.key === "Backspace")) {
      deleteMany(selectedIds);
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
  // Drag on empty canvas: everything the box touches gets selected, live as
  // the box grows (Shift adds to what's already selected).
  function startMarquee(e: MouseEvent) {
    const x0 = e.clientX;
    const y0 = e.clientY;
    const keep = e.shiftKey ? selectedIds : [];
    // blocks don't move during the drag, so measure them once
    const rects = [...document.querySelectorAll<HTMLElement>("[data-node-id]")]
      .filter((el) => history.nodesRef.current.some((n) => n.id === el.dataset.nodeId))
      .map((el) => ({ id: el.dataset.nodeId!, r: el.getBoundingClientRect() }));
    let frame = 0;
    let latest: Marquee = { x0, y0, x1: x0, y1: y0 };

    function update() {
      frame = 0;
      setMarquee(latest);
      const left = Math.min(latest.x0, latest.x1);
      const right = Math.max(latest.x0, latest.x1);
      const top = Math.min(latest.y0, latest.y1);
      const bottom = Math.max(latest.y0, latest.y1);
      if (right - left < 4 && bottom - top < 4) return; // still just a click
      const hit = rects
        .filter(({ r }) => r.right > left && r.left < right && r.bottom > top && r.top < bottom)
        .map(({ id }) => id);
      setSelectedIds([...new Set([...keep, ...hit])]);
    }
    function onMove(mv: MouseEvent) {
      latest = { x0, y0, x1: mv.clientX, y1: mv.clientY };
      if (!frame) frame = requestAnimationFrame(update);
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      cancelAnimationFrame(frame);
      update();
      setMarquee(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const onMouseDown = useEffectEvent((e: MouseEvent) => {
    const target = e.target as Element;
    if (target.closest?.("[data-context-menu]")) return;
    const nodeEl = target.closest?.("[data-node-id]") as HTMLElement | null;
    const nodeId = nodeEl?.dataset.nodeId ?? null;
    if (nodeId && e.button === 0 && e.shiftKey) {
      // Shift+click adds or removes one block
      setSelectedIds((ids) => (ids.includes(nodeId) ? ids.filter((i) => i !== nodeId) : [...ids, nodeId]));
    } else if (nodeId && selectedIds.length > 1 && selectedIds.includes(nodeId)) {
      if (e.button === 0) pendingSingle.current = { id: nodeId, x: e.clientX, y: e.clientY };
    } else if (nodeId) {
      setSelectedId(nodeId);
    } else if (target === canvasRef.current || target === rootRef.current) {
      // a right-click keeps the selection, so its menu can act on it
      if (!e.shiftKey && e.button !== 2) setSelectedId(null);
      if (e.button === 0 && canMarquee?.()) startMarquee(e);
    } else if (target.closest?.("[data-output-id]")) {
      setSelectedId(null); // a run output has its own selection (see OutputBubble)
    }
    if (e.button === 2) rightDown.current = { x: e.clientX, y: e.clientY };
  });

  const onMouseUp = useEffectEvent((e: MouseEvent) => {
    const single = pendingSingle.current;
    pendingSingle.current = null;
    if (e.button === 0 && single && Math.hypot(e.clientX - single.x, e.clientY - single.y) <= 3) {
      setSelectedId(single.id);
    }
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
  // What the menu's Delete removes: the whole selection when several blocks
  // are selected and you right-clicked one of them or empty canvas (like
  // Excalidraw); otherwise just the block you right-clicked.
  const deleteTargets =
    selectedIds.length > 1 && (!menuNode || selectedIds.includes(menuNode.id))
      ? selectedIds
      : menuNode
        ? [menuNode.id]
        : [];

  // Each action runs, then the menu closes.
  const contextMenu: ContextMenuProps | null = menu && {
    x: menu.x,
    y: menu.y,
    onBlock: !!menuNode,
    deleteCount: deleteTargets.length,
    link: menuNode?.link ?? null,
    // a text or code block with more than one line
    onSplit:
      menuNode && menuNode.type !== "draw" && menuNode.type !== "image" && menuNode.content.trim().includes("\n")
        ? () => {
            splitNode(menuNode);
            setMenu(null);
          }
        : undefined,
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
      if (deleteTargets.length === 1) ops.deleteNode(deleteTargets[0], true);
      else deleteMany(deleteTargets); // one undo step for the lot
      setMenu(null);
    },
    onSaveLink: (link) => {
      if (menuNode) setLink(menuNode, link);
      setMenu(null);
    },
    onSelectAll: () => {
      selectAll();
      setMenu(null);
    },
    onDeleteAll: () => {
      requestDeleteAll();
      setMenu(null);
    },
    onClose: closeMenu,
  };

  // The Delete all confirmation's props while it's showing.
  const deleteAllPrompt = confirmingDeleteAll
    ? {
        count: nodes.length,
        onConfirm: () => {
          setConfirmingDeleteAll(false);
          deleteAll();
        },
        onCancel: () => setConfirmingDeleteAll(false),
      }
    : null;

  return { selectedIds, pointer, contextMenu, marquee, deleteAllPrompt };
}

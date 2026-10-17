import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import { Pencil, Shapes } from "lucide-react";
import { motion } from "motion/react";
import { useParams, useNavigate } from "react-router-dom";
import { detectShape } from "./lib/shapeDetection";
import { parsePoints } from "./lib/points";
import { saveErrorMessage } from "./lib/saveErrors";
import FloatingNode from "./components/FloatingNode";
import DrawingNode, { type Point } from "./components/DrawingNode";
import ImageNode from "./components/ImageNode";
import CanvasContextMenu from "./components/CanvasContextMenu";
import ConfirmDialog from "./components/ConfirmDialog";
import RemoteCursorMarker from "./components/RemoteCursorMarker";
import OutputBubble from "./components/OutputBubble";
import EraserTrail from "./components/EraserTrail";
import ScrollToContent from "./components/ScrollToContent";
import { ThemeToggleButton } from "./components/ThemeToggle";
import ShareDrawer from "./components/ShareDrawer";
import PresenceMenu from "./components/PresenceMenu";
import socket from "./lib/socket";
import { useCallback } from "react";

import {
  getAllBlocks,
  createBlock,
  createDrawingBlock,
  createBlockFrom,
  updateBlockPosition,
  deleteBlock,
  updateBlockContent,
  updateBlockLanguage,
  updateBlockLink,
  updateBlockSize,
  restoreBlocks as restoreBlocksApi,
} from "./API/block";
import { createKeyedThrottle } from "./lib/throttle";
import { chunkForRestore, toRestorePayload } from "./lib/restore";
import { LANGUAGE_OPTIONS, isRunnable, languageOption, type Language } from "./lib/languages";
import { requestRun } from "./lib/runCode";
import { type Output, makeRunKey, isAlreadyShown, placeOutput } from "./lib/runOutputs";
import { getMe } from "./API/auth";
import { useCanvasHistory, useCanvasShortcuts, type CanvasNode } from "./hooks/useCanvasHistory";
import { useFreehandStroke } from "./hooks/useFreehandStroke";
import "./App.css";

export type Mode = "select" | "hand" | "text" | "erase" | "draw";

// a block as this page holds it — see hooks/useCanvasHistory
type Node = CanvasNode;

interface RemoteCursor {
  userId: string;
  username: string;
  x: number;
  y: number;
}

// draw blocks store their stroke as a JSON-encoded points array in `content`
function blockToNode(b: any): Node {
  const common = { id: b.id, x: b.x, y: b.y, content: b.content, link: b.link ?? null };
  if (b.type === "draw") return { ...common, type: "draw", points: parsePoints(b.content) ?? [] };
  if (b.type === "image") return { ...common, type: "image", width: b.width };
  return { ...common, language: b.language, wrapWidth: b.wrap_width ?? null, fontSize: b.font_size ?? null };
}

const CURSOR_COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];
function getCursorColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

// Separate memoized component so cursor updates only re-render this subtree,
// not the FloatingNodes above it.
const RemoteCursors = React.memo(function RemoteCursors({
  cursors,
  mySocketId,
}: {
  cursors: Map<string, RemoteCursor>;
  mySocketId: string | undefined;
}) {
  return (
    <>
      {Array.from(cursors.values())
        .filter((c) => c.userId !== mySocketId)
        .map((cursor) => (
          <RemoteCursorMarker
            key={cursor.userId}
            x={cursor.x}
            y={cursor.y}
            username={cursor.username}
            color={getCursorColor(cursor.userId)}
          />
        ))}
    </>
  );
});

export default function App() {
  const { canvasId } = useParams<{ canvasId: string }>();
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const clearOutputs = useCallback(() => setOutputs([]), []);
  const nextId = useRef(1);
  // Latest outputs for the run handlers (the Ctrl+Enter listener is registered
  // once, so it can't read state), and runs still waiting on a result.
  const outputsRef = useRef<Output[]>([]);
  const pendingRunKeys = useRef(new Set<string>());
  const contentSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Live socket updates while dragging/resizing, at most every 40ms per block
  // (the rate drags already send at), always ending on the final value.
  const [emitThrottle] = useState(() => createKeyedThrottle(40));
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const [mode, setMode] = useState<Mode>("select");
  // The block just made by a text click — it opens with the cursor in it.
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const lastTextCreate = useRef(0);
  // While the cursor is in a block the toolbar shows T, whatever the mode.
  const [editingText, setEditingText] = useState(false);
  const activeTool: Mode = editingText ? "text" : mode;
  const modeRef = useRef<Mode>("select");
  const stroke = useFreehandStroke();
  const [snapShapes, setSnapShapes] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [pendingErase, setPendingErase] = useState<Set<string>>(new Set());
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(new Map());
  // everyone in the room right now, from the server's "presence" broadcasts
  const [people, setPeople] = useState<{ userId: string; username: string }[]>([]);
  const lastCursorEmit = useRef(0);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const errorToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { resolvedTheme } = useTheme();
  const lastSelection = useRef<{
    content: string;
    el: HTMLElement;
  } | null>(null);
  const spaceHeld = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const isMouseDown = useRef(false);
  // Whether the left button is held, for erase-by-sweeping. Tracked on the
  // window in the capture phase: blocks stop mousedown from bubbling, so a
  // press that started on a block never reached the canvas, and sweeping on
  // from it erased nothing but that first block.
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (e.button === 0) isMouseDown.current = true;
    };
    const up = (e: MouseEvent) => {
      if (e.button === 0) isMouseDown.current = false;
    };
    window.addEventListener("mousedown", down, true);
    window.addEventListener("mouseup", up, true);
    return () => {
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("mouseup", up, true);
    };
  }, []);
  // undo stack — see hooks/useCanvasHistory
  const history = useCanvasHistory(nodes);
  // each drawing being resized right now -> how it looked before the drag
  const resizeStart = useRef<Record<string, Node>>({});

  // flush pending erase on mouseup
  useEffect(() => {
    function onMouseUp() {
      if (pendingErase.size === 0) return;
      const erased = history.nodesRef.current.filter((n) => pendingErase.has(n.id));
      if (erased.length > 0) history.record({ kind: "delete", nodes: erased });
      pendingErase.forEach(id => deleteNode(id, false));
      setPendingErase(new Set());
    }
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [pendingErase]);

  // keep refs in sync
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (!canvasId) return;

    // `on`, not `once`: a reconnect (network blip, server restart) is a new
    // server-side socket that isn't in any room, so rejoin every time.
    const joinCanvas = () => {
      socket.emit("canvas:join", canvasId, (res: { ok: boolean; error?: string }) => {
        if (res.ok) console.log("[socket] joined canvas:", canvasId);
        else console.error("[socket] canvas:join failed:", res.error);
      });
    };

    socket.on("connect", joinCanvas);
    // fresh handshake on every canvas visit, so it carries the current cookie
    socket.connect();

    // fetch canvas metadata to get share_id
    fetch(`/api/canvases/${canvasId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setShareId(data.share_id));

    getMe()
      .then((me) => setIsGuest(!!me?.isGuest))
      .catch(() => {});

    // load blocks from DB on mount
    getAllBlocks(canvasId).then(({ data }) => {
      setNodes(data.map(blockToNode));
    });

    // someone else created a block
    socket.on("block:created", (block) => {
      console.log("[socket] received block:created", block);
      setNodes((prev) => [...prev, blockToNode(block)]);
    });

    // someone else moved a block
    socket.on("block:moved", (data) => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === data.id ? { ...n, x: data.x, y: data.y } : n,
        ),
      );
    });

    // someone else typed in a block
    socket.on("block:updated", (data) => {
      console.log("[socket] received block:updated", data);
      setNodes((prev) => {
        console.log(
          "[socket] current node ids",
          prev.map((n) => n.id),
        );
        return prev.map((n) =>
          n.id === data.id
            ? {
                ...n,
                content: "content" in data ? data.content : n.content,
                language: data.language ?? n.language,
                // a drawing's stroke lives in its content (e.g. after a resize)
                points: n.type === "draw" && "content" in data ? parsePoints(data.content) ?? n.points : n.points,
                link: "link" in data ? data.link : n.link,
                wrapWidth: "wrapWidth" in data ? data.wrapWidth : n.wrapWidth,
                fontSize: "fontSize" in data ? data.fontSize : n.fontSize,
              }
            : n,
        );
      });
    });

    // someone else deleted a block
    socket.on("block:deleted", (blockId) => {
      setNodes((prev) => prev.filter((n) => n.id !== blockId));
    });

    socket.on("cursor:move", (data: RemoteCursor) => {
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        next.set(data.userId, data);
        return next;
      });
    });

    socket.on("cursor:leave", ({ userId }: { userId: string }) => {
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    });

    socket.on("presence", (list: { userId: string; username: string }[]) => {
      setPeople(list);
    });

    // cleanup when you leave the page
    return () => {
      socket.off("presence");
      setPeople([]);
      socket.off("connect", joinCanvas);
      socket.off("block:created");
      socket.off("block:moved");
      socket.off("block:updated");
      socket.off("block:deleted");
      socket.off("cursor:move");
      socket.off("cursor:leave");
      socket.disconnect();
    };
  }, [canvasId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = (e.target as HTMLElement)?.isContentEditable;
      const inEditor = tag === "TEXTAREA" || tag === "INPUT" || isEditable;

      if (e.code === "Space" && !e.repeat && !inEditor) {
        e.preventDefault();
        spaceHeld.current = true;
        document.body.style.cursor = "grab";
      }

      // mode shortcuts — only outside editors
      if (!inEditor && !e.ctrlKey && !e.metaKey && !e.repeat) {
        if (e.key === "v" || e.key === "V") setMode("select");
        if (e.key === "h" || e.key === "H") setMode("hand");
        if (e.key === "t" || e.key === "T") setMode("text");
        if (e.key === "e" || e.key === "E") setMode("erase");
        if (e.key === "d" || e.key === "D") setMode("draw");
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        spaceHeld.current = false;
        document.body.style.cursor = "";
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  async function finalizeDrawing(rawPoints: Point[]) {
    if (rawPoints.length < 2 || !canvasId) return;
    const points = snapShapes ? detectShape(rawPoints) ?? rawPoints : rawPoints;
    const minX = Math.min(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxX = Math.max(...points.map((p) => p.x));
    const relPoints = points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
    try {
      const { data } = await createDrawingBlock(
        canvasId,
        minX,
        minY,
        Math.max(maxX - minX, 1),
        JSON.stringify(relPoints),
      );
      const node = blockToNode(data);
      setNodes((prev) => [...prev, node]);
      socket.emit("block:created", canvasId, data);
      history.record({ kind: "create", id: node.id });
    } catch (err) {
      showError(saveErrorMessage(err, "Couldn't save your drawing — check your connection and try again."));
    }
  }

  // The canvas layer is only ever sized to the viewport, then visually
  // shifted with translate/scale to pan and zoom — it never grows, so
  // panning far or zooming out leaves parts of the screen outside its box
  // entirely. A click there lands on the root background instead, so both
  // spots have to count as "empty canvas" or actions silently stop working
  // the moment you're not near the origin.
  function isCanvasBackground(e: React.MouseEvent) {
    return e.target === canvasRef.current || e.target === rootRef.current;
  }

  function handleDrawPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (mode !== "draw" || e.button !== 0 || !isCanvasBackground(e)) return;
    stroke.start(
      e,
      (cx, cy) => ({ x: (cx - offsetRef.current.x) / scaleRef.current, y: (cy - offsetRef.current.y) / scaleRef.current }),
      finalizeDrawing,
    );
  }

  // Works like Excalidraw's text tool: a click makes a block with the cursor
  // already in it and switches back to select, so the next click elsewhere
  // just finishes typing. Double-clicking empty canvas makes another.
  async function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (mode !== "text") return;
    if (!isCanvasBackground(e)) return;
    await createTextBlock(e.clientX, e.clientY);
  }

  async function handleCanvasDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (mode !== "select" && mode !== "text") return;
    if (!isCanvasBackground(e)) return;
    await createTextBlock(e.clientX, e.clientY);
  }

  async function createTextBlock(clientX: number, clientY: number) {
    if (!canvasId) return;
    const x = (clientX - offset.x) / scale;
    const y = (clientY - offset.y) / scale;
    // A double-click in text mode is a click (makes a block) followed by a
    // dblclick — don't let that second event make another one on top of it.
    const now = performance.now();
    if (now - lastTextCreate.current < 500) return;
    lastTextCreate.current = now;
    setMode("select");
    try {
      const { data } = await createBlock(canvasId, x, y);
      // New blocks start as plain text. The create endpoint ignores language,
      // so set it in a follow-up call (the same one the language picker uses).
      // If that fails the block already exists — keep it with its default
      // language rather than losing it behind an error.
      const language = await updateBlockLanguage(canvasId, data.id, "text")
        .then(() => "text" as const)
        .catch(() => data.language);
      const block = { ...data, language };
      setFocusNodeId(block.id);
      setNodes((prev) => [
        ...prev,
        { id: block.id, x: block.x, y: block.y, content: block.content, language: block.language },
      ]);
      console.log("[socket] emitting block:created", block);
      socket.emit("block:created", canvasId, block);
      history.record({ kind: "create", id: data.id });
    } catch (err) {
      showError(saveErrorMessage(err, "Couldn't create the block — check your connection and try again."));
    }
  }

  function applyZoom(newScale: number) {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    setOffset((prev) => ({
      x: cx - (cx - prev.x) * (newScale / scaleRef.current),
      y: cy - (cy - prev.y) * (newScale / scaleRef.current),
    }));
    setScale(newScale);
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    setOffset((prev) => ({
      x: prev.x - e.deltaX,
      y: prev.y - e.deltaY,
    }));
  }

  function zoomIn() {
    applyZoom(Math.min(+(scaleRef.current + 0.1).toFixed(1), 3));
  }

  function zoomOut() {
    applyZoom(Math.max(+(scaleRef.current - 0.1).toFixed(1), 0.2));
  }

  function handlePanStart(e: React.MouseEvent) {
    const isMiddle = e.button === 1;
    const isSpaceDrag = e.button === 0 && spaceHeld.current;
    const isHandMode = e.button === 0 && modeRef.current === "hand";
    if (!isMiddle && !isSpaceDrag && !isHandMode) return;
    e.preventDefault();
    document.body.style.cursor = "grabbing";
    const startX = e.clientX - offsetRef.current.x;
    const startY = e.clientY - offsetRef.current.y;

    function onMouseMove(e: MouseEvent) {
      setOffset({ x: e.clientX - startX, y: e.clientY - startY });
    }
    function onMouseUp() {
      const m = modeRef.current;
      document.body.style.cursor =
        spaceHeld.current || m === "hand" ? "grab" : "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  useEffect(() => {
    outputsRef.current = outputs;
  }, [outputs]);

  // Runs code and adds its output, following lib/runOutputs: re-running
  // unchanged code whose output is still showing does nothing, and changed code
  // puts its output beside the previous one instead of on top of it.
  const runAndPlace = useCallback(
    async (sourceId: string | undefined, code: string, language: string, anchor: { x: number; y: number }) => {
      if (!isRunnable(language)) return;
      const runKey = sourceId ? makeRunKey(sourceId, language, code) : undefined;
      if (runKey) {
        if (pendingRunKeys.current.has(runKey) || isAlreadyShown(outputsRef.current, runKey)) return;
        pendingRunKeys.current.add(runKey);
      }
      try {
        const { output, error } = await requestRun(socket, code, language);
        const id = nextId.current++;
        setOutputs((prev) => {
          const { x, y } = placeOutput(prev, sourceId, anchor, scaleRef.current);
          return [...prev, { id, x, y, text: output, isError: error, sourceId, runKey }];
        });
      } finally {
        if (runKey) pendingRunKeys.current.delete(runKey);
      }
    },
    [],
  );

  useEffect(() => {
    async function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey && e.key === "Enter")) return;

      let code = "";
      let x = 200;
      let y = 100;

      if (lastSelection.current) {
        code = lastSelection.current.content;
        const rect = lastSelection.current.el.getBoundingClientRect();
        x = rect.right + 20;
        y = rect.top;
      } else {
        const selection = window.getSelection();
        code = selection?.toString().trim() ?? "";
        const rect = selection?.getRangeAt(0)?.getBoundingClientRect();
        x = (rect?.right ?? 200) + 20;
        y = rect?.top ?? 100;
      }

      if (!code || !socket.id) return;

      // The block the code came from carries its language as a data attribute
      // (this listener is registered once, so it can't read `nodes` state).
      const sourceEl = lastSelection.current
        ? lastSelection.current.el
        : window.getSelection()?.anchorNode?.parentElement?.closest<HTMLElement>("[data-node-id]");
      const language = sourceEl?.dataset.language ?? "javascript";

      // x/y above are screen coordinates; outputs live in canvas coordinates.
      const anchor = {
        x: (x - offsetRef.current.x) / scaleRef.current,
        y: (y - offsetRef.current.y) / scaleRef.current,
      };
      await runAndPlace(sourceEl?.dataset.nodeId, code, language, anchor);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [runAndPlace]);

  // useCallback keeps the same function reference between renders.
  // Without it, App re-rendering (e.g. from a cursor:move) would create a new
  // function every time → FloatingNode's React.memo would see a changed prop
  // and re-render even though the node data didn't change.
  // With useCallback: same canvasId → same function reference → memo skips re-render.
  const updateNode = useCallback((id: string, content: string) => {
    history.touch(id);
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n)));
    if (contentSaveTimer.current) clearTimeout(contentSaveTimer.current);
    contentSaveTimer.current = setTimeout(() => {
      if (canvasId) {
        updateBlockContent(canvasId, id, content).catch((err) =>
          showError(saveErrorMessage(err, "Couldn't save your changes — check your connection and try again.")),
        );
        console.log("[socket] emitting block:updated", { id, content });
        socket.emit("block:updated", canvasId, { id, content });
      }
    }, 800);
  }, [canvasId, history]);

  // `record` is false when undo itself is doing the move/delete, so undoing
  // doesn't push a new history entry.
  const moveNode = useCallback((id: string, x: number, y: number, record = true, group?: number) => {
    // A drag calls this many times; only its first call (no save pending
    // yet) records where the block started.
    if (record && !moveSaveTimers.current[id]) {
      const before = history.nodesRef.current.find((n) => n.id === id);
      if (before) history.record({ kind: "move", id, x: before.x, y: before.y, group });
    }
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
    if (!canvasId) return;
    // Other viewers see the drag live (throttled, ending on the final
    // position); only the DB write is debounced, since only the settled
    // position needs to be persisted.
    emitThrottle(`move:${id}`, () => socket.emit("block:moved", canvasId, { id, x, y }));
    clearTimeout(moveSaveTimers.current[id]);
    moveSaveTimers.current[id] = setTimeout(() => {
      delete moveSaveTimers.current[id];
      updateBlockPosition(canvasId, id, x, y);
    }, 300);
  }, [canvasId, history]);

  const deleteNode = useCallback((id: string, record = true) => {
    const node = history.nodesRef.current.find((n) => n.id === id);
    if (record && node) history.record({ kind: "delete", nodes: [node] });
    setNodes((prev) => prev.filter((n) => n.id !== id));
    if (canvasId) {
      deleteBlock(canvasId, id);
      socket.emit("block:deleted", canvasId, id);
    }
  }, [canvasId, history]);

  // Sets a drawing's position and stroke (its content) — for resizing and
  // for undoing a resize. `save` is false for the in-between frames of a drag.
  const applyShape = useCallback((id: string, x: number, y: number, content: string, save = true) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y, content, points: JSON.parse(content) } : n)));
    if (!canvasId) return;
    socket.emit("block:moved", canvasId, { id, x, y });
    socket.emit("block:updated", canvasId, { id, content });
    if (save) {
      updateBlockPosition(canvasId, id, x, y);
      updateBlockContent(canvasId, id, content);
    }
  }, [canvasId]);

  // One drag of a drawing's resize handle: every call shows the new shape
  // here and to everyone else; the last one (done) saves it and records a
  // single undo step back to the shape it started from.
  const resizeDrawing = useCallback((id: string, x: number, y: number, points: Point[], done: boolean) => {
    if (!resizeStart.current[id]) {
      const before = history.nodesRef.current.find((n) => n.id === id);
      if (before) resizeStart.current[id] = before;
    }
    applyShape(id, x, y, JSON.stringify(points), done);
    if (!done) return;
    const before = resizeStart.current[id];
    delete resizeStart.current[id];
    if (before) history.record({ kind: "reshape", id, x: before.x, y: before.y, content: before.content });
  }, [history, applyShape]);

  // Saves a copy of a block as a brand-new block at (x, y) — for paste and
  // for undoing a delete. The server hands back a new id.
  function showError(message: string) {
    setErrorToast(message);
    if (errorToastTimer.current) clearTimeout(errorToastTimer.current);
    errorToastTimer.current = setTimeout(() => setErrorToast(null), 4000);
  }

  // Sets a text block's wrap width and font size — for its handles and for
  // undo. `save` is false for the in-between frames of a drag.
  const applySize = useCallback((id: string, wrapWidth: number | null, fontSize: number | null, save = true) => {
    const node = history.nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, wrapWidth, fontSize } : n)));
    if (!canvasId) return;
    // just the size (not the content again), throttled while dragging and
    // sent right away for the final one
    emitThrottle(`size:${id}`, () => socket.emit("block:updated", canvasId, { id, wrapWidth, fontSize }), save);
    if (save) {
      updateBlockSize(canvasId, id, { wrapWidth, fontSize }).catch((err) =>
        showError(saveErrorMessage(err, "Couldn't save the new size — check your connection and try again.")),
      );
    }
  }, [canvasId, history]);

  // One drag of a text block's handles: every call shows the new size here
  // and to everyone else; the last one (done) saves it and records a single
  // undo step back to the size it started at.
  const textResizeStart = useRef<Record<string, { wrapWidth: number | null; fontSize: number | null; x: number; y: number }>>({});
  const resizeText = useCallback((id: string, wrapWidth: number | null, fontSize: number | null, x: number, y: number, done: boolean) => {
    const before = history.nodesRef.current.find((n) => n.id === id);
    if (!textResizeStart.current[id] && before) {
      textResizeStart.current[id] = { wrapWidth: before.wrapWidth ?? null, fontSize: before.fontSize ?? null, x: before.x, y: before.y };
    }
    applySize(id, wrapWidth, fontSize, done);
    // resizing from the left or top moves the block (one undo step with the resize)
    if (before && (before.x !== x || before.y !== y)) moveNode(id, x, y, false);
    if (!done) return;
    const start = textResizeStart.current[id];
    delete textResizeStart.current[id];
    if (start) history.record({ kind: "resize", id, ...start });
  }, [history, applySize, moveNode]);

  // Sets or removes a block's link — for the right-click menu and for undo.
  const applyLink = useCallback((id: string, link: string | null) => {
    const node = history.nodesRef.current.find((n) => n.id === id);
    if (!node || !canvasId) return;
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, link } : n)));
    updateBlockLink(canvasId, id, link);
    // block:updated requires content; resending the current content changes nothing
    socket.emit("block:updated", canvasId, { id, content: node.content, link });
  }, [canvasId, history]);

  const recreateBlock = useCallback(async (src: Node, x: number, y: number) => {
    if (!canvasId) return null;
    const type = src.type === "draw" || src.type === "image" ? src.type : "code";
    try {
      const { data } = await createBlockFrom(canvasId, {
        type,
        content: src.content,
        x,
        y,
        width: type === "draw" ? Math.max(...(src.points ?? []).map((p) => p.x), 1) : src.width ?? 300,
      });
      // the create endpoint ignores language and link, so set them in follow-up calls
      if (src.language) await updateBlockLanguage(canvasId, data.id, src.language);
      if (src.link) await updateBlockLink(canvasId, data.id, src.link);
      const size = { wrapWidth: src.wrapWidth ?? null, fontSize: src.fontSize ?? null };
      if (size.wrapWidth !== null || size.fontSize !== null) await updateBlockSize(canvasId, data.id, size);
      const block = { ...data, language: src.language, link: src.link ?? null, wrap_width: size.wrapWidth, font_size: size.fontSize };
      setNodes((prev) => [...prev, blockToNode(block)]);
      socket.emit("block:created", canvasId, block);
      return String(data.id);
    } catch (err) {
      showError(saveErrorMessage(err, "Couldn't save the block — check your connection and try again."));
      return null;
    }
  }, [canvasId]);

  // Puts deleted blocks back (undoing a delete), as few requests as the
  // restore route allows. Resolves to each block's new id, null if it failed.
  const restoreBlocks = useCallback(async (srcs: Node[]) => {
    const ids: (string | null)[] = [];
    if (canvasId) {
      try {
        for (const chunk of chunkForRestore(srcs.map(toRestorePayload))) {
          const { data } = await restoreBlocksApi(canvasId, chunk);
          setNodes((prev) => [...prev, ...data.map(blockToNode)]);
          for (const row of data) {
            socket.emit("block:created", canvasId, row);
            ids.push(String(row.id));
          }
        }
      } catch (err) {
        showError(saveErrorMessage(err, "Couldn't restore the blocks — check your connection and try again."));
      }
    }
    while (ids.length < srcs.length) ids.push(null);
    return ids;
  }, [canvasId]);

  // Sets a block's language and content — saving content only if it changed.
  const applyLanguage = useCallback((id: string, language: Language, content: string) => {
    if (!canvasId) return;
    const before = history.nodesRef.current.find((n) => n.id === id);
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, language, content } : n)));
    updateBlockLanguage(canvasId, id, language);
    if (content !== before?.content) updateBlockContent(canvasId, id, content);
    socket.emit("block:updated", canvasId, { id, content, language });
  }, [canvasId, history]);

  // Ctrl+Z undo, click-to-select, Ctrl+C / Ctrl+V on blocks
  const { selectedIds, pointer, contextMenu, marquee, deleteAllPrompt } = useCanvasShortcuts({
    enabled: true,
    nodes,
    history,
    ops: { deleteNode, moveNode, applyLanguage, applyShape, applyLink, applySize, recreateBlock, restoreBlocks, clearOutputs },
    onError: showError,
    canvasRef,
    rootRef,
    canMarquee: () => modeRef.current === "select" && !spaceHeld.current,
  });

  // Dragging one block of a multi-selection moves the whole selection by the
  // same amount; one undo puts them all back.
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);
  const groupDrag = useRef<{ id: string; group: number } | null>(null);
  const moveSelection = useCallback((id: string, x: number, y: number) => {
    const sel = selectedIdsRef.current;
    if (sel.length < 2 || !sel.includes(id)) {
      moveNode(id, x, y);
      return;
    }
    const all = history.nodesRef.current;
    const dragged = all.find((n) => n.id === id);
    if (!dragged) return;
    const dx = x - dragged.x;
    const dy = y - dragged.y;
    // a new drag starts once the last one's position has been saved
    if (!moveSaveTimers.current[id] || groupDrag.current?.id !== id) groupDrag.current = { id, group: Date.now() };
    const group = groupDrag.current.group;
    for (const n of all) {
      if (!sel.includes(n.id)) continue;
      if (n.id === id) moveNode(id, x, y, true, group);
      else moveNode(n.id, n.x + dx, n.y + dy, true, group);
    }
  }, [moveNode, history]);

  // saveSelection only writes to a ref — no canvasId dependency, always stable.
  const saveSelection = useCallback((content: string, el: HTMLElement) => {
    lastSelection.current = { content, el };
  }, []);

  // useCallback so OutputBubble's memo holds: other outputs don't re-render
  // when one changes.
  const dismissOutput = useCallback((id: number) => {
    setOutputs((prev) => prev.filter((o) => o.id !== id));
  }, []);

  // Outputs only live on this screen, so a resize is just local state.
  const resizeOutput = useCallback((id: number, width: number | null, fontSize: number | null, x: number, y: number) => {
    setOutputs((prev) => prev.map((o) => (o.id === id ? { ...o, width, fontSize, x, y } : o)));
  }, []);

  const moveOutput = useCallback((id: number, x: number, y: number) => {
    setOutputs((prev) => prev.map((o) => (o.id === id ? { ...o, x, y } : o)));
  }, []);

  // nodes is the only real dependency — offset/scale are read from refs
  // so the function only recreates when blocks actually change, not on cursor moves.
  const handleRunNode = useCallback(async (id: string) => {
    // Latest nodes from the ref, not `nodes`: depending on `nodes` gave this a
    // new identity on every drag update, which re-rendered every block.
    const node = history.nodesRef.current.find((n) => n.id === id);
    if (!node || !node.content.trim() || !socket.id) return;

    const el = document.querySelector(
      `[data-node-id="${id}"]`,
    ) as HTMLElement | null;
    let x = node.x + 220;
    let y = node.y;
    if (el) {
      const rect = el.getBoundingClientRect();
      x = (rect.right + 20 - offsetRef.current.x) / scaleRef.current;
      y = (rect.top - offsetRef.current.y) / scaleRef.current;
    }

    await runAndPlace(id, node.content, node.language ?? "javascript", { x, y });
  }, [history, runAndPlace]);

  const changeLanguage = useCallback((id: string, language: Language) => {
    // Latest nodes from the ref, not `nodes`: depending on `nodes` gave this a
    // new identity on every drag update, which re-rendered every block.
    const node = history.nodesRef.current.find((n) => n.id === id);
    if (!node || !canvasId) return;

    // Swap in the new language's starter if the block is empty or still holds
    // another language's untouched starter; never overwrite real code.
    const isUntouched =
      !node.content.trim() || LANGUAGE_OPTIONS.some((l) => l.starter === node.content);
    const content = isUntouched ? (languageOption(language).starter ?? "") : node.content;

    history.record({ kind: "language", id, language: node.language ?? "javascript", content: node.content });
    applyLanguage(id, language, content);
  }, [canvasId, history, applyLanguage]);

  // inline lambda in JSX would be a new reference every render — extracted so memo works
  const handleMarkErase = useCallback((id: string) => {
    setPendingErase((prev) => new Set([...prev, id]));
  }, []);

  function handleMouseMove(e: React.MouseEvent) {
    const x = (e.clientX - offsetRef.current.x) / scaleRef.current;
    const y = (e.clientY - offsetRef.current.y) / scaleRef.current;
    pointer.current = { x, y };
    if (!canvasId) return;
    const now = Date.now();
    if (now - lastCursorEmit.current < 50) return;
    lastCursorEmit.current = now;
    socket.emit("cursor:move", canvasId, { x, y });
  }

  async function handleShare(): Promise<string | null> {
    if (!canvasId) return null;
    const res = await fetch(`/api/canvases/${canvasId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ is_public: true }),
    });
    const data = await res.json();
    if (data.share_id) {
      setShareId(data.share_id);
      return data.share_id;
    }
    return null;
  }

  const isDark = resolvedTheme === "dark";

  const eraserSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${isDark ? '#f5f5f5' : '#374151'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H7L3 16l13-13 4 4-6.5 6.5"/><path d="M6.5 17.5l4-4"/></svg>`;
  const eraserCursor = `url('data:image/svg+xml;base64,${btoa(eraserSvg)}') 4 20, auto`;

  const cursorClass =
    mode === "hand"
      ? "cursor-grab"
      : mode === "draw"
        ? "cursor-crosshair"
        : mode === "select" || mode === "text"
          ? "dot-cursor" // blue dot, see index.css
          : "cursor-default"; // erase: overridden by the inline eraser cursor

  const toolbarBtn = (m: Mode, label: React.ReactNode, title: string) => (
    <button
      onClick={() => setMode(m)}
      title={title}
      className={`relative w-8 h-8 flex items-center justify-center rounded transition-colors ${
        activeTool === m
          ? "text-gray-800 dark:text-[#f5f5f5]"
          : "text-gray-400 hover:text-gray-700 dark:text-[#9b9ba8] dark:hover:text-[#f5f5f5]"
      }`}
    >
      {/* One highlight shared by every button (same layoutId), so switching
          tools slides it over to the new one instead of jumping. */}
      {activeTool === m && (
        <motion.span
          layoutId="toolbar-active"
          className="absolute inset-0 rounded bg-gray-100 dark:bg-[#3c3c4a]"
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
      <span className="relative">{label}</span>
    </button>
  );

  return (
    <div
      ref={rootRef}
      className={`relative w-screen h-screen overflow-hidden select-none ${cursorClass}`}
      style={{
        backgroundColor: isDark ? "#121212" : "#ffffff",
        backgroundImage: `radial-gradient(circle, ${isDark ? "#2c2c2c" : "#d1d5db"} 1px, transparent 1px)`,
        backgroundSize: "28px 28px",
        cursor: mode === "erase" ? eraserCursor : undefined,
        // touch screens: a finger drag draws instead of scrolling the page
        touchAction: mode === "draw" ? "none" : undefined,
      }}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onClick={handleCanvasClick}
      onDoubleClick={handleCanvasDoubleClick}
      onMouseDown={handlePanStart}
      onPointerDown={handleDrawPointerDown}
    >
      {/* branding */}
      <div className="absolute top-4 left-4 z-10 flex flex-col items-start gap-1">
        <span
          // Guests have no dashboard, so the logo is just a label for them.
          onClick={() => !isGuest && navigate("/dashboard")}
          className={`text-xs font-semibold tracking-widest uppercase text-gray-500 dark:text-gray-300 transition-colors ${
            isGuest ? "" : "cursor-pointer hover:text-gray-800 dark:hover:text-white"
          }`}
        >
          free-form
        </span>
        {isGuest && (
          <button
            onClick={() => navigate("/", { state: { mode: "register" } })}
            // Same hand-drawn font as the text blocks, a size down from their 14px.
            className="font-canvas text-[13px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white underline underline-offset-2 transition-colors"
          >
            Sign up to save more canvases
          </button>
        )}
      </div>

      <EraserTrail active={mode === "erase"} isDark={isDark} />

      {/* mode toolbar + run hint, centered as one column */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5">
        <div
          className="flex items-center gap-0.5 rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.12)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.6)] p-1 bg-white dark:bg-[#232329]"
        >
          {toolbarBtn(
            "select",
            // arrow / cursor icon
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M1.5 1L6 12l2.2-3.8L12 6 1.5 1z" />
            </svg>,
            "Select (V)",
          )}
          {toolbarBtn(
            "hand",
            // hand icon
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 11V8a2 2 0 0 0-4 0v3M14 11V6a2 2 0 0 0-4 0v5M10 11V8a2 2 0 0 0-4 0v8a6 6 0 0 0 12 0v-5a2 2 0 0 0-4 0v0" />
            </svg>,
            "Hand (H)",
          )}
          {toolbarBtn(
            "text",
            <span className="text-xs font-bold leading-none">T</span>,
            "Text (T)",
          )}
          {toolbarBtn("draw", <Pencil size={14} />, "Draw (D)")}
          {toolbarBtn(
            "erase",
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 20H7L3 16l13-13 4 4-6.5 6.5" />
              <path d="M6.5 17.5l4-4" />
            </svg>,
            "Erase (E)",
          )}
        </div>
        <span className="font-canvas text-[11px] pointer-events-none select-none text-gray-400 dark:text-gray-500">
          select code + ctrl+enter to run
        </span>
      </div>

      {/* top-right: run button, share, dark/light toggle */}
      <div className="absolute top-3 right-4 z-20 flex items-center gap-2">
        <button
          onClick={() =>
            window.dispatchEvent(
              new KeyboardEvent("keydown", {
                ctrlKey: true,
                key: "Enter",
                bubbles: true,
              }),
            )
          }
          title="Run selected code"
          className="w-8 h-8 flex items-center justify-center rounded shadow-[0_2px_8px_rgba(0,0,0,0.12)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.6)] transition-colors bg-white text-gray-400 hover:text-gray-700 dark:bg-[#232329] dark:text-[#9b9ba8] dark:hover:text-[#f5f5f5]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </button>
        <ShareDrawer shareId={shareId} canvasId={canvasId} onMakePublic={handleShare} isDark={isDark}>
          <button
            title="Share canvas"
            className="h-8 flex items-center justify-center rounded shadow-[0_2px_8px_rgba(0,0,0,0.12)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.6)] transition-colors px-2 text-xs bg-white text-gray-400 hover:text-gray-700 dark:bg-[#232329] dark:text-[#9b9ba8] dark:hover:text-[#f5f5f5]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>
        </ShareDrawer>
        <button
          onClick={() => setSnapShapes((v) => !v)}
          title="Snap drawings to perfect shapes"
          className={`w-8 h-8 flex items-center justify-center rounded shadow-[0_2px_8px_rgba(0,0,0,0.12)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.6)] transition-colors ${
            snapShapes
              ? "bg-blue-500 text-white"
              : "bg-white text-gray-400 hover:text-gray-700 dark:bg-[#232329] dark:text-[#9b9ba8] dark:hover:text-[#f5f5f5]"
          }`}
        >
          <Shapes size={14} />
        </button>
        <ThemeToggleButton />
      </div>

      {/* who's here, under the theme toggle — only once someone else has
          joined through the share link; alone, it's just you */}
      {people.length > 1 && (
        <div className="absolute top-[60px] right-4 z-20">
          <PresenceMenu
            people={people.map((p) => ({ ...p, color: getCursorColor(p.userId) }))}
            myId={socket.id}
            isDark={isDark}
          />
        </div>
      )}

      {/* canvas */}
      <div
        ref={canvasRef}
        className="w-full h-full"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        {nodes.length === 0 && mode === "text" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-300 text-sm font-mono select-none">
              click anywhere to start
            </p>
          </div>
        )}

        {nodes.map((node) =>
          node.type === "image" ? (
            <ImageNode
              key={node.id}
              id={node.id}
              x={node.x}
              y={node.y}
              width={node.width ?? 300}
              src={node.content}
              link={node.link}
              onMove={moveSelection}
              onMarkErase={handleMarkErase}
              pendingErase={pendingErase.has(node.id)}
              selected={selectedIds.includes(node.id)}
              mode={mode}
              isMouseDown={isMouseDown}
              isDark={isDark}
            />
          ) : node.type === "draw" ? (
            <DrawingNode
              key={node.id}
              id={node.id}
              x={node.x}
              y={node.y}
              points={node.points ?? []}
              onMove={moveSelection}
              onMarkErase={handleMarkErase}
              onResize={resizeDrawing}
              link={node.link}
              pendingErase={pendingErase.has(node.id)}
              selected={selectedIds.includes(node.id)}
              mode={mode}
              isMouseDown={isMouseDown}
              isDark={isDark}
            />
          ) : (
            <FloatingNode
              key={node.id}
              id={node.id}
              x={node.x}
              y={node.y}
              content={node.content}
              language={node.language ?? "javascript"}
              onChange={updateNode}
              onLanguageChange={changeLanguage}
              onMove={moveSelection}
              onSaveSelection={saveSelection}
              onMarkErase={handleMarkErase}
              pendingErase={pendingErase.has(node.id)}
              onRun={handleRunNode}
              autoFocus={node.id === focusNodeId}
              wrapWidth={node.wrapWidth ?? undefined}
              fontSize={node.fontSize ?? undefined}
              onResize={resizeText}
              selected={selectedIds.includes(node.id)}
              onEditingChange={setEditingText}
              link={node.link}
              mode={mode}
              isMouseDown={isMouseDown}
              isDark={isDark}
            />
          ),
        )}

        {stroke.drawing && (
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ overflow: "visible" }}
          >
            {/* d is filled in by useFreehandStroke, once per frame */}
            <path
              ref={stroke.pathRef}
              fill="none"
              stroke={isDark ? "#f5f5f5" : "#1f2937"}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}

        {outputs.map((out) => (
          <OutputBubble
            key={out.id}
            id={out.id}
            x={out.x}
            y={out.y}
            text={out.text}
            isError={out.isError}
            width={out.width}
            fontSize={out.fontSize}
            onDelete={dismissOutput}
            onMove={moveOutput}
            onResize={resizeOutput}
            mode={mode}
            isMouseDown={isMouseDown}
            isDark={isDark}
          />
        ))}

        <RemoteCursors cursors={remoteCursors} mySocketId={socket.id} />
      </div>

      {/* transient error toast */}
      {errorToast && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 text-xs px-3 py-2 rounded-lg shadow-sm border bg-[#FFEEF2] border-[#FF3B6B]/30 text-[#FF3B6B] dark:bg-[#2B1520] dark:border-[#FF3B6B]/40">
          {errorToast}
        </div>
      )}

      {contextMenu && <CanvasContextMenu {...contextMenu} isDark={isDark} />}

      {deleteAllPrompt && (
        <ConfirmDialog
          title="Delete everything?"
          message={`This removes ${deleteAllPrompt.count === 1 ? "the only item" : `all ${deleteAllPrompt.count} items`} on the canvas, and any run output. You can undo with Ctrl+Z.`}
          confirmLabel="Delete all"
          onConfirm={deleteAllPrompt.onConfirm}
          onCancel={deleteAllPrompt.onCancel}
        />
      )}

      {/* selection box while dragging on empty canvas */}
      {marquee && (
        <div
          className="fixed pointer-events-none z-30 border border-[#4fb4f2] bg-[#4fb4f2]/10"
          style={{
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
          }}
        />
      )}

      <ScrollToContent
        nodeCount={nodes.length}
        offset={offset}
        scale={scale}
        lastTouchedId={history.lastTouchedId}
        onPan={setOffset}
        isDark={isDark}
      />

      {/* zoom controls */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.12)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.6)] px-2 py-1 bg-white dark:bg-[#232329]"
      >
        <button
          className="text-sm font-mono w-6 h-6 flex items-center justify-center transition-colors text-gray-400 hover:text-gray-700 dark:text-[#9b9ba8] dark:hover:text-[#f5f5f5]"
          onClick={zoomOut}
        >
          −
        </button>
        <span
          className="text-xs font-mono w-10 text-center text-gray-400 dark:text-[#9b9ba8]"
        >
          {Math.round(scale * 100)}%
        </span>
        <button
          className="text-sm font-mono w-6 h-6 flex items-center justify-center transition-colors text-gray-400 hover:text-gray-700 dark:text-[#9b9ba8] dark:hover:text-[#f5f5f5]"
          onClick={zoomIn}
        >
          +
        </button>
      </div>
    </div>
  );
}

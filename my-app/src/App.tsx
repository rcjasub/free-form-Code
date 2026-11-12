import React, { useState, useRef, useEffect } from "react";
import SelectionBox from "./components/SelectionBox";
import { useGroupResize } from "./hooks/useGroupResize";
import { useGroupDragFrames } from "./hooks/useGroupDragFrames";
import { useTheme } from "next-themes";
import { CloudUpload, HardDrive, LayoutDashboard, LogOut, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { SIDEBAR_TRANSITION, sidebarOpenShift } from "./lib/sidebarLayout";
import { useParams, useNavigate } from "react-router-dom";
import { detectShapeKind } from "./lib/shapeDetection";
import { snappedShapeBlock } from "./hooks/useShapeTool";
import { DEFAULT_DRAW_STYLE, drawStrokeProps, parseDrawing, parsePoints, serializeDrawing } from "./lib/points";
import { saveErrorMessage } from "./lib/saveErrors";
import FloatingNode from "./components/FloatingNode";
import DrawingNode, { type Point } from "./components/DrawingNode";
import ImageNode from "./components/ImageNode";
import CanvasContextMenu from "./components/CanvasContextMenu";
import ConfirmDialog from "./components/ConfirmDialog";
import RemoteCursorMarker from "./components/RemoteCursorMarker";
import OutputBubble from "./components/OutputBubble";
import EraserTrail from "./components/EraserTrail";
import SnapGhosts from "./components/SnapGhost";
import { useSnapGhosts, SNAP_FADED_OPACITY } from "./hooks/useSnapGhosts";
import ScrollToContent from "./components/ScrollToContent";
import { useSavedView } from "./hooks/useSavedView";
import { useLivePan } from "./hooks/useLivePan";
import { ThemeIcon, useThemeToggle } from "./components/ThemeToggle";
import { Sidebar, SidebarBrand, SidebarControl, SidebarItem, SidebarNote, SidebarSeparator } from "./components/ui/sidebar";
import BackgroundPicker, { BackgroundIcon } from "./components/BackgroundPicker";
import { useCanvasBackground } from "./hooks/useCanvasBackground";
import { canvasBackgroundStyle } from "./lib/canvasBackground";
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
  updateBlockColor,
  updateBlockSize,
  restoreBlocks as restoreBlocksApi,
} from "./lib/blockStore";
import { createKeyedThrottle } from "./lib/throttle";
import { chunkForRestore, toRestorePayload } from "./lib/restore";
import { LANGUAGE_OPTIONS, isRunnable, languageOption, type Language } from "./lib/languages";
import { requestRun } from "./lib/runCode";
import { type Output, makeRunKey, isAlreadyShown, placeOutput } from "./lib/runOutputs";
import { getMe, type Me } from "./API/auth";
import { isLocalBlockId, isLocalCanvas, parseCanvasFile, requestPersistentStorage, toCanvasFile } from "./lib/localCanvas";
import { moveLocalCanvasOnline, uploadKept } from "./lib/moveOnline";
import { announceMoved } from "./hooks/useActiveTab";
import { useCanvasHistory, useCanvasShortcuts, type CanvasNode } from "./hooks/useCanvasHistory";
import { useFreehandStroke } from "./hooks/useFreehandStroke";
import { useStackOrder } from "./hooks/useStackOrder";
import { storedType } from "./lib/blockTypes";
import { isShapeTool, type ShapeTool } from "./hooks/useShapeTool";
import { useDiagram, type NewBlock } from "./hooks/useDiagram";
import ShapeDraftPreview from "./components/ShapeDraftPreview";
import CanvasToolbar from "./components/CanvasToolbar";
import PropertiesPanel from "./components/PropertiesPanel";
import { toolForKey } from "./lib/toolKeys";
import { parseArrow } from "./lib/shapes";
import ShapeNode from "./components/ShapeNode";
import ArrowNode from "./components/ArrowNode";
import { DownloadDoneIcon, ImportIcon } from "./components/ui/animated-state-icons";
import { AccountAddIcon } from "./components/ui/account-add-icon";
import { LinkIcon, type LinkIconHandle } from "./components/ui/link-icon";
import "./App.css";

export type Mode = "select" | "hand" | "text" | "erase" | "draw" | ShapeTool;

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
  // shape/arrow geometry and styling stay JSON in content (lib/shapes)
  if (b.type === "shape" || b.type === "arrow") return { ...common, type: b.type };
  return { ...common, language: b.language, wrapWidth: b.wrap_width ?? null, fontSize: b.font_size ?? null, color: b.color ?? null };
}

// Live updates for everyone else on the canvas. Nothing is sent for the
// browser-only guest canvas (nobody else is on it), or for a block kept in
// this browser — a guest's image, which only they see (lib/blockStore).
function broadcast(event: string, canvasId: string, payload: unknown) {
  if (isLocalCanvas(canvasId)) return;
  const blockId = typeof payload === "string" ? payload : (payload as { id?: unknown } | null)?.id;
  if (typeof blockId === "string" && isLocalBlockId(blockId)) return;
  socket.emit(event, canvasId, payload);
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
  const { background, setBackground } = useCanvasBackground();
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
  const { ghosts: snapGhosts, addGhost, drawingIn, drawIn } = useSnapGhosts();
  const [snapShapes, setSnapShapes] = useState(false);
  // whether the left sidebar is widened (hovered), so the panel beside it
  // can move out of its way
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  // the guest canvas kept in this browser (lib/localCanvas), not on the server
  const isLocal = isLocalCanvas(canvasId);
  const [isGuest, setIsGuest] = useState(isLocal);
  const [me, setMe] = useState<Me | null>(null);
  const [uploadingKept, setUploadingKept] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const [pendingErase, setPendingErase] = useState<Set<string>>(new Set());
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(new Map());
  // everyone in the room right now, from the server's "presence" broadcasts
  const [people, setPeople] = useState<{ userId: string; username: string }[]>([]);
  const lastCursorEmit = useRef(0);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const errorToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { resolvedTheme } = useTheme();
  const { toggleTheme } = useThemeToggle();
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

  // reopening a canvas puts you back where you were on it
  useSavedView(canvasId, scale, offset, setScale, setOffset);

  // panning moves the canvas directly; the offset state follows when it settles
  const { panTo, endPan, panning } = useLivePan({ canvasRef, rootRef, offsetRef, scaleRef, setOffset });

  // keep refs in sync (mid-pan, offsetRef is ahead of the state: see useLivePan)
  useEffect(() => {
    if (!panning.current) offsetRef.current = offset;
  }, [offset, panning]);
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

    // A browser-only canvas has no room to join, but still connects: run
    // results come back over the socket.
    const local = isLocalCanvas(canvasId);
    if (!local) socket.on("connect", joinCanvas);
    // fresh handshake on every canvas visit, so it carries the current cookie
    socket.connect();

    if (local) {
      requestPersistentStorage();
    } else {
      // fetch canvas metadata to get share_id
      fetch(`/api/canvases/${canvasId}`, { credentials: "include" })
        .then((r) => r.json())
        .then((data) => setShareId(data.share_id));
    }

    getMe()
      .then((me) => {
        setMe(me);
        setIsGuest(local || !!me?.isGuest);
      })
      .catch(() => {});

    // load blocks on mount (from the DB, or this browser's storage)
    getAllBlocks(canvasId)
      .then(({ data }) => {
        setNodes(data.map(blockToNode));
      })
      .catch(() => {
        // IndexedDB can be off (some private windows, blocked site data)
        if (local) showError("This browser won't let the canvas be saved here — sign up to keep your work online.");
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
                color: "color" in data ? data.color : n.color,
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
        const tool = toolForKey(e.key);
        if (tool) setMode(tool);
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

  // Saves a shape or arrow the diagram tools made (hooks/useDiagram).
  async function saveNewShape(block: NewBlock) {
    if (!canvasId) return null;
    try {
      const { data } = await createBlockFrom(canvasId, block);
      const node = blockToNode(data);
      setNodes((prev) => [...prev, node]);
      broadcast("block:created", canvasId, data);
      history.record({ kind: "create", id: node.id });
      return node.id;
    } catch (err) {
      showError(saveErrorMessage(err, "Couldn't save that shape — check your connection and try again."));
      return null;
    }
  }

  async function finalizeDrawing(rawPoints: Point[]) {
    if (rawPoints.length < 2 || !canvasId) return;
    const snap = snapShapes ? detectShapeKind(rawPoints) : null;
    // the stroke as drawn stays faded while the clean shape draws itself in
    if (snap) addGhost(rawPoints, diagram.drawStyle);
    // a snapped rectangle or ellipse becomes a real shape: arrows attach to
    // it and it takes a label (a triangle or a line stays a drawing)
    if (snap && (snap.kind === "rect" || snap.kind === "ellipse")) {
      const block = snappedShapeBlock(snap.kind, snap.points, diagram.style);
      const id = block ? await saveNewShape(block) : null;
      // it draws itself in over the faded stroke, like a snapped drawing
      if (id) drawIn(id, "trace");
      return;
    }
    const snapped = snap?.points ?? null;
    const points = snapped ?? rawPoints;
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
        serializeDrawing(relPoints, diagram.drawStyle),
      );
      const node = blockToNode(data);
      if (snapShapes) drawIn(node.id, snapped ? "trace" : "brighten");
      setNodes((prev) => [...prev, node]);
      broadcast("block:created", canvasId, data);
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

  // Where the pen and the shape tools can start: empty canvas, or on top of
  // a shape, drawing, image or arrow (drawing over them, like on paper).
  // Text and code blocks are editors, so a press there goes to them.
  function isDrawSurface(e: React.MouseEvent) {
    if (isCanvasBackground(e)) return true;
    const block = (e.target as Element).closest?.<HTMLElement>("[data-node-id]");
    return !!block && !block.dataset.language && !!canvasRef.current?.contains(block);
  }

  // the shape or arrow a press landed on, if any: the text tool types in it
  function labelTargetUnder(e: React.MouseEvent) {
    const id = (e.target as Element).closest?.<HTMLElement>("[data-node-id]")?.dataset.nodeId;
    return id && diagram.hasLabel(id) ? id : null;
  }

  function handleDrawPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (diagram.startShape(e, isDrawSurface(e))) return;
    if (mode !== "draw" || e.button !== 0 || !isDrawSurface(e)) return;
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
    // on a shape or an arrow, the text tool types in its label
    const labelled = labelTargetUnder(e);
    if (labelled) {
      setMode("select");
      diagram.editLabel(labelled);
      return;
    }
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
    const x = (clientX - offsetRef.current.x) / scaleRef.current;
    const y = (clientY - offsetRef.current.y) / scaleRef.current;
    // A double-click in text mode is a click (makes a block) followed by a
    // dblclick — don't let that second event make another one on top of it.
    const now = performance.now();
    if (now - lastTextCreate.current < 500) return;
    lastTextCreate.current = now;
    setMode("select");
    const id = await createTextAt(x, y, "");
    // new text takes the color and size picked in the panel
    if (id) diagram.styleNewText(id);
  }

  // Makes a text block at canvas (x, y), with the caret in it, and resolves
  // to its id (null if it couldn't be saved). Also used for text in shapes.
  async function createTextAt(x: number, y: number, content: string) {
    if (!canvasId) return null;
    try {
      const { data } = await createBlock(canvasId, x, y);
      // New blocks start as plain text. The create endpoint ignores language,
      // so set it in a follow-up call (the same one the language picker uses).
      // If that fails the block already exists — keep it with its default
      // language rather than losing it behind an error.
      const language = await updateBlockLanguage(canvasId, data.id, "text")
        .then(() => "text" as const)
        .catch(() => data.language);
      if (content) await updateBlockContent(canvasId, data.id, content);
      const block = { ...data, language, content: content || data.content };
      setFocusNodeId(block.id);
      setNodes((prev) => [
        ...prev,
        { id: block.id, x: block.x, y: block.y, content: block.content, language: block.language },
      ]);
      broadcast("block:created", canvasId, block);
      history.record({ kind: "create", id: data.id });
      return String(block.id);
    } catch (err) {
      showError(saveErrorMessage(err, "Couldn't create the block — check your connection and try again."));
      return null;
    }
  }

  function applyZoom(newScale: number) {
    endPan(); // a pan still settling: zoom from where it is now
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
    panTo({ x: offsetRef.current.x - e.deltaX, y: offsetRef.current.y - e.deltaY }, true);
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
    // a closed hand over everything while panning (see .canvas-panning in
    // index.css): the canvas and blocks set their own open-hand cursors,
    // which would otherwise win over the body's
    document.body.classList.add("canvas-panning");
    const startX = e.clientX - offsetRef.current.x;
    const startY = e.clientY - offsetRef.current.y;

    function onMouseMove(e: MouseEvent) {
      panTo({ x: e.clientX - startX, y: e.clientY - startY });
    }
    function onMouseUp() {
      const m = modeRef.current;
      document.body.style.cursor =
        spaceHeld.current || m === "hand" ? "grab" : "";
      document.body.classList.remove("canvas-panning");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      endPan();
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
        broadcast("block:updated", canvasId, { id, content });
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
    emitThrottle(`move:${id}`, () => broadcast("block:moved", canvasId, { id, x, y }));
    clearTimeout(moveSaveTimers.current[id]);
    moveSaveTimers.current[id] = setTimeout(() => {
      delete moveSaveTimers.current[id];
      updateBlockPosition(canvasId, id, x, y);
    }, 300);
  }, [canvasId, history]);

  const deleteNode = useCallback((id: string, record = true) => {
    const node = history.nodesRef.current.find((n) => n.id === id);
    if (record && node) history.record({ kind: "delete", nodes: [node] });
    // a move still waiting to be saved would hit a block that's gone (404)
    clearTimeout(moveSaveTimers.current[id]);
    delete moveSaveTimers.current[id];
    setNodes((prev) => prev.filter((n) => n.id !== id));
    if (canvasId) {
      deleteBlock(canvasId, id);
      broadcast("block:deleted", canvasId, id);
    }
  }, [canvasId, history]);

  // Sets a drawing's position and stroke (its content) — for resizing and
  // for undoing a resize. `save` is false for the in-between frames of a drag.
  const applyShape = useCallback((id: string, x: number, y: number, content: string, save = true) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y, content, points: n.type === "draw" ? parsePoints(content) ?? n.points : n.points } : n)));
    if (!canvasId) return;
    broadcast("block:moved", canvasId, { id, x, y });
    broadcast("block:updated", canvasId, { id, content });
    if (save) {
      updateBlockPosition(canvasId, id, x, y);
      updateBlockContent(canvasId, id, content);
    }
  }, [canvasId]);

  // One drag of a drawing's resize handle: every call shows the new shape
  // here and to everyone else; the last one (done) saves it and records a
  // single undo step back to the shape it started from.
  // Shapes reshape the same way, with their whole new content (size or label).
  const reshapeBlock = useCallback((id: string, x: number, y: number, content: string, done: boolean, group?: number) => {
    if (!resizeStart.current[id]) {
      const before = history.nodesRef.current.find((n) => n.id === id);
      if (before) resizeStart.current[id] = before;
    }
    applyShape(id, x, y, content, done);
    if (!done) return;
    const before = resizeStart.current[id];
    delete resizeStart.current[id];
    if (before) history.record({ kind: "reshape", id, x: before.x, y: before.y, content: before.content, group });
  }, [history, applyShape]);

  const resizeDrawing = useCallback((id: string, x: number, y: number, points: Point[], done: boolean) => {
    // keep the drawing's style; only its points change
    const node = history.nodesRef.current.find((n) => n.id === id);
    const style = node ? parseDrawing(node.content).style : DEFAULT_DRAW_STYLE;
    reshapeBlock(id, x, y, serializeDrawing(points, style), done);
  }, [reshapeBlock, history]);

  // Saves a copy of a block as a brand-new block at (x, y) — for paste and
  // for undoing a delete. The server hands back a new id.
  function showError(message: string) {
    setErrorToast(message);
    if (errorToastTimer.current) clearTimeout(errorToastTimer.current);
    errorToastTimer.current = setTimeout(() => setErrorToast(null), 4000);
  }

  // Sets a text block's wrap width and font size — for its handles and for
  // undo. `save` is false for the in-between frames of a drag.
  // (A block made this moment isn't in nodesRef yet; new text gets its size
  // here right away, so there's no "does it exist" check.)
  const applySize = useCallback((id: string, wrapWidth: number | null, fontSize: number | null, save = true) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, wrapWidth, fontSize } : n)));
    if (!canvasId) return;
    // just the size (not the content again), throttled while dragging and
    // sent right away for the final one
    emitThrottle(`size:${id}`, () => broadcast("block:updated", canvasId, { id, wrapWidth, fontSize }), save);
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
  const resizeText = useCallback((id: string, wrapWidth: number | null, fontSize: number | null, x: number, y: number, done: boolean, group?: number) => {
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
    if (start) history.record({ kind: "resize", id, ...start, group });
  }, [history, applySize, moveNode]);

  // Sets or removes a block's link — for the right-click menu and for undo.
  // Sets a text block's color (null: back to the theme's) — for the
  // properties panel and for undo.
  const applyColor = useCallback((id: string, color: string | null) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, color } : n)));
    if (!canvasId) return;
    updateBlockColor(canvasId, id, color).catch((err) =>
      showError(saveErrorMessage(err, "Couldn't save the color — check your connection and try again.")),
    );
    broadcast("block:updated", canvasId, { id, color });
  }, [canvasId]);

  const applyLink = useCallback((id: string, link: string | null) => {
    const node = history.nodesRef.current.find((n) => n.id === id);
    if (!node || !canvasId) return;
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, link } : n)));
    updateBlockLink(canvasId, id, link);
    // block:updated requires content; resending the current content changes nothing
    broadcast("block:updated", canvasId, { id, content: node.content, link });
  }, [canvasId, history]);

  const recreateBlock = useCallback(async (src: Node, x: number, y: number) => {
    if (!canvasId) return null;
    const type = storedType(src);
    try {
      const { data } = await createBlockFrom(canvasId, {
        type,
        content: src.content,
        x,
        y,
        width: type === "draw" ? Math.max(...(src.points ?? []).map((p) => p.x), 1) : src.width ?? 300,
      }, isGuest);
      // the create endpoint ignores language and link, so set them in follow-up calls
      if (src.language) await updateBlockLanguage(canvasId, data.id, src.language);
      if (src.link) await updateBlockLink(canvasId, data.id, src.link);
      if (src.color) await updateBlockColor(canvasId, data.id, src.color);
      const size = { wrapWidth: src.wrapWidth ?? null, fontSize: src.fontSize ?? null };
      if (size.wrapWidth !== null || size.fontSize !== null) await updateBlockSize(canvasId, data.id, size);
      const block = { ...data, language: src.language, link: src.link ?? null, wrap_width: size.wrapWidth, font_size: size.fontSize, color: src.color ?? null };
      setNodes((prev) => [...prev, blockToNode(block)]);
      broadcast("block:created", canvasId, block);
      return String(data.id);
    } catch (err) {
      showError(saveErrorMessage(err, "Couldn't save the block — check your connection and try again."));
      return null;
    }
  }, [canvasId, isGuest]);

  // Puts deleted blocks back (undoing a delete), as few requests as the
  // restore route allows. Resolves to each block's new id, null if it failed.
  const restoreBlocks = useCallback(async (srcs: Node[]) => {
    const ids: (string | null)[] = [];
    if (canvasId) {
      try {
        for (const chunk of chunkForRestore(srcs.map(toRestorePayload))) {
          const { data } = await restoreBlocksApi(canvasId, chunk, isGuest);
          setNodes((prev) => [...prev, ...data.map(blockToNode)]);
          for (const row of data) {
            broadcast("block:created", canvasId, row);
            ids.push(String(row.id));
          }
        }
      } catch (err) {
        showError(saveErrorMessage(err, "Couldn't restore the blocks — check your connection and try again."));
      }
    }
    while (ids.length < srcs.length) ids.push(null);
    return ids;
  }, [canvasId, isGuest]);

  // Sets a block's language and content — saving content only if it changed.
  const applyLanguage = useCallback((id: string, language: Language, content: string) => {
    if (!canvasId) return;
    const before = history.nodesRef.current.find((n) => n.id === id);
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, language, content } : n)));
    updateBlockLanguage(canvasId, id, language);
    if (content !== before?.content) updateBlockContent(canvasId, id, content);
    broadcast("block:updated", canvasId, { id, content, language });
  }, [canvasId, history]);

  // Ctrl+Z undo, click-to-select, Ctrl+C / Ctrl+V on blocks
  const { selectedIds, select, pointer, contextMenu, marquee, deleteAllPrompt } = useCanvasShortcuts({
    enabled: true,
    nodes,
    history,
    ops: { deleteNode, moveNode, applyLanguage, applyShape, applyLink, applyColor, applySize, recreateBlock, restoreBlocks, clearOutputs },
    onError: showError,
    canvasRef,
    rootRef,
    canMarquee: () => modeRef.current === "select" && !spaceHeld.current,
  });

  // which block draws over which: selecting one brings it to the front
  const stackOrder = useStackOrder(nodes.map((n) => n.id), selectedIds);

  // Dragging one block of a multi-selection moves the whole selection by the
  // same amount; one undo puts them all back.
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);
  const groupDrag = useRef<{ id: string; group: number } | null>(null);

  // the diagram tools: shapes, arrows, their style and labels
  const diagram = useDiagram({
    enabled: true,
    nodes,
    nodesRef: history.nodesRef,
    selectedIds,
    select,
    mode,
    setMode,
    toCanvas: (cx, cy) => ({ x: (cx - offsetRef.current.x) / scaleRef.current, y: (cy - offsetRef.current.y) / scaleRef.current }),
    reshapeBlock,
    createBlock: saveNewShape,
    applyColor,
    applySize,
    record: history.record,
    deleteNode,
  });
  // a text block's editing changing: the toolbar shows the text tool while
  // one is being typed in
  const handleTextEditing = setEditingText;

  // Moves a dragged block, or the whole selection it's part of. (A shape's
  // text is its label, so only what's selected moves: text a shape sits on
  // or passes over stays put.)
  const moveSelection = useCallback((id: string, x: number, y: number) => {
    const sel = selectedIdsRef.current;
    const moving = sel.length >= 2 && sel.includes(id) ? sel : [id];
    // a new drag starts once the last one's position has been saved
    if (!moveSaveTimers.current[id] || groupDrag.current?.id !== id) {
      groupDrag.current = { id, group: Date.now() };
    }
    if (moving.length === 1) {
      moveNode(id, x, y);
      return;
    }
    const all = history.nodesRef.current;
    const dragged = all.find((n) => n.id === id);
    if (!dragged) return;
    const dx = x - dragged.x;
    const dy = y - dragged.y;
    const group = groupDrag.current.group;
    for (const n of all) {
      if (!moving.includes(n.id)) continue;
      if (n.id === id) moveNode(id, x, y, true, group);
      else moveNode(n.id, n.x + dx, n.y + dy, true, group);
    }
  }, [moveNode, history]);
  // ...and every frame of that drag moves the rest of the selection with it
  const dragFrame = useGroupDragFrames({ nodesRef: history.nodesRef, selectedIdsRef });
  // the box around a multi-selection: dragging a corner scales it all
  const toCanvasPoint = useCallback(
    (cx: number, cy: number) => ({ x: (cx - offsetRef.current.x) / scaleRef.current, y: (cy - offsetRef.current.y) / scaleRef.current }),
    [],
  );
  const startGroupResize = useGroupResize({ nodesRef: history.nodesRef, reshapeBlock, resizeText, moveNode, toCanvas: toCanvasPoint });

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
    broadcast("cursor:move", canvasId, { x, y });
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

  // Browser-only canvas → the server (to share it, or into the account the
  // user is logged in to), then over to its server page.
  async function moveOnline() {
    const id = await moveLocalCanvasOnline(
      history.nodesRef.current.map((n) => ({ id: n.id, block: toRestorePayload(n) })),
    );
    announceMoved(id);
    navigate(`/canvas/${id}`, { replace: true });
  }

  // Blocks this browser still keeps for this canvas although the user has an
  // account now: what uploading after sign-up couldn't finish.
  const keptHere = !isLocal && me && !me.isGuest ? nodes.filter((n) => isLocalBlockId(n.id)).length : 0;

  async function retryKept() {
    if (!canvasId || uploadingKept) return;
    setUploadingKept(true);
    try {
      const rows = await uploadKept(canvasId);
      rows.forEach((row) => broadcast("block:created", canvasId, row));
    } catch (err) {
      showError(saveErrorMessage(err, "Couldn't upload them — check your connection and try again."));
    } finally {
      // what made it now has a server id, whether or not all of it did
      await getAllBlocks(canvasId)
        .then(({ data }) => setNodes(data.map(blockToNode)))
        .catch(() => {});
      setUploadingKept(false);
    }
  }

  async function logOut() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    navigate("/");
  }

  function handleMoveToAccount() {
    moveOnline().catch((err) =>
      showError(saveErrorMessage(err, "Couldn't move the canvas to your account. Check your connection and try again.")),
    );
  }

  // A JSON backup of what's on screen (a guest's images included).
  const [exported, setExported] = useState(false);
  const exportedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // and the Import icon does the same when clicked
  const [imported, setImported] = useState(false);
  const importedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function startImport() {
    setImported(true);
    clearTimeout(importedTimer.current);
    importedTimer.current = setTimeout(() => setImported(false), 2000);
    importInput.current?.click();
  }
  // the Share button's link animates while the button is hovered
  const shareIcon = useRef<LinkIconHandle>(null);
  // the Sign up icon draws itself in again on hover
  const [signUpDraw, setSignUpDraw] = useState(0);
  useEffect(
    () => () => {
      clearTimeout(exportedTimer.current);
      clearTimeout(importedTimer.current);
    },
    [],
  );
  function exportCanvas() {
    const blob = new Blob([toCanvasFile(history.nodesRef.current.map(toRestorePayload))], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `free-form-canvas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    // the Export icon shows a check for a moment
    setExported(true);
    clearTimeout(exportedTimer.current);
    exportedTimer.current = setTimeout(() => setExported(false), 2000);
  }

  // Adds a backup's blocks to the canvas (nothing already on it is removed).
  // On a server canvas they're sent in as few requests as the restore route
  // allows, a guest's images stay in this browser, and others see them live.
  async function importCanvas(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same file again still fires
    if (!file || !canvasId) return;
    try {
      const blocks = parseCanvasFile(await file.text());
      for (const chunk of chunkForRestore(blocks)) {
        const { data } = await restoreBlocksApi(canvasId, chunk, isGuest);
        setNodes((prev) => [...prev, ...data.map(blockToNode)]);
        for (const row of data) broadcast("block:created", canvasId, row);
      }
    } catch (err) {
      showError(saveErrorMessage(err, err instanceof Error && err.message ? err.message : "Couldn't import that file."));
    }
  }

  const isDark = resolvedTheme === "dark";

  const eraserSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${isDark ? '#f5f5f5' : '#374151'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H7L3 16l13-13 4 4-6.5 6.5"/><path d="M6.5 17.5l4-4"/></svg>`;
  const eraserCursor = `url('data:image/svg+xml;base64,${btoa(eraserSvg)}') 4 20, auto`;

  const cursorClass =
    mode === "hand"
      ? "cursor-grab"
      : mode === "draw" || isShapeTool(mode)
        ? "cursor-crosshair"
        : mode === "select" || mode === "text"
          ? "dot-cursor" // blue dot, see index.css
          : "cursor-default"; // erase: overridden by the inline eraser cursor

  return (
    <div
      ref={rootRef}
      className={`relative w-screen h-screen overflow-hidden select-none ${cursorClass}`}
      style={{
        ...canvasBackgroundStyle(background, isDark, scale, offset),
        cursor: mode === "erase" ? eraserCursor : undefined,
        // touch screens: a finger drag draws instead of scrolling the page
        touchAction: mode === "draw" || isShapeTool(mode) ? "none" : undefined,
      }}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onClick={handleCanvasClick}
      onDoubleClick={handleCanvasDoubleClick}
      onMouseDown={handlePanStart}
      onPointerDown={handleDrawPointerDown}
    >
      {/* left: canvas actions, account and theme */}
      <Sidebar
        onOpenChange={setSidebarOpen}
        header={
          // Guests have no dashboard, so it takes them back to the start page.
          <SidebarBrand
            name="free-form"
            title={isGuest ? "Back to the start page" : "Dashboard"}
            onClick={() => navigate(isGuest ? "/" : "/dashboard")}
          />
        }
        footer={
          <>
            <SidebarControl icon={<BackgroundIcon background={background} />} label="Background">
              <BackgroundPicker value={background} onChange={setBackground} />
            </SidebarControl>
            <SidebarItem
              icon={
                <span className="size-4 shrink-0">
                  <ThemeIcon isDark={isDark} />
                </span>
              }
              label={isDark ? "Light mode" : "Dark mode"}
              onClick={() => toggleTheme()}
            />
            {me && !me.isGuest && <SidebarItem icon={<LogOut />} label="Log out" onClick={logOut} />}
          </>
        }
      >
        {isLocal && (
          <SidebarNote icon={<HardDrive />}>
            Saved in this browser only. Clearing browser data deletes it.
          </SidebarNote>
        )}
        {!isGuest && <SidebarItem icon={<LayoutDashboard />} label="Dashboard" onClick={() => navigate("/dashboard")} />}
        {isGuest && (
          <>
            <SidebarItem icon={<DownloadDoneIcon size={22} active={exported} className="-mx-[2px]" />} label="Export" title="Download a backup file" onClick={exportCanvas} />
            <SidebarItem
              icon={<ImportIcon size={22} active={imported} className="-mx-[2px]" />}
              label="Import"
              title="Add blocks from a backup file"
              onClick={startImport}
            />
            <SidebarSeparator />
          </>
        )}
        {isLocal && me && !me.isGuest ? (
          <SidebarItem icon={<CloudUpload />} label="Save to my account" onClick={handleMoveToAccount} />
        ) : (
          isGuest && (
            <SidebarItem
              icon={<AccountAddIcon key={signUpDraw} />}
              onMouseEnter={() => setSignUpDraw((n) => n + 1)}
              label="Sign up"
              title={isLocal ? "Sign up to keep this canvas" : "Sign up to save more canvases"}
              onClick={() => navigate("/", { state: { mode: "register" } })}
            />
          )
        )}
        {keptHere > 0 && (
          <SidebarItem
            icon={<RefreshCw />}
            label={uploadingKept ? "Uploading…" : `Retry (${keptHere})`}
            title={`${keptHere === 1 ? "1 item is" : `${keptHere} items are`} still only in this browser`}
            onClick={retryKept}
            disabled={uploadingKept}
          />
        )}
      </Sidebar>
      <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={importCanvas} />

      <EraserTrail active={mode === "erase"} isDark={isDark} />

      <CanvasToolbar
        activeTool={activeTool}
        onSelect={setMode}
        toolLocked={diagram.toolLocked}
        onToggleLock={diagram.toggleToolLock}
      />

      {/* beside the sidebar; slides right as it widens, so they never overlap */}
      {diagram.panelVisible && (
        <motion.div
          className="absolute left-[68px] top-20 z-20"
          initial={false}
          animate={{ x: sidebarOpen ? sidebarOpenShift() : 0 }}
          transition={SIDEBAR_TRANSITION}
        >
          <PropertiesPanel
            value={diagram.panelStyle}
            onChange={diagram.changeStyle}
            title={diagram.panelTitle}
            sections={diagram.panelSections}
            snap={mode === "draw" ? { on: snapShapes, onToggle: () => setSnapShapes((v) => !v) } : undefined}
            isDark={isDark}
          />
        </motion.div>
      )}

      {/* top-right: run button and share */}
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
        <ShareDrawer
          shareId={shareId}
          canvasId={canvasId}
          onMakePublic={handleShare}
          onMoveOnline={isLocal ? moveOnline : undefined}
          isDark={isDark}
        >
          <button
            title="Share canvas"
            onMouseEnter={() => shareIcon.current?.startAnimation()}
            onMouseLeave={() => shareIcon.current?.stopAnimation()}
            className="h-8 flex items-center justify-center rounded shadow-[0_2px_8px_rgba(0,0,0,0.12)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.6)] transition-colors px-2 text-xs bg-white text-gray-400 hover:text-gray-700 dark:bg-[#232329] dark:text-[#9b9ba8] dark:hover:text-[#f5f5f5]"
          >
            <LinkIcon ref={shareIcon} size={14} />
          </button>
        </ShareDrawer>
      </div>

      {/* who's here, under the top-right buttons — only once someone else has
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
        // several selected: only the box around them has handles (index.css)
        data-multi-select={selectedIds.length >= 2 || undefined}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "0 0",
          // for outlines and handles that keep their size on screen (screenPx)
          ["--inv-zoom" as string]: 1 / scale,
        }}
      >
        {selectedIds.length >= 2 && mode === "select" && (
          <SelectionBox
            ids={selectedIds}
            scale={scale}
            toCanvas={toCanvasPoint}
            onResizeStart={startGroupResize}
            move={{ positionOf: (id) => history.nodesRef.current.find((n) => n.id === id), onMove: moveSelection, onDragFrame: dragFrame }}
          />
        )}
        {nodes.length === 0 && mode === "text" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-300 text-sm font-mono select-none">
              click anywhere to start
            </p>
          </div>
        )}

        {diagram.draft && <ShapeDraftPreview draft={diagram.draft} style={diagram.style} isDark={isDark} />}

        {/* isolate: the blocks' z-indexes only order them among each other,
            so snap ghosts, strokes, outputs and cursors still draw on top */}
        <div className="isolate">
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
                onDragFrame={dragFrame}
                onMarkErase={handleMarkErase}
                pendingErase={pendingErase.has(node.id)}
                selected={selectedIds.includes(node.id)}
                mode={mode}
                isMouseDown={isMouseDown}
                isDark={isDark}
                zIndex={stackOrder.get(node.id) ?? 0}
              />
            ) : node.type === "draw" ? (
              <DrawingNode
                key={node.id}
                id={node.id}
                x={node.x}
                y={node.y}
                points={node.points ?? []}
                drawStyle={diagram.drawStyles.get(node.id) ?? DEFAULT_DRAW_STYLE}
                onMove={moveSelection}
                onDragFrame={dragFrame}
                onMarkErase={handleMarkErase}
                onResize={resizeDrawing}
                drawIn={drawingIn.get(node.id)}
                link={node.link}
                pendingErase={pendingErase.has(node.id)}
                selected={selectedIds.includes(node.id)}
                mode={mode}
                isMouseDown={isMouseDown}
                isDark={isDark}
                zIndex={stackOrder.get(node.id) ?? 0}
              />
            ) : node.type === "shape" ? (
              <ShapeNode
                key={node.id}
                drawIn={drawingIn.get(node.id)}
                id={node.id}
                x={node.x}
                y={node.y}
                content={node.content}
                onMove={moveSelection}
                onDragFrame={dragFrame}
                onMarkErase={handleMarkErase}
                onReshape={reshapeBlock}
                editing={diagram.labelEditId === node.id}
                onEditLabel={diagram.editShapeLabel}
                onLabelDone={diagram.endLabelEdit}
                bindHighlight={diagram.bindTargetId === node.id}
                link={node.link}
                pendingErase={pendingErase.has(node.id)}
                selected={selectedIds.includes(node.id)}
                mode={mode}
                isMouseDown={isMouseDown}
                isDark={isDark}
                // shapes stay below every other block (still ordered among
                // themselves), so text sitting in one can always be grabbed
                zIndex={(stackOrder.get(node.id) ?? 0) - nodes.length}
              />
            ) : node.type === "arrow" ? (
              <ArrowNode
                key={node.id}
                id={node.id}
                x={node.x}
                y={node.y}
                arrow={diagram.arrows.get(node.id) ?? parseArrow(node.content)}
                onMove={moveSelection}
                onDragFrame={dragFrame}
                onMarkErase={handleMarkErase}
                onReshape={reshapeBlock}
                editing={diagram.labelEditId === node.id}
                onEditingChange={diagram.setLabelEditing}
                onBindTarget={diagram.setBindTargetId}
                isShape={diagram.isBindableId}
                bindBoxOf={diagram.bindBoxOf}
                link={node.link}
                pendingErase={pendingErase.has(node.id)}
                selected={selectedIds.includes(node.id)}
                mode={mode}
                isMouseDown={isMouseDown}
                isDark={isDark}
                zIndex={stackOrder.get(node.id) ?? 0}
              />
            ) : (
              <FloatingNode
                key={node.id}
                id={node.id}
                x={node.x}
                y={node.y}
                content={node.content}
                language={node.language ?? "javascript"}
                color={node.color}
                onChange={updateNode}
                onLanguageChange={changeLanguage}
                onMove={moveSelection}
                onDragFrame={dragFrame}
                onSaveSelection={saveSelection}
                onMarkErase={handleMarkErase}
                pendingErase={pendingErase.has(node.id)}
                onRun={handleRunNode}
                autoFocus={node.id === focusNodeId}
                wrapWidth={node.wrapWidth ?? undefined}
                fontSize={node.fontSize ?? undefined}
                onResize={resizeText}
                selected={selectedIds.includes(node.id)}
                onEditingChange={handleTextEditing}
                link={node.link}
                mode={mode}
                isMouseDown={isMouseDown}
                isDark={isDark}
                zIndex={stackOrder.get(node.id) ?? 0}
              />
            ),
          )}
        </div>

        <SnapGhosts ghosts={snapGhosts} isDark={isDark} />

        {stroke.drawing && (
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ overflow: "visible" }}
          >
            {/* d is filled in by useFreehandStroke, once per frame */}
            <path
              ref={stroke.pathRef}
              // faded until it's done when snapping is on; it comes to life on release
              opacity={(snapShapes ? SNAP_FADED_OPACITY : 1) * (diagram.drawStyle.opacity / 100)}
              fill="none"
              {...drawStrokeProps(diagram.drawStyle, isDark)}
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

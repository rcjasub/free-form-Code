import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import FloatingNode from "@/components/FloatingNode";
import DrawingNode, { type Point } from "@/components/DrawingNode";
import ImageNode from "@/components/ImageNode";
import CanvasContextMenu from "@/components/CanvasContextMenu";
import RemoteCursorMarker from "@/components/RemoteCursorMarker";
import OutputBubble from "@/components/OutputBubble";
import PresenceMenu from "@/components/PresenceMenu";
import { ThemeToggleButton } from "@/components/ThemeToggle";
import socket from "@/lib/guestSocket";
import type { Mode } from "@/App";
import { Pencil, Shapes } from "lucide-react";
import { detectShape } from "@/lib/shapeDetection";
import { strokePath } from "@/lib/smoothPath";
import { parsePoints } from "@/lib/points";
import { jsonOrThrow, saveErrorMessage } from "@/lib/saveErrors";
import { LANGUAGE_OPTIONS, languageOption, type Language } from "@/lib/languages";
import { requestRun } from "@/lib/runCode";
import { getMe } from "@/API/auth";
import { useCanvasHistory, useCanvasShortcuts, type CanvasNode } from "@/hooks/useCanvasHistory";
import { type Output, makeRunKey, isAlreadyShown, placeOutput } from "@/lib/runOutputs";

// a block as this page holds it — see hooks/useCanvasHistory
type Node = CanvasNode;

// shape of a block as returned by GET /canvases/:id/blocks — only the
// fields this file actually reads off it.
interface ApiBlock {
  id: string;
  x: number;
  y: number;
  content: string;
  type?: string;
  language?: Language;
  width?: number;
  link?: string | null;
}

// draw blocks store their stroke as a JSON-encoded points array in `content`
function blockToNode(b: ApiBlock): Node {
  const common = { id: b.id, x: b.x, y: b.y, content: b.content, link: b.link ?? null };
  if (b.type === "draw") return { ...common, type: "draw", points: parsePoints(b.content) ?? [] };
  if (b.type === "image") return { ...common, type: "image", width: b.width };
  return { ...common, language: b.language };
}

interface RemoteCursor {
  userId: string;
  username: string;
  x: number;
  y: number;
}

// Outputs only ever leave the array via manual dismiss — without a cap, a
// user running many nodes accumulates output bubbles forever.
const MAX_OUTPUTS = 20;

const CURSOR_COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];
function getCursorColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

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

export default function SharedCanvas() {
  const { shareId } = useParams<{ shareId: string }>();
  const [searchParams] = useSearchParams();
  const canEdit = searchParams.get("edit") === "true";
  const navigate = useNavigate();
  const location = useLocation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [nodes, setNodes] = useState<Node[]>([]);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const nextId = useRef(1);
  // Latest outputs for handleRunNode's duplicate check, and runs still
  // waiting on a result.
  const outputsRef = useRef<Output[]>([]);
  const pendingRunKeys = useRef(new Set<string>());
  useEffect(() => {
    outputsRef.current = outputs;
  }, [outputs]);
  const [canvasId, setCanvasId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [mode, setMode] = useState<Mode>("select");
  const modeRef = useRef<Mode>("select");
  const [liveStroke, setLiveStroke] = useState<Point[] | null>(null);
  const [snapShapes, setSnapShapes] = useState(false);
  const contentSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [pendingErase, setPendingErase] = useState<Set<string>>(new Set());
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(new Map());
  // everyone in the room right now, from the server's "presence" broadcasts
  const [people, setPeople] = useState<{ userId: string; username: string }[]>([]);
  const lastCursorEmit = useRef(0);
  const canvasIdRef = useRef<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const errorToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  // undo stack — see hooks/useCanvasHistory
  const history = useCanvasHistory(nodes);
  // each drawing being resized right now -> how it looked before the drag
  const resizeStart = useRef<Record<string, Node>>({});

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const spaceHeld = useRef(false);
  const isMouseDown = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { offsetRef.current = offset; }, [offset]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);

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

  // check if user is logged in — guests come back from /me too, but they
  // have no dashboard, so they count as signed out here
  useEffect(() => {
    getMe()
      .then((user) => setUsername(user && !user.isGuest ? user.username : null))
      .catch(() => setUsername(null));
  }, []);

  // load canvas metadata + blocks
  useEffect(() => {
    if (!shareId) return;

    fetch(`/api/canvases/share/${shareId}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((canvas) => {
        if (!canvas) return;
        const id = String(canvas.id);
        canvasIdRef.current = id;
        setCanvasId(id);

        return fetch(`/api/canvases/${canvas.id}/blocks`, { credentials: "include" })
          .then((r) => r.json())
          .then((blocks) => {
            setNodes(blocks.map((b: ApiBlock) => blockToNode(b)));
            setLoading(false);
          });
      });
  }, [shareId]);

  // socket: join room + wire all real-time events
  useEffect(() => {
    if (!canvasId) return;

    // rejoin on every connect — a reconnect isn't in any room
    const joinCanvas = () =>
      socket.emit("canvas:join", canvasId, (res: { ok: boolean; error?: string }) => {
        if (!res.ok) console.error("[socket] canvas:join failed:", res.error);
      });
    socket.on("connect", joinCanvas);
    socket.connect();

    socket.on("block:created", (block) => {
      setNodes((prev) => [...prev, blockToNode(block)]);
    });
    socket.on("block:moved", (data) => {
      setNodes((prev) => prev.map((n) => n.id === data.id ? { ...n, x: data.x, y: data.y } : n));
    });
    socket.on("block:updated", (data) => {
      setNodes((prev) => prev.map((n) =>
        n.id === data.id
          ? {
              ...n,
              content: data.content,
              language: data.language ?? n.language,
              // a drawing's stroke lives in its content (e.g. after a resize)
              points: n.type === "draw" ? parsePoints(data.content) ?? n.points : n.points,
              link: "link" in data ? data.link : n.link,
            }
          : n,
      ));
    });
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
    socket.on("presence", (list: { userId: string; username: string }[]) => {
      setPeople(list);
    });
    socket.on("cursor:leave", ({ userId }: { userId: string }) => {
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    });

    return () => {
      socket.off("connect", joinCanvas);
      socket.off("block:created");
      socket.off("block:moved");
      socket.off("block:updated");
      socket.off("block:deleted");
      socket.off("cursor:move");
      socket.off("cursor:leave");
      socket.off("presence");
      socket.disconnect();
      setPeople([]);
    };
  }, [canvasId]);

  // pan + zoom keys
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        spaceHeld.current = true;
        document.body.style.cursor = "grab";
      }
      if (canEdit) {
        const tag = (e.target as HTMLElement)?.tagName;
        const isEditable = (e.target as HTMLElement)?.isContentEditable;
        const inEditor = tag === "TEXTAREA" || tag === "INPUT" || isEditable;
        if (!inEditor && !e.ctrlKey && !e.metaKey && !e.repeat) {
          if (e.key === "v" || e.key === "V") setMode("select");
          if (e.key === "h" || e.key === "H") setMode("hand");
          if (e.key === "t" || e.key === "T") setMode("text");
          if (e.key === "e" || e.key === "E") setMode("erase");
          if (e.key === "d" || e.key === "D") setMode("draw");
        }
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

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    setOffset((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
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
      document.body.style.cursor = spaceHeld.current || m === "hand" ? "grab" : "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function zoomIn() {
    const next = Math.min(+(scaleRef.current + 0.1).toFixed(1), 3);
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    setOffset((prev) => ({
      x: cx - (cx - prev.x) * (next / scaleRef.current),
      y: cy - (cy - prev.y) * (next / scaleRef.current),
    }));
    setScale(next);
  }

  function zoomOut() {
    const next = Math.max(+(scaleRef.current - 0.1).toFixed(1), 0.2);
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    setOffset((prev) => ({
      x: cx - (cx - prev.x) * (next / scaleRef.current),
      y: cy - (cy - prev.y) * (next / scaleRef.current),
    }));
    setScale(next);
  }

  function showError(message: string) {
    setErrorToast(message);
    if (errorToastTimer.current) clearTimeout(errorToastTimer.current);
    errorToastTimer.current = setTimeout(() => setErrorToast(null), 4000);
  }

  // Fetch with a bounded timeout — a hung backend (e.g. a downstream
  // dependency like Redis stuck instead of failing fast) would otherwise
  // leave an awaited fetch pending forever, silently dropping whatever the
  // user just did with no error and no way to retry.
  async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = 10000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  // updateNode/moveNode/deleteNode below are optimistic-only: local state
  // updates immediately, the network write fires after with no rollback
  // and no error surfaced to the user if it fails (fetch errors are
  // swallowed). Acceptable for now, but a real gap — a failed write here
  // leaves the client's view permanently out of sync with the DB until
  // the next reload.
  const updateNode = useCallback((id: string, content: string) => {
    if (!canEdit) return;
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n)));
    if (contentSaveTimer.current) clearTimeout(contentSaveTimer.current);
    contentSaveTimer.current = setTimeout(() => {
      const cid = canvasIdRef.current;
      if (cid) {
        fetch(`/api/canvases/${cid}/blocks/${id}/content`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ content }),
        })
          .then(jsonOrThrow)
          .catch((err) => showError(saveErrorMessage(err, "Couldn't save your changes — check your connection and try again.")));
        socket.emit("block:updated", cid, { id, content });
      }
    }, 800);
  }, [canEdit]);

  // `record` is false when undo itself is doing the move/delete, so undoing
  // doesn't push a new history entry.
  const moveNode = useCallback((id: string, x: number, y: number, record = true) => {
    if (!canEdit) return;
    // A drag calls this many times; only its first call (no save pending
    // yet) records where the block started.
    if (record && !moveSaveTimers.current[id]) {
      const before = history.nodesRef.current.find((n) => n.id === id);
      if (before) history.record({ kind: "move", id, x: before.x, y: before.y });
    }
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
    const cid = canvasIdRef.current;
    if (!cid) return;
    // socket emit stays immediate so other viewers see live drag movement;
    // only the DB write is debounced, since dragging fires this on every
    // mousemove (tens of times/sec) and only the settled position needs
    // to be persisted.
    socket.emit("block:moved", cid, { id, x, y });
    clearTimeout(moveSaveTimers.current[id]);
    moveSaveTimers.current[id] = setTimeout(() => {
      delete moveSaveTimers.current[id];
      fetch(`/api/canvases/${cid}/blocks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ x, y }),
      });
    }, 300);
  }, [canEdit, history]);

  const deleteNode = useCallback((id: string, record = true) => {
    if (!canEdit) return;
    const node = history.nodesRef.current.find((n) => n.id === id);
    if (record && node) history.record({ kind: "delete", nodes: [node] });
    setNodes((prev) => prev.filter((n) => n.id !== id));
    const cid = canvasIdRef.current;
    if (cid) {
      fetch(`/api/canvases/${cid}/blocks/${id}`, { method: "DELETE", credentials: "include" });
      socket.emit("block:deleted", cid, id);
    }
  }, [canEdit, history]);

  // Sets a drawing's position and stroke (its content) — for resizing and
  // for undoing a resize. `save` is false for the in-between frames of a drag.
  const applyShape = useCallback((id: string, x: number, y: number, content: string, save = true) => {
    const cid = canvasIdRef.current;
    if (!canEdit || !cid) return;
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y, content, points: JSON.parse(content) } : n)));
    socket.emit("block:moved", cid, { id, x, y });
    socket.emit("block:updated", cid, { id, content });
    if (save) {
      const send = (path: string, method: string, body: object) =>
        fetch(`/api/canvases/${cid}/blocks/${id}${path}`, {
          method,
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
      send("", "PUT", { x, y });
      send("/content", "PATCH", { content });
    }
  }, [canEdit]);

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
  // Sets or removes a block's link — for the right-click menu and for undo.
  const applyLink = useCallback((id: string, link: string | null) => {
    const cid = canvasIdRef.current;
    const node = history.nodesRef.current.find((n) => n.id === id);
    if (!canEdit || !cid || !node) return;
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, link } : n)));
    fetch(`/api/canvases/${cid}/blocks/${id}/link`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ link }),
    });
    // block:updated requires content; resending the current content changes nothing
    socket.emit("block:updated", cid, { id, content: node.content, link });
  }, [canEdit, history]);

  const recreateBlock = useCallback(async (src: Node, x: number, y: number) => {
    const cid = canvasIdRef.current;
    if (!canEdit || !cid) return null;
    const type = src.type === "draw" || src.type === "image" ? src.type : "code";
    try {
      const res = await fetchWithTimeout(`/api/canvases/${cid}/blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type,
          content: src.content,
          x,
          y,
          width: type === "draw" ? Math.max(...(src.points ?? []).map((p) => p.x), 1) : src.width ?? 300,
        }),
      });
      const data = await jsonOrThrow(res);
      // the create endpoint ignores language and link, so set them in follow-up calls
      const patch = (path: string, body: object) =>
        fetchWithTimeout(`/api/canvases/${cid}/blocks/${data.id}/${path}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
      if (src.language) await patch("language", { language: src.language });
      if (src.link) await patch("link", { link: src.link });
      const block = { ...data, language: src.language, link: src.link ?? null };
      setNodes((prev) => [...prev, blockToNode(block)]);
      socket.emit("block:created", cid, block);
      return String(data.id);
    } catch (err) {
      showError(saveErrorMessage(err, "Couldn't restore the block — check your connection and try again."));
      return null;
    }
  }, [canEdit]);

  // Sets a block's language and content — saving content only if it changed.
  const applyLanguage = useCallback((id: string, language: Language, content: string) => {
    const cid = canvasIdRef.current;
    if (!canEdit || !cid) return;
    const before = history.nodesRef.current.find((n) => n.id === id);
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, language, content } : n)));
    const patch = (path: string, body: object) =>
      fetch(`/api/canvases/${cid}/blocks/${id}/${path}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
    patch("language", { language });
    if (content !== before?.content) patch("content", { content });
    socket.emit("block:updated", cid, { id, content, language });
  }, [canEdit, history]);

  // Ctrl+Z undo, click-to-select, Ctrl+C / Ctrl+V on blocks
  const { selectedId, pointer, contextMenu } = useCanvasShortcuts({
    enabled: canEdit,
    nodes,
    history,
    ops: { deleteNode, moveNode, applyLanguage, applyShape, applyLink, recreateBlock },
    onError: showError,
    canvasRef,
    rootRef,
  });

  const handleRunNode = useCallback(async (id: string) => {
    if (!canEdit) return;
    const node = nodes.find((n) => n.id === id);
    if (!node || !node.content.trim() || !socket.id) return;

    const el = document.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null;
    let x = node.x + 220;
    let y = node.y;
    if (el) {
      const rect = el.getBoundingClientRect();
      x = (rect.right + 20 - offsetRef.current.x) / scaleRef.current;
      y = (rect.top - offsetRef.current.y) / scaleRef.current;
    }

    // Same rules as the main canvas (lib/runOutputs): unchanged code whose
    // output is still showing doesn't run again; changed code's output goes
    // beside the previous one.
    const language = node.language ?? "javascript";
    const runKey = makeRunKey(id, language, node.content);
    if (pendingRunKeys.current.has(runKey) || isAlreadyShown(outputsRef.current, runKey)) return;
    pendingRunKeys.current.add(runKey);
    try {
      // requestRun matches the result to this run by id, so overlapping runs
      // each get their own output.
      const { output, error } = await requestRun(socket, node.content, language);
      const outputId = nextId.current++;
      setOutputs((prev) => {
        const pos = placeOutput(prev, id, { x, y }, scaleRef.current);
        return [
          ...prev,
          { id: outputId, ...pos, text: output, isError: error, sourceId: id, runKey },
        ].slice(-MAX_OUTPUTS);
      });
    } finally {
      pendingRunKeys.current.delete(runKey);
    }
  }, [canEdit, nodes]);

  const changeLanguage = useCallback((id: string, language: Language) => {
    if (!canEdit) return;
    const node = nodes.find((n) => n.id === id);
    if (!node || !canvasIdRef.current) return;

    // Swap in the new language's starter if the block is empty or still holds
    // another language's untouched starter; never overwrite real code.
    const isUntouched =
      !node.content.trim() || LANGUAGE_OPTIONS.some((l) => l.starter === node.content);
    const content = isUntouched ? (languageOption(language).starter ?? "") : node.content;

    history.record({ kind: "language", id, language: node.language ?? "javascript", content: node.content });
    applyLanguage(id, language, content);
  }, [canEdit, nodes, history, applyLanguage]);

  const handleMarkErase = useCallback((id: string) => {
    if (!canEdit) return;
    setPendingErase((prev) => new Set([...prev, id]));
  }, [canEdit]);

  const dismissOutput = useCallback((id: number) => {
    setOutputs((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const moveOutput = useCallback((id: number, x: number, y: number) => {
    setOutputs((prev) => prev.map((o) => (o.id === id ? { ...o, x, y } : o)));
  }, []);

  function handleMouseMove(e: React.MouseEvent) {
    const x = (e.clientX - offsetRef.current.x) / scaleRef.current;
    const y = (e.clientY - offsetRef.current.y) / scaleRef.current;
    pointer.current = { x, y };
    const id = canvasIdRef.current;
    if (!id) return;
    const now = Date.now();
    if (now - lastCursorEmit.current < 50) return;
    lastCursorEmit.current = now;
    socket.emit("cursor:move", id, { x, y });
  }

  async function finalizeDrawing(rawPoints: Point[]) {
    if (rawPoints.length < 2 || !canvasId) return;
    const points = snapShapes ? detectShape(rawPoints) ?? rawPoints : rawPoints;
    const minX = Math.min(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxX = Math.max(...points.map((p) => p.x));
    const relPoints = points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
    try {
      const res = await fetchWithTimeout(`/api/canvases/${canvasId}/blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: "draw",
          content: JSON.stringify(relPoints),
          x: minX,
          y: minY,
          width: Math.max(maxX - minX, 1),
        }),
      });
      const data = await jsonOrThrow(res);
      setNodes((prev) => [...prev, blockToNode(data)]);
      socket.emit("block:created", canvasId, data);
      history.record({ kind: "create", id: String(data.id) });
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

  function handleDrawMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!canEdit || modeRef.current !== "draw" || !isCanvasBackground(e)) return;
    const points: Point[] = [
      { x: (e.clientX - offsetRef.current.x) / scaleRef.current, y: (e.clientY - offsetRef.current.y) / scaleRef.current },
    ];
    setLiveStroke(points);

    function onMouseMove(mv: MouseEvent) {
      points.push({ x: (mv.clientX - offsetRef.current.x) / scaleRef.current, y: (mv.clientY - offsetRef.current.y) / scaleRef.current });
      setLiveStroke([...points]);
    }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setLiveStroke(null);
      finalizeDrawing(points);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  async function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!canEdit || !canvasId || modeRef.current !== "text") return;
    if (!isCanvasBackground(e)) return;
    const x = (e.clientX - offsetRef.current.x) / scaleRef.current;
    const y = (e.clientY - offsetRef.current.y) / scaleRef.current;
    try {
      const res = await fetchWithTimeout(`/api/canvases/${canvasId}/blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "code", content: "", x, y, width: 300 }),
      });
      const data = await jsonOrThrow(res);
      setNodes((prev) => [...prev, { id: data.id, x: data.x, y: data.y, content: data.content }]);
      socket.emit("block:created", canvasId, data);
      history.record({ kind: "create", id: data.id });
    } catch (err) {
      showError(saveErrorMessage(err, "Couldn't create the block — check your connection and try again."));
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#121212]">
        <p className="text-sm text-gray-400">Canvas not found or is private.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#121212]">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`relative w-screen h-screen overflow-hidden select-none ${mode === "select" ? "dot-cursor" : "cursor-default"}`}
      style={{
        backgroundColor: isDark ? "#121212" : "#ffffff",
        backgroundImage: `radial-gradient(circle, ${isDark ? "#2c2c2c" : "#d1d5db"} 1px, transparent 1px)`,
        backgroundSize: "28px 28px",
      }}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onClick={handleCanvasClick}
      onMouseDown={(e) => { isMouseDown.current = true; handlePanStart(e); handleDrawMouseDown(e); }}
      onMouseUp={() => (isMouseDown.current = false)}
    >
      {/* top-left: canvas info */}
      <div
        className={`absolute top-3 left-4 z-20 flex items-center gap-3 border rounded-lg shadow-sm px-3 py-1.5 ${
          isDark ? "bg-[#232329] border-[#3c3c4a]" : "bg-white border-gray-200"
        }`}
      >
        {/* just "Shared" — the owner's canvas name (often the default
            "My Canvas") read like a link to the visitor's own, and edit
            access already shows through the toolbar */}
        <span className={`text-xs font-medium ${isDark ? "text-[#9b9ba8]" : "text-gray-500"}`}>
          Shared
        </span>
        {username ? (
          <button
            onClick={() => navigate("/dashboard")}
            className="text-xs text-[#4fb4f2] hover:underline"
          >
            My canvases →
          </button>
        ) : (
          <button
            // come back to this exact link (incl. ?edit=true) after signing in
            onClick={() =>
              navigate("/", { state: { mode: "register", redirect: location.pathname + location.search } })
            }
            className="text-xs text-[#4fb4f2] hover:underline"
          >
            Register
          </button>
        )}
      </div>

      {/* transient error toast */}
      {errorToast && (
        <div
          className={`absolute bottom-16 left-1/2 -translate-x-1/2 z-30 text-xs px-3 py-2 rounded-lg shadow-sm border ${
            isDark ? "bg-[#3a1f1f] border-[#5c2c2c] text-[#f5b5b5]" : "bg-red-50 border-red-200 text-red-600"
          }`}
        >
          {errorToast}
        </div>
      )}

      {/* mode toolbar — only in edit mode */}
      {canEdit && (
        <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 border rounded-lg shadow-sm p-1 ${isDark ? "bg-[#232329] border-[#3c3c4a]" : "bg-white border-gray-200"}`}>
          {(["select", "hand", "text", "erase", "draw"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              title={m.charAt(0).toUpperCase() + m.slice(1)}
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
                mode === m
                  ? isDark ? "bg-[#3c3c4a] text-[#f5f5f5]" : "bg-gray-100 text-gray-800"
                  : isDark ? "text-[#9b9ba8] hover:text-[#f5f5f5]" : "text-gray-400 hover:text-gray-700"
              }`}
            >
              {m === "select" && <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M1.5 1L6 12l2.2-3.8L12 6 1.5 1z" /></svg>}
              {m === "hand" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V8a2 2 0 0 0-4 0v3M14 11V6a2 2 0 0 0-4 0v5M10 11V8a2 2 0 0 0-4 0v8a6 6 0 0 0 12 0v-5a2 2 0 0 0-4 0v0" /></svg>}
              {m === "text" && <span className="text-xs font-bold leading-none">T</span>}
              {m === "erase" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20H7L3 16l13-13 4 4-6.5 6.5" /><path d="M6.5 17.5l4-4" /></svg>}
              {m === "draw" && <Pencil size={14} />}
            </button>
          ))}
        </div>
      )}

      {/* top-right */}
      <div className="absolute top-3 right-4 z-20 flex items-center gap-2">
        {canEdit && (
          <button
            onClick={() => setSnapShapes((v) => !v)}
            title="Snap drawings to perfect shapes"
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors border ${
              snapShapes
                ? "bg-blue-500 border-blue-500 text-white"
                : isDark
                  ? "bg-[#232329] border-[#3c3c4a] text-[#9b9ba8] hover:text-[#f5f5f5]"
                  : "bg-white border-gray-200 text-gray-400 hover:text-gray-700"
            }`}
          >
            <Shapes size={14} />
          </button>
        )}
        <ThemeToggleButton />
      </div>

      {/* who's here, under the theme toggle */}
      <div className="absolute top-[60px] right-4 z-20">
        <PresenceMenu
          people={people.map((p) => ({ ...p, color: getCursorColor(p.userId) }))}
          myId={socket.id}
          isDark={isDark}
        />
      </div>

      {/* canvas */}
      <div
        ref={canvasRef}
        className={`w-full h-full ${canEdit && mode === "draw" ? "cursor-crosshair" : canEdit && mode === "text" ? "dot-cursor" : canEdit && mode === "hand" ? "cursor-grab" : ""}`}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
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
              onMove={moveNode}
              onMarkErase={handleMarkErase}
              pendingErase={pendingErase.has(node.id)}
              selected={selectedId === node.id}
              mode={canEdit ? mode : "select"}
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
              onMove={moveNode}
              onMarkErase={handleMarkErase}
              onResize={canEdit ? resizeDrawing : undefined}
              link={node.link}
              pendingErase={pendingErase.has(node.id)}
              selected={selectedId === node.id}
              mode={canEdit ? mode : "select"}
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
              onLanguageChange={canEdit ? changeLanguage : undefined}
              onMove={moveNode}
              onMarkErase={handleMarkErase}
              pendingErase={pendingErase.has(node.id)}
              onRun={handleRunNode}
              link={node.link}
              mode={canEdit ? mode : "select"}
              isMouseDown={isMouseDown}
              isDark={isDark}
            />
          ),
        )}

        {liveStroke && liveStroke.length > 1 && (
          <svg className="absolute inset-0 pointer-events-none" style={{ overflow: "visible" }}>
            <path
              d={strokePath(liveStroke)}
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
            onDelete={dismissOutput}
            onMove={moveOutput}
            mode={mode}
            isMouseDown={isMouseDown}
            isDark={isDark}
          />
        ))}

        <RemoteCursors cursors={remoteCursors} mySocketId={socket.id} />
      </div>

      {contextMenu && <CanvasContextMenu {...contextMenu} isDark={isDark} />}

      {/* zoom controls */}
      <div
        className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 border rounded-lg shadow-sm px-2 py-1 ${
          isDark ? "bg-[#232329] border-[#3c3c4a]" : "bg-white border-gray-200"
        }`}
      >
        <button
          className={`text-sm font-mono w-6 h-6 flex items-center justify-center transition-colors ${isDark ? "text-[#9b9ba8] hover:text-[#f5f5f5]" : "text-gray-400 hover:text-gray-700"}`}
          onClick={zoomOut}
        >
          −
        </button>
        <span className={`text-xs font-mono w-10 text-center ${isDark ? "text-[#9b9ba8]" : "text-gray-400"}`}>
          {Math.round(scale * 100)}%
        </span>
        <button
          className={`text-sm font-mono w-6 h-6 flex items-center justify-center transition-colors ${isDark ? "text-[#9b9ba8] hover:text-[#f5f5f5]" : "text-gray-400 hover:text-gray-700"}`}
          onClick={zoomIn}
        >
          +
        </button>
      </div>
    </div>
  );
}

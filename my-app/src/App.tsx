import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import { useParams, useNavigate } from "react-router-dom";
import FloatingNode from "./components/FloatingNode";
import OutputBubble from "./components/OutputBubble";
import { ThemeToggleButton } from "./components/ThemeToggle";
import ShareDrawer from "./components/ShareDrawer";
import socket from "./lib/socket";
import { useCallback } from "react";

import {
  getAllBlocks,
  createBlock,
  updateBlockPosition,
  deleteBlock,
  updateBlockContent,
} from "./API/block";
import "./App.css";

export type Mode = "select" | "hand" | "text" | "erase";

interface Node {
  id: string;
  x: number;
  y: number;
  content: string;
}

interface Output {
  id: number;
  x: number;
  y: number;
  text: string;
  isError: boolean;
}

interface RemoteCursor {
  userId: string;
  username: string;
  x: number;
  y: number;
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
        .map((cursor) => {
          const color = getCursorColor(cursor.userId);
          return (
            <div
              key={cursor.userId}
              className="absolute pointer-events-none"
              style={{ left: cursor.x, top: cursor.y, zIndex: 9999 }}
            >
              <svg width="16" height="16" viewBox="0 0 14 14" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }}>
                <path d="M1.5 1L6 12l2.2-3.8L12 6 1.5 1z" fill={color} stroke="white" strokeWidth="0.5" />
              </svg>
              <span
                className="absolute left-4 top-0 text-[10px] font-medium px-1 py-0.5 rounded whitespace-nowrap"
                style={{ backgroundColor: color, color: "#fff" }}
              >
                {cursor.username}
              </span>
            </div>
          );
        })}
    </>
  );
});

export default function App() {
  const { canvasId } = useParams<{ canvasId: string }>();
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const nextId = useRef(1);
  const contentSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const [mode, setMode] = useState<Mode>("select");
  const modeRef = useRef<Mode>("select");
  const [shareId, setShareId] = useState<string | null>(null);
  const [pendingErase, setPendingErase] = useState<Set<string>>(new Set());
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(new Map());
  const lastCursorEmit = useRef(0);
  const { resolvedTheme } = useTheme();
  const lastSelection = useRef<{
    content: string;
    el: HTMLElement;
  } | null>(null);
  const spaceHeld = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const isMouseDown = useRef(false);

  // flush pending erase on mouseup
  useEffect(() => {
    function onMouseUp() {
      if (pendingErase.size === 0) return;
      pendingErase.forEach(id => deleteNode(id));
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

    console.log("[socket] connected:", socket.connected);

    const joinCanvas = () => {
      socket.emit("canvas:join", canvasId);
      console.log("[socket] joined canvas:", canvasId);
    };

    if (socket.connected) {
      joinCanvas();
    } else {
      socket.once("connect", joinCanvas);
    }

    // fetch canvas metadata to get share_id
    fetch(`/api/canvases/${canvasId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setShareId(data.share_id));

    // load blocks from DB on mount
    getAllBlocks(canvasId).then(({ data }) => {
      setNodes(
        data.map((b: any) => ({
          id: b.id,
          x: b.x,
          y: b.y,
          content: b.content,
        })),
      );
    });

    // someone else created a block
    socket.on("block:created", (block) => {
      console.log("[socket] received block:created", block);
      setNodes((prev) => [
        ...prev,
        { id: block.id, x: block.x, y: block.y, content: block.content },
      ]);
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
          n.id === data.id ? { ...n, content: data.content } : n,
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

    // cleanup when you leave the page
    return () => {
      socket.off("connect", joinCanvas);
      socket.off("block:created");
      socket.off("block:moved");
      socket.off("block:updated");
      socket.off("block:deleted");
      socket.off("cursor:move");
      socket.off("cursor:leave");
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

  async function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (mode !== "text") return;
    if (e.target !== canvasRef.current) return;
    if (!canvasId) return;
    const x = (e.clientX - offset.x) / scale;
    const y = (e.clientY - offset.y) / scale;
    const { data } = await createBlock(canvasId, x, y);
    setNodes((prev) => [
      ...prev,
      { id: data.id, x: data.x, y: data.y, content: data.content },
    ]);
    console.log("[socket] emitting block:created", data);
    socket.emit("block:created", canvasId, data);
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

      socket.once("run:complete", ({ output, error }) => {
        setOutputs((prev) => [
          ...prev,
          { id: nextId.current++, x, y, text: output, isError: !!error },
        ]);
      });

      try {
        await fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            code,
            language: "javascript",
            socketId: socket.id,
          }),
        });
      } catch {
        setOutputs((prev) => [
          ...prev,
          {
            id: nextId.current++,
            x,
            y,
            text: "Failed to reach server",
            isError: true,
          },
        ]);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // useCallback keeps the same function reference between renders.
  // Without it, App re-rendering (e.g. from a cursor:move) would create a new
  // function every time → FloatingNode's React.memo would see a changed prop
  // and re-render even though the node data didn't change.
  // With useCallback: same canvasId → same function reference → memo skips re-render.
  const updateNode = useCallback((id: string, content: string) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n)));
    if (contentSaveTimer.current) clearTimeout(contentSaveTimer.current);
    contentSaveTimer.current = setTimeout(() => {
      if (canvasId) {
        updateBlockContent(canvasId, id, content);
        console.log("[socket] emitting block:updated", { id, content });
        socket.emit("block:updated", canvasId, { id, content });
      }
    }, 800);
  }, [canvasId]);

  const moveNode = useCallback((id: string, x: number, y: number) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
    if (canvasId) {
      updateBlockPosition(canvasId, id, x, y);
      socket.emit("block:moved", canvasId, { id, x, y });
    }
  }, [canvasId]);

  const deleteNode = useCallback((id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    if (canvasId) {
      deleteBlock(canvasId, id);
      socket.emit("block:deleted", canvasId, id);
    }
  }, [canvasId]);

  // saveSelection only writes to a ref — no canvasId dependency, always stable.
  const saveSelection = useCallback((content: string, el: HTMLElement) => {
    lastSelection.current = { content, el };
  }, []);

  function dismissOutput(id: number) {
    setOutputs((prev) => prev.filter((o) => o.id !== id));
  }

  function moveOutput(id: number, x: number, y: number) {
    setOutputs((prev) => prev.map((o) => (o.id === id ? { ...o, x, y } : o)));
  }

  // nodes is the only real dependency — offset/scale are read from refs
  // so the function only recreates when blocks actually change, not on cursor moves.
  const handleRunNode = useCallback(async (id: string) => {
    const node = nodes.find((n) => n.id === id);
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

    socket.once("run:complete", ({ output, error }) => {
      setOutputs((prev) => [
        ...prev,
        { id: nextId.current++, x, y, text: output, isError: !!error },
      ]);
    });

    try {
      await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: node.content, language: "javascript", socketId: socket.id }),
      });
    } catch {
      setOutputs((prev) => [
        ...prev,
        { id: nextId.current++, x, y, text: "Failed to reach server", isError: true },
      ]);
    }
  }, [nodes]);

  // inline lambda in JSX would be a new reference every render — extracted so memo works
  const handleMarkErase = useCallback((id: string) => {
    setPendingErase((prev) => new Set([...prev, id]));
  }, []);

  function handleMouseMove(e: React.MouseEvent) {
    if (!canvasId) return;
    const now = Date.now();
    if (now - lastCursorEmit.current < 50) return;
    lastCursorEmit.current = now;
    const x = (e.clientX - offsetRef.current.x) / scaleRef.current;
    const y = (e.clientY - offsetRef.current.y) / scaleRef.current;
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
      : mode === "text"
        ? "cursor-crosshair"
        : "cursor-default";

  const toolbarBtn = (m: Mode, label: React.ReactNode, title: string) => (
    <button
      onClick={() => setMode(m)}
      title={title}
      className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
        mode === m
          ? "bg-gray-100 text-gray-800 dark:bg-[#3c3c4a] dark:text-[#f5f5f5]"
          : "text-gray-400 hover:text-gray-700 dark:text-[#9b9ba8] dark:hover:text-[#f5f5f5]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden select-none ${cursorClass}`}
      style={{
        backgroundColor: isDark ? "#121212" : "#ffffff",
        backgroundImage: `radial-gradient(circle, ${isDark ? "#2c2c2c" : "#d1d5db"} 1px, transparent 1px)`,
        backgroundSize: "28px 28px",
        cursor: mode === "erase" ? eraserCursor : undefined,
      }}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onMouseDown={(e) => {
        isMouseDown.current = true;
        handlePanStart(e);
      }}
      onMouseUp={() => (isMouseDown.current = false)}
    >
      {/* branding */}
      <div className="absolute top-4 left-4 z-10">
        <span
          onClick={() => navigate("/dashboard")}
          className="text-xs font-semibold tracking-widest uppercase text-gray-500 dark:text-gray-300 cursor-pointer hover:text-gray-800 dark:hover:text-white transition-colors"
        >
          free-form
        </span>
      </div>

      {/* mode toolbar */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 border rounded-lg shadow-sm p-1 bg-white border-gray-200 dark:bg-[#232329] dark:border-[#3c3c4a]"
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

      {/* top-right: run hint + dark/light toggle */}
      <div className="absolute top-3 right-4 z-20 flex items-center gap-2">
        <span className="text-xs font-mono pointer-events-none text-gray-500 dark:text-gray-300">
          select code + ctrl+enter to run
        </span>
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
          className="w-8 h-8 flex items-center justify-center rounded transition-colors border bg-white border-gray-200 text-gray-400 hover:text-gray-700 dark:bg-[#232329] dark:border-[#3c3c4a] dark:text-[#9b9ba8] dark:hover:text-[#f5f5f5]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </button>
        <ShareDrawer shareId={shareId} canvasId={canvasId} onMakePublic={handleShare} isDark={isDark}>
          <button
            title="Share canvas"
            className="h-8 flex items-center justify-center rounded transition-colors border px-2 text-xs bg-white border-gray-200 text-gray-400 hover:text-gray-700 dark:bg-[#232329] dark:border-[#3c3c4a] dark:text-[#9b9ba8] dark:hover:text-[#f5f5f5]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>
        </ShareDrawer>
        <ThemeToggleButton />
      </div>

      {/* canvas */}
      <div
        ref={canvasRef}
        className="w-full h-full"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "0 0",
        }}
        onClick={handleCanvasClick}
      >
        {nodes.length === 0 && mode === "text" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-300 text-sm font-mono select-none">
              click anywhere to start
            </p>
          </div>
        )}

        {nodes.map((node) => (
          <FloatingNode
            key={node.id}
            id={node.id}
            x={node.x}
            y={node.y}
            content={node.content}
            onChange={updateNode}
            onMove={moveNode}
            onSaveSelection={saveSelection}
            onDelete={deleteNode}
            onMarkErase={handleMarkErase}
            pendingErase={pendingErase.has(node.id)}
            onRun={handleRunNode}
            mode={mode}
            isMouseDown={isMouseDown}
            isDark={isDark}
          />
        ))}

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

      {/* zoom controls */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 border rounded-lg shadow-sm px-2 py-1 bg-white border-gray-200 dark:bg-[#232329] dark:border-[#3c3c4a]"
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

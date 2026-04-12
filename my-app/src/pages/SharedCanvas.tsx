import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTheme } from "next-themes";
import FloatingNode from "@/components/FloatingNode";
import { ThemeToggleButton } from "@/components/ThemeToggle";
import socket from "@/lib/socket";
import type { Mode } from "@/App";

interface Node {
  id: string;
  x: number;
  y: number;
  content: string;
}

export default function SharedCanvas() {
  const { shareId } = useParams<{ shareId: string }>();
  const [searchParams] = useSearchParams();
  const canEdit = searchParams.get("edit") === "true";
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [nodes, setNodes] = useState<Node[]>([]);
  const [canvasId, setCanvasId] = useState<string | null>(null);
  const [canvasName, setCanvasName] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [mode, setMode] = useState<Mode>("select");
  const modeRef = useRef<Mode>("select");
  const contentSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const spaceHeld = useRef(false);
  const isMouseDown = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => { offsetRef.current = offset; }, [offset]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);

  // check if user is logged in
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then(({ user }) => setUsername(user?.username ?? null));
  }, []);

  // load canvas + blocks
  useEffect(() => {
    if (!shareId) return;

    fetch(`/api/canvases/share/${shareId}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((canvas) => {
        if (!canvas) return;
        setCanvasName(canvas.name);
        setCanvasId(canvas.id);

        // join socket room
        const joinCanvas = () => socket.emit("canvas:join", canvas.id);
        if (socket.connected) joinCanvas();
        else socket.once("connect", joinCanvas);

        // load blocks
        return fetch(`/api/canvases/${canvas.id}/blocks`)
          .then((r) => r.json())
          .then((blocks) => {
            setNodes(blocks.map((b: any) => ({ id: b.id, x: b.x, y: b.y, content: b.content })));
            setLoading(false);

            // live updates from owner
            socket.on("block:created", (block) => {
              setNodes((prev) => [...prev, { id: block.id, x: block.x, y: block.y, content: block.content }]);
            });
            socket.on("block:moved", (data) => {
              setNodes((prev) => prev.map((n) => n.id === data.id ? { ...n, x: data.x, y: data.y } : n));
            });
            socket.on("block:updated", (data) => {
              setNodes((prev) => prev.map((n) => n.id === data.id ? { ...n, content: data.content } : n));
            });
            socket.on("block:deleted", (blockId) => {
              setNodes((prev) => prev.filter((n) => n.id !== blockId));
            });
          });
      });

    return () => {
      socket.off("block:created");
      socket.off("block:moved");
      socket.off("block:updated");
      socket.off("block:deleted");
    };
  }, [shareId]);

  // pan + zoom
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
    if (!isMiddle && !isSpaceDrag) return;
    e.preventDefault();
    document.body.style.cursor = "grabbing";
    const startX = e.clientX - offsetRef.current.x;
    const startY = e.clientY - offsetRef.current.y;
    function onMouseMove(e: MouseEvent) {
      setOffset({ x: e.clientX - startX, y: e.clientY - startY });
    }
    function onMouseUp() {
      document.body.style.cursor = spaceHeld.current ? "grab" : "";
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

  // edit mode handlers
  function updateNode(id: string, content: string) {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n)));
    if (contentSaveTimer.current) clearTimeout(contentSaveTimer.current);
    contentSaveTimer.current = setTimeout(() => {
      if (canvasId) {
        fetch(`/api/canvases/${canvasId}/blocks/${id}/content`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        socket.emit("block:updated", canvasId, { id, content });
      }
    }, 800);
  }

  function moveNode(id: string, x: number, y: number) {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
    if (canvasId) {
      fetch(`/api/canvases/${canvasId}/blocks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y }),
      });
      socket.emit("block:moved", canvasId, { id, x, y });
    }
  }

  function deleteNode(id: string) {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    if (canvasId) {
      fetch(`/api/canvases/${canvasId}/blocks/${id}`, { method: "DELETE" });
      socket.emit("block:deleted", canvasId, id);
    }
  }

  async function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!canEdit || !canvasId || modeRef.current !== "text") return;
    if (e.target !== canvasRef.current) return;
    const x = (e.clientX - offsetRef.current.x) / scaleRef.current;
    const y = (e.clientY - offsetRef.current.y) / scaleRef.current;
    const res = await fetch(`/api/canvases/${canvasId}/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "code", content: "", x, y, width: 300 }),
    });
    const data = await res.json();
    setNodes((prev) => [...prev, { id: data.id, x: data.x, y: data.y, content: data.content }]);
    socket.emit("block:created", canvasId, data);
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
      className={`relative w-screen h-screen overflow-hidden select-none cursor-default`}
      style={{
        backgroundColor: isDark ? "#121212" : "#ffffff",
        backgroundImage: `radial-gradient(circle, ${isDark ? "#2c2c2c" : "#d1d5db"} 1px, transparent 1px)`,
        backgroundSize: "28px 28px",
      }}
      onWheel={handleWheel}
      onMouseDown={(e) => { isMouseDown.current = true; handlePanStart(e); }}
      onMouseUp={() => (isMouseDown.current = false)}
    >
      {/* top-left: canvas info */}
      <div
        className={`absolute top-3 left-4 z-20 flex items-center gap-3 border rounded-lg shadow-sm px-3 py-1.5 ${
          isDark ? "bg-[#232329] border-[#3c3c4a]" : "bg-white border-gray-200"
        }`}
      >
        <span className={`text-xs font-medium ${isDark ? "text-[#9b9ba8]" : "text-gray-500"}`}>
          {canvasName}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? "bg-[#3c3c4a] text-[#9b9ba8]" : "bg-gray-100 text-gray-500"}`}>
          {username ? username : "Anonymous"}
        </span>
        {canEdit && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500">
            Editing
          </span>
        )}
        {!username && (
          <button
            onClick={() => navigate("/")}
            className="text-xs text-blue-500 hover:underline"
          >
            Sign in
          </button>
        )}
      </div>

      {/* mode toolbar — only in edit mode */}
      {canEdit && (
        <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 border rounded-lg shadow-sm p-1 ${isDark ? "bg-[#232329] border-[#3c3c4a]" : "bg-white border-gray-200"}`}>
          {(["select", "hand", "text", "erase"] as Mode[]).map((m) => (
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
            </button>
          ))}
        </div>
      )}

      {/* top-right */}
      <div className="absolute top-3 right-4 z-20 flex items-center gap-2">
        <ThemeToggleButton />
      </div>

      {/* canvas */}
      <div
        ref={canvasRef}
        className={`w-full h-full ${canEdit && mode === "text" ? "cursor-crosshair" : canEdit && mode === "hand" ? "cursor-grab" : ""}`}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "0 0",
        }}
        onClick={handleCanvasClick}
      >
        {nodes.map((node) => (
          <FloatingNode
            key={node.id}
            id={node.id}
            x={node.x}
            y={node.y}
            content={node.content}
            onChange={canEdit ? updateNode : () => {}}
            onMove={canEdit ? moveNode : () => {}}
            onSaveSelection={() => {}}
            onDelete={canEdit ? deleteNode : () => {}}
            onRun={() => {}}
            mode={canEdit ? mode : "select"}
            isMouseDown={isMouseDown}
            isDark={isDark}
          />
        ))}
      </div>

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

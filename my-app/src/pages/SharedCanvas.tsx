import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import FloatingNode from "@/components/FloatingNode";
import { ThemeToggleButton } from "@/components/ThemeToggle";
import socket from "@/lib/socket";

interface Node {
  id: string;
  x: number;
  y: number;
  content: string;
}

export default function SharedCanvas() {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [nodes, setNodes] = useState<Node[]>([]);
  const [canvasName, setCanvasName] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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
      {/* top bar */}
      <div
        className={`absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 border rounded-lg shadow-sm px-3 py-1.5 ${
          isDark ? "bg-[#232329] border-[#3c3c4a]" : "bg-white border-gray-200"
        }`}
      >
        <span className={`text-xs font-medium ${isDark ? "text-[#9b9ba8]" : "text-gray-500"}`}>
          {canvasName}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? "bg-[#3c3c4a] text-[#9b9ba8]" : "bg-gray-100 text-gray-500"}`}>
          {username ? username : "Anonymous"}
        </span>
        {!username && (
          <button
            onClick={() => navigate("/")}
            className="text-xs text-blue-500 hover:underline"
          >
            Sign in
          </button>
        )}
      </div>

      {/* top-right */}
      <div className="absolute top-3 right-4 z-20 flex items-center gap-2">
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
      >
        {nodes.map((node) => (
          <FloatingNode
            key={node.id}
            id={node.id}
            x={node.x}
            y={node.y}
            content={node.content}
            onChange={() => {}}
            onMove={() => {}}
            onSaveSelection={() => {}}
            onDelete={() => {}}
            onRun={() => {}}
            mode="select"
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

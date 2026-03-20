import { useState, useRef, useEffect } from "react";
import FloatingNode from "./components/FloatingNode";
import OutputBubble from "./components/OutputBubble";
import "./App.css";

interface Node {
  id: number;
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

export default function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const nextId = useRef(1);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const lastSelection = useRef<{
    content: string;
    el: HTMLElement;
  } | null>(null);
  const spaceHeld = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // keep refs in sync so pan/zoom handlers always see latest values
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

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

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== canvasRef.current) return;
    const id = nextId.current++;
    setNodes((prev) => [
      ...prev,
      {
        id,
        x: (e.clientX - offset.x) / scale,
        y: (e.clientY - offset.y) / scale,
        content: "",
      },
    ]);
  }

  // zoom toward screen center
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

  // pan with Space + left-click drag, or middle-click anywhere
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

      if (!code) return;

      try {
        const res = await fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, language: "javascript" }),
        });
        const data = await res.json();
        setOutputs((prev) => [
          ...prev,
          {
            id: nextId.current++,
            x,
            y,
            text: data.output,
            isError: !!data.error,
          },
        ]);
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

  function updateNode(id: number, content: string) {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n)));
  }

  function moveNode(id: number, x: number, y: number) {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  }

  function saveSelection(content: string, el: HTMLElement) {
    lastSelection.current = { content, el };
  }

  function dismissOutput(id: number) {
    setOutputs((prev) => prev.filter((o) => o.id !== id));
  }

  function moveOutput(id: number, x: number, y: number) {
    setOutputs((prev) => prev.map((o) => (o.id === id ? { ...o, x, y } : o)));
  }

  function deleteNode(id: number) {
    setNodes((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-white select-none cursor-crosshair"
      style={{
        backgroundImage:
          "radial-gradient(circle, #d1d5db 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
      onMouseDown={handlePanStart}
      onWheel={handleWheel}
    >
      <div
        ref={canvasRef}
        className="w-full h-full"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "0 0",
        }}
        onClick={handleCanvasClick}
      >
        {/* hint */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-300 text-sm font-mono select-none">
              click anywhere to start
            </p>
          </div>
        )}

        {/* toolbar */}
        <div className="absolute top-4 left-4 z-10 pointer-events-none">
          <span className="text-xs font-semibold text-gray-300 tracking-widest uppercase">
            free-form
          </span>
        </div>

        <div className="absolute top-4 right-4 z-10 pointer-events-none">
          <span className="text-xs text-gray-300 font-mono">
            select code + ctrl+enter to run
          </span>
        </div>

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
            onDismiss={dismissOutput}
            onMove={moveOutput}
          />
        ))}
      </div>

      {/* zoom controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-white border border-gray-200 rounded-lg shadow-sm px-2 py-1">
        <button
          className="text-gray-400 hover:text-gray-700 text-sm font-mono w-6 h-6 flex items-center justify-center transition-colors"
          onClick={zoomOut}
        >
          −
        </button>
        <span className="text-xs font-mono text-gray-400 w-10 text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          className="text-gray-400 hover:text-gray-700 text-sm font-mono w-6 h-6 flex items-center justify-center transition-colors"
          onClick={zoomIn}
        >
          +
        </button>
      </div>
    </div>
  );
}

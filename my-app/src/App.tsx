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
  const lastSelection = useRef<{
    content: string;
    el: HTMLTextAreaElement;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== canvasRef.current) return;
    const id = nextId.current++;
    setNodes((prev) => [
      ...prev,
      { id, x: e.clientX, y: e.clientY, content: "" },
    ]);
  }

  useEffect(() => {
    async function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey && e.key === "Enter")) return;

      let code = "";
      let x = 200;
      let y = 100;

      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement) {
        const { selectionStart, selectionEnd, value } = active;
        code = value.substring(selectionStart, selectionEnd).trim();
        if (!code) code = value.trim();
        const rect = active.getBoundingClientRect();
        x = rect.right + 20;
        y = rect.top;
      } else if (lastSelection.current) {
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

  function saveSelection(content: string, el: HTMLTextAreaElement) {
    lastSelection.current = { content, el };
  }

  function dismissOutput(id: number) {
    setOutputs((prev) => prev.filter((o) => o.id !== id));
  }

  function deleteNode(id: number) {
    setNodes((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div
      ref={canvasRef}
      className="relative w-screen h-screen overflow-hidden bg-white select-none cursor-crosshair"
      style={{
        backgroundImage:
          "radial-gradient(circle, #d1d5db 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
      onClick={handleCanvasClick}
    >
      {/* hint */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-gray-300 text-sm font-mono select-none">
            click anywhere to start typing
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
        />
      ))}
    </div>
  );
}

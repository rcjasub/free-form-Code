import { useState, useRef } from "react";

interface Props {
  id: number;
  x: number;
  y: number;
  onDrag: (id: number, x: number, y: number) => void;
}

export default function CodeBlock({ id, x, y, onDrag }: Props) {
  const [code, setCode] = useState('console.log("Hello from block!")');
  const [output, setOutput] = useState("");
  const [isError, setIsError] = useState(false);
  const [running, setRunning] = useState(false);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true;
    offset.current = { x: e.clientX - x, y: e.clientY - y };

    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      onDrag(id, e.clientX - offset.current.x, e.clientY - offset.current.y);
    }

    function onMouseUp() {
      dragging.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  async function runCode() {
    setRunning(true);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language: "javascript" }),
      });
      const data = await res.json();
      setOutput(data.output);
      setIsError(!!data.error);
    } catch {
      setOutput("Failed to reach server");
      setIsError(true);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      className="absolute w-80 rounded-xl shadow-xl border border-gray-200 bg-white flex flex-col overflow-hidden"
      style={{ left: x, top: y }}
    >
      {/* drag handle */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onMouseDown}
      >
        <div className="flex gap-1">
          <span className="w-3 h-3 rounded-full bg-red-400" />
          <span className="w-3 h-3 rounded-full bg-yellow-400" />
          <span className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <span className="text-xs text-gray-400 font-mono">javascript</span>
      </div>

      {/* editor */}
      <textarea
        className="w-full p-3 font-mono text-sm bg-gray-950 text-green-400 resize-none outline-none leading-relaxed"
        rows={5}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        spellCheck={false}
      />

      {/* run button */}
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-200">
        <button
          className="w-full py-1.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50"
          onClick={runCode}
          disabled={running}
        >
          {running ? "Running..." : "▶ Run"}
        </button>
      </div>

      {/* output */}
      {output && (
        <div
          className={`px-3 py-2 font-mono text-xs whitespace-pre-wrap border-t ${isError ? "bg-red-50 text-red-600 border-red-200" : "bg-gray-950 text-gray-300 border-gray-800"}`}
        >
          {output}
        </div>
      )}
    </div>
  );
}

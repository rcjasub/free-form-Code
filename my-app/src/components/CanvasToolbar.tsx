import { motion } from "motion/react";
import { Circle, Diamond, Lock, LockOpen, MoveUpRight, Pencil, Square } from "lucide-react";
import type { Mode } from "../App";
import { TOOL_KEYS } from "../lib/toolKeys";

const SVG = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

// Every tool, in toolbar order (the number keys follow it); a null entry
// draws a divider.
const TOOLS: ({ mode: Mode; title: string; icon: React.ReactNode } | null)[] = [
  {
    mode: "hand",
    title: "Hand",
    icon: (
      <svg {...SVG}>
        <path d="M18 11V8a2 2 0 0 0-4 0v3M14 11V6a2 2 0 0 0-4 0v5M10 11V8a2 2 0 0 0-4 0v8a6 6 0 0 0 12 0v-5a2 2 0 0 0-4 0v0" />
      </svg>
    ),
  },
  {
    mode: "select",
    title: "Select",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <path d="M1.5 1L6 12l2.2-3.8L12 6 1.5 1z" />
      </svg>
    ),
  },
  { mode: "rect", title: "Rectangle", icon: <Square size={14} /> },
  { mode: "diamond", title: "Diamond", icon: <Diamond size={14} /> },
  { mode: "ellipse", title: "Ellipse", icon: <Circle size={14} /> },
  { mode: "arrow", title: "Arrow", icon: <MoveUpRight size={14} /> },
  null,
  { mode: "draw", title: "Draw", icon: <Pencil size={14} /> },
  { mode: "text", title: "Text", icon: <span className="text-xs font-bold leading-none">T</span> },
  {
    mode: "erase",
    title: "Erase",
    icon: (
      <svg {...SVG}>
        <path d="M20 20H7L3 16l13-13 4 4-6.5 6.5" />
        <path d="M6.5 17.5l4-4" />
      </svg>
    ),
  },
];

// the number key a tool has, if any
const numberKey = (mode: Mode) => TOOL_KEYS[mode]?.find((k) => /\d/.test(k));

// The mode toolbar shared by the main canvas and the shared-link page, with
// the run hint under it.
export default function CanvasToolbar({
  activeTool,
  onSelect,
  toolLocked,
  onToggleLock,
}: {
  activeTool: Mode;
  onSelect: (mode: Mode) => void;
  toolLocked: boolean;
  onToggleLock: () => void;
}) {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-0.5 rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.12)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.6)] p-1 bg-white dark:bg-[#232329]">
        <button
          onClick={onToggleLock}
          title={toolLocked ? "Unlock tool (Q): go back to select after each shape" : "Lock tool (Q): keep drawing shapes"}
          aria-pressed={toolLocked}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
            toolLocked
              ? "bg-[#4fb4f2]/15 text-[#1f7fb8] dark:bg-[#4fb4f2]/20 dark:text-[#4fb4f2]"
              : "text-gray-400 hover:text-gray-700 dark:text-[#9b9ba8] dark:hover:text-[#f5f5f5]"
          }`}
        >
          {toolLocked ? <Lock size={14} /> : <LockOpen size={14} />}
        </button>
        <div className="mx-1 h-5 w-px bg-gray-200 dark:bg-[#3c3c4a]" />
        {TOOLS.map((tool, i) =>
          tool ? (
            <button
              key={tool.mode}
              onClick={() => onSelect(tool.mode)}
              title={TOOL_KEYS[tool.mode] ? `${tool.title} — ${TOOL_KEYS[tool.mode]!.join(" or ")}` : tool.title}
              className={`relative w-8 h-8 flex items-center justify-center rounded transition-colors ${
                activeTool === tool.mode
                  ? "text-gray-800 dark:text-[#f5f5f5]"
                  : "text-gray-400 hover:text-gray-700 dark:text-[#9b9ba8] dark:hover:text-[#f5f5f5]"
              }`}
            >
              {/* One highlight shared by every button (same layoutId), so
                  switching tools slides it over instead of jumping. */}
              {activeTool === tool.mode && (
                <motion.span
                  layoutId="toolbar-active"
                  className="absolute inset-0 rounded bg-gray-100 dark:bg-[#3c3c4a]"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative">{tool.icon}</span>
              {numberKey(tool.mode) && (
                <span className="absolute right-0.5 bottom-0 text-[8px] leading-none opacity-60">{numberKey(tool.mode)}</span>
              )}
            </button>
          ) : (
            <div key={`divider-${i}`} className="mx-1 h-5 w-px bg-gray-200 dark:bg-[#3c3c4a]" />
          ),
        )}
      </div>
      <span className="font-canvas text-[11px] pointer-events-none select-none text-gray-400 dark:text-gray-500">
        select code + ctrl+enter to run
      </span>
    </div>
  );
}

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { KIND_STYLE } from "../lib/architecturePlacement";
import { AUTO, fillColor, themeColor, TRANSPARENT } from "../lib/colors";
import { KIND_NAMES } from "../lib/sectionDetails";
import { KIND_ICONS } from "../lib/kindIcons";
import type { SectionKind } from "../lib/shapes";

interface Props {
  // the kinds of AI-diagram boxes on the canvas
  kinds: SectionKind[];
  // the tile shapes with a meaning of their own among them
  shapes?: ("ellipse" | "diamond")[];
  isDark: boolean;
  // arrow labels: all shown, or only on hover and for what's lit
  allLabels: boolean;
  onToggleLabels: () => void;
  // arrows inside a group: always shown, or only for what's lit
  allInner: boolean;
  onToggleInner: () => void;
}

// Two choices side by side, the chosen one raised.
function Choice({ label, value, options, onToggle }: { label: string; value: boolean; options: [string, string]; onToggle: () => void }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="flex rounded-md bg-gray-100 p-0.5 dark:bg-[#2e2e3a]" role="radiogroup" aria-label={label}>
        {options.map((name, i) => {
          const on = value === (i === 1);
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => !on && onToggle()}
              className={`rounded px-1.5 py-0.5 ${on ? "bg-white text-gray-900 shadow-sm dark:bg-[#3a3a48] dark:text-white" : "text-gray-500 dark:text-gray-400"}`}
            >
              {name}
            </button>
          );
        })}
      </span>
    </li>
  );
}

const OPEN_STORAGE = "free-form:legend-open";

function storedOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_STORAGE) !== "false";
  } catch {
    return true;
  }
}

// What an AI diagram's colors mean, for the kinds on this canvas: a swatch
// drawn the way those boxes are (same line, fill and dash), and a group's
// frame. It can fold down to its title, and stays folded.
// What a tile's shape says about its job.
const SHAPE_MEANINGS = {
  ellipse: { name: "Where it starts", path: <circle cx="10" cy="6" r="5" /> },
  diamond: { name: "Passes traffic on", path: <path d="M10 1 L16 6 L10 11 L4 6 Z" /> },
};

export default function DiagramLegend({ kinds, shapes = [], isDark, allLabels, onToggleLabels, allInner, onToggleInner }: Props) {
  const [open, setOpen] = useState(storedOpen);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_STORAGE, String(next));
    } catch {
      // not remembered, that's all
    }
  }

  return (
    <div
      className="w-64 rounded-lg bg-white px-3 py-2 text-xs text-gray-700 shadow-[0_2px_8px_rgba(0,0,0,0.12)] dark:bg-[#232329] dark:text-gray-300 dark:shadow-[0_2px_10px_rgba(0,0,0,0.6)]"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 font-medium text-gray-500 dark:text-gray-400"
      >
        Diagram key
        {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1" aria-label="Diagram key">
          {kinds.map((kind) => {
            const look = KIND_STYLE[kind];
            const Icon = KIND_ICONS[kind];
            return (
              <li key={kind} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-3 w-5 shrink-0 rounded-[3px] border-[1.5px]"
                  style={{
                    borderColor: themeColor(look.stroke, isDark),
                    borderStyle: look.strokeStyle === "dashed" ? "dashed" : "solid",
                    background: look.fill === TRANSPARENT ? "transparent" : fillColor(look.fill, isDark),
                  }}
                />
                <Icon aria-hidden className="size-3.5 shrink-0" style={{ color: themeColor(AUTO, isDark) }} />
                {KIND_NAMES[kind]}
              </li>
            );
          })}
          <li className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <span aria-hidden className="h-3 w-5 shrink-0 rounded-[3px] border-[1.5px] border-gray-400" />
            {/* where the others have their icon, so the names line up */}
            <span aria-hidden className="size-3.5 shrink-0" />
            Group
          </li>
          {shapes.map((shape) => (
            <li key={shape} className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <svg aria-hidden viewBox="0 0 20 12" className="h-3 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5}>
                {SHAPE_MEANINGS[shape].path}
              </svg>
              <span aria-hidden className="size-3.5 shrink-0" />
              {SHAPE_MEANINGS[shape].name}
            </li>
          ))}
          <li aria-hidden className="!mt-1.5 border-t border-gray-100 dark:border-[#2e2e3a]" />
          <Choice label="Arrow labels" value={allLabels} options={["On hover", "All"]} onToggle={onToggleLabels} />
          <Choice label="Inside groups" value={allInner} options={["On click", "All"]} onToggle={onToggleInner} />
        </ul>
      )}
    </div>
  );
}

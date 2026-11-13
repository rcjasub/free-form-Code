import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { KIND_STYLE } from "../lib/architecturePlacement";
import { fillColor, themeColor, TRANSPARENT } from "../lib/colors";
import { KIND_NAMES } from "../lib/sectionDetails";
import { KIND_ICONS } from "../lib/kindIcons";
import type { SectionKind } from "../lib/shapes";

interface Props {
  // the kinds of AI-diagram boxes on the canvas
  kinds: SectionKind[];
  isDark: boolean;
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
// dashed frame. It can fold down to its title, and stays folded.
export default function DiagramLegend({ kinds, isDark }: Props) {
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
      className="absolute bottom-4 right-4 z-10 rounded-lg bg-white px-3 py-2 text-xs text-gray-700 shadow-[0_2px_8px_rgba(0,0,0,0.12)] dark:bg-[#232329] dark:text-gray-300 dark:shadow-[0_2px_10px_rgba(0,0,0,0.6)]"
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
                <Icon aria-hidden className="size-3.5 shrink-0" style={{ color: themeColor(look.stroke, isDark) }} />
                {KIND_NAMES[kind]}
              </li>
            );
          })}
          <li className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <span aria-hidden className="h-3 w-5 shrink-0 rounded-[3px] border-[1.5px] border-dashed border-gray-400" />
            {/* where the others have their icon, so the names line up */}
            <span aria-hidden className="size-3.5 shrink-0" />
            Group
          </li>
        </ul>
      )}
    </div>
  );
}

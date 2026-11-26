import { useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Play, Route, X } from "lucide-react";
import { motion } from "motion/react";
import { FoldBody, FoldChevron } from "./Fold";
import type { Flow } from "../lib/flows";

export interface FlowPosition {
  flow: number;
  step: number;
}

interface Props {
  flows: Flow[];
  // each section's title on the canvas, for "From → To"
  titleOf: (sectionId: string) => string;
  playing: FlowPosition | null;
  onPlay: (position: FlowPosition | null) => void;
}

const OPEN_STORAGE = "free-form:flows-open";

function storedOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_STORAGE) !== "false";
  } catch {
    return true;
  }
}

// The AI's key journeys through the diagram ("A user signs in"). Pick one
// and it plays step by step: the page lights each step's boxes and arrow
// (App), and this card tells the step, like a caption. ← and → step through
// it, Esc stops.
export function FlowList({ flows, onPlay }: Pick<Props, "flows" | "onPlay">) {
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
    <nav
      aria-label="Flows"
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
        <span className="flex items-center gap-1.5">
          <Route className="size-3.5" />
          How it works
        </span>
        <FoldChevron open={open} />
      </button>
      <FoldBody open={open}>
        <ul className="mt-1.5 space-y-0.5">
          {flows.map((flow, i) => (
            <li key={`${i}-${flow.title}`}>
              <button
                type="button"
                onClick={() => onPlay({ flow: i, step: 0 })}
                className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-gray-100 dark:hover:bg-[#2e2e3a]"
              >
                <Play className="size-3 shrink-0 text-gray-400 group-hover:text-[#4fb4f2]" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-gray-800 dark:text-gray-200">{flow.title}</span>
                <span className="shrink-0 text-gray-400">{flow.steps.length}</span>
              </button>
            </li>
          ))}
        </ul>
      </FoldBody>
    </nav>
  );
}

export function FlowPlayer({ flows, titleOf, playing, onPlay }: Props & { playing: FlowPosition }) {
  const flow = flows[playing.flow];
  const step = flow?.steps[playing.step];
  const last = flow ? flow.steps.length - 1 : 0;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true'], .cm-editor")) return;
      if (e.key === "ArrowRight" && playing.step < last) onPlay({ ...playing, step: playing.step + 1 });
      else if (e.key === "ArrowLeft" && playing.step > 0) onPlay({ ...playing, step: playing.step - 1 });
      else if (e.key === "Escape") onPlay(null);
      else return;
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [playing, last, onPlay]);

  if (!flow || !step) return null;
  const from = titleOf(step.from);
  const to = titleOf(step.to);

  return (
    <motion.section
      aria-label={`Flow: ${flow.title}`}
      className="absolute bottom-20 left-1/2 z-20 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl bg-white text-sm text-gray-800 shadow-[0_4px_18px_rgba(0,0,0,0.16)] dark:bg-[#232329] dark:text-gray-200 dark:shadow-[0_4px_18px_rgba(0,0,0,0.6)]"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <header className="flex items-center gap-2 px-4 pt-3">
        <Route className="size-4 shrink-0 text-[#4fb4f2]" />
        <h2 className="min-w-0 flex-1 truncate font-semibold text-gray-900 dark:text-white">{flow.title}</h2>
        {/* one dot per step: where you are in it */}
        <ol className="flex items-center gap-1" aria-label={`Step ${playing.step + 1} of ${flow.steps.length}`}>
          {flow.steps.map((_, i) => (
            <li key={i}>
              <button
                type="button"
                aria-label={`Step ${i + 1}`}
                onClick={() => onPlay({ ...playing, step: i })}
                className={`block h-1.5 rounded-full transition-all ${
                  i === playing.step ? "w-4 bg-[#4fb4f2]" : i < playing.step ? "w-1.5 bg-[#4fb4f2]/50" : "w-1.5 bg-gray-300 dark:bg-gray-600"
                }`}
              />
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => onPlay(null)}
          aria-label="Stop"
          className="-mr-1 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-[#2e2e3a] dark:hover:text-gray-200"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex items-start gap-3 px-4 pb-3 pt-2">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#4fb4f2] text-xs font-semibold text-white">
          {playing.step + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {from}
            {step.from !== step.to && (
              <>
                <ArrowRight className="size-3" />
                {to}
              </>
            )}
          </p>
          <p className="mt-0.5 leading-relaxed">{step.text}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 self-center">
          <button
            type="button"
            aria-label="Previous step"
            disabled={playing.step === 0}
            onClick={() => onPlay({ ...playing, step: playing.step - 1 })}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-[#2e2e3a]"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label={playing.step === last ? "Done" : "Next step"}
            onClick={() => onPlay(playing.step === last ? null : { ...playing, step: playing.step + 1 })}
            className="rounded-md bg-[#4fb4f2] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#3aa5e6]"
          >
            {playing.step === last ? "Done" : <ChevronRight className="size-4" />}
          </button>
        </div>
      </div>
    </motion.section>
  );
}
